"""
RESQNET AI — Live Data Manager
Central orchestrator for all three external data providers.
Each provider runs independently — a failure in one does not stop the others.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..db.models import (
    ExternalEvent, ExternalDataSource, IngestionLog, ProviderHealth, LatencyMetric, SessionLocal
)
from ..integrations import usgs, nasa_firms, open_meteo
from .data_normalizer import normalize_event
from .data_latency import compute_latency_metrics

logger = logging.getLogger(__name__)

# SSE event bus — subscribers receive live updates
_sse_subscribers: List[Any] = []


def add_sse_subscriber(queue: Any):
    _sse_subscribers.append(queue)


def remove_sse_subscriber(queue: Any):
    try:
        _sse_subscribers.remove(queue)
    except ValueError:
        pass


def _broadcast_event(event_data: Dict[str, Any]):
    """Broadcast a new event to all SSE subscribers."""
    dead = []
    for q in list(_sse_subscribers):
        try:
            q.put_nowait(event_data)
        except Exception:
            dead.append(q)
    for q in dead:
        remove_sse_subscriber(q)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _upsert_provider_health(
    db: Session,
    provider_id: str,
    provider_name: str,
    success: bool,
    error_message: Optional[str],
    fetch_duration_ms: Optional[float],
    events_new: int,
    last_event_time: Optional[datetime],
    avg_detection_delay: Optional[float],
    latest_detection_delay: Optional[float],
):
    ph = db.query(ProviderHealth).filter(ProviderHealth.provider_id == provider_id).first()
    now = _utc_now()
    if ph is None:
        ph = ProviderHealth(provider_id=provider_id, provider_name=provider_name)
        db.add(ph)

    ph.provider_name = provider_name
    ph.last_fetch_at = now

    if success:
        ph.status = "ok"
        ph.last_success_at = now
        ph.last_error_message = None
    else:
        ph.status = "error"
        ph.last_error_at = now
        ph.last_error_message = error_message
        ph.total_errors = (ph.total_errors or 0) + 1

    if fetch_duration_ms is not None:
        prev_avg = ph.avg_fetch_duration_ms or fetch_duration_ms
        ph.avg_fetch_duration_ms = (prev_avg * 0.8 + fetch_duration_ms * 0.2)
        ph.latest_fetch_duration_ms = fetch_duration_ms

    if events_new > 0:
        ph.total_events_received = (ph.total_events_received or 0) + events_new
        ph.total_events_today = (ph.total_events_today or 0) + events_new

    if last_event_time:
        ph.last_event_time = last_event_time

    if latest_detection_delay is not None:
        prev = ph.avg_ingestion_delay_s or latest_detection_delay
        ph.avg_ingestion_delay_s = (prev * 0.8 + latest_detection_delay * 0.2)
        ph.latest_ingestion_delay_s = latest_detection_delay

    db.commit()


def _log_ingestion(
    db: Session,
    provider_id: str,
    success: bool,
    error_message: Optional[str],
    events_fetched: int,
    events_new: int,
    events_duplicate: int,
    events_rejected: int,
    fetch_duration_ms: Optional[float],
    total_duration_ms: Optional[float],
):
    log = IngestionLog(
        provider_id=provider_id,
        run_at=_utc_now(),
        success=success,
        error_message=error_message,
        events_fetched=events_fetched,
        events_new=events_new,
        events_duplicate=events_duplicate,
        events_rejected=events_rejected,
        fetch_duration_ms=fetch_duration_ms,
        total_duration_ms=total_duration_ms,
    )
    db.add(log)
    db.commit()


def _persist_events(
    db: Session,
    provider_id: str,
    raw_events: List[Dict[str, Any]],
    received_at: datetime,
) -> Dict[str, int]:
    """
    Normalize and persist events, skipping duplicates.
    Returns counts: new, duplicate, rejected.
    """
    new_count = dup_count = rejected_count = 0
    broadcast_events = []

    for raw in raw_events:
        normalized = normalize_event(provider_id, raw, received_at)
        if normalized is None:
            rejected_count += 1
            continue

        # Validate essential fields
        if not normalized.get("external_id"):
            rejected_count += 1
            continue

        # Duplicate check — if already in DB, skip
        existing = (
            db.query(ExternalEvent)
            .filter(
                ExternalEvent.provider_id == normalized["provider_id"],
                ExternalEvent.external_id == normalized["external_id"],
            )
            .first()
        )
        if existing is not None:
            dup_count += 1
            continue

        # Create DB record
        ev = ExternalEvent(**normalized)
        db.add(ev)
        try:
            db.flush()
            new_count += 1
            broadcast_events.append({
                "type": "new_external_event",
                "provider_id": provider_id,
                "event_id": ev.id,
                "external_id": ev.external_id,
                "category": ev.category,
                "title": ev.title,
                "location_name": ev.location_name,
                "latitude": ev.latitude,
                "longitude": ev.longitude,
                "severity": ev.severity,
                "event_time": ev.event_time.isoformat() if ev.event_time else None,
                "received_at": ev.received_at.isoformat() if ev.received_at else None,
                "event_detection_delay_s": ev.event_detection_delay_s,
                "verification_status": ev.verification_status,
            })
        except Exception as e:
            db.rollback()
            logger.warning("Failed to persist event %s/%s: %s", provider_id, normalized.get("external_id"), e)
            rejected_count += 1
            continue

    db.commit()

    # Broadcast new events to SSE subscribers
    for ev_data in broadcast_events:
        _broadcast_event(ev_data)

    return {"new": new_count, "duplicate": dup_count, "rejected": rejected_count}


def run_usgs_ingestion(db: Optional[Session] = None) -> Dict[str, Any]:
    """Run a single USGS ingestion cycle."""
    own_session = db is None
    if own_session:
        db = SessionLocal()

    run_start = _utc_now()
    result = {"ok": False, "provider_id": "usgs"}

    try:
        fetch_result = usgs.fetch_earthquakes(min_magnitude=2.5, limit=100)
        received_at = _utc_now()
        fetch_duration_ms = fetch_result.get("fetch_duration_ms")

        if not fetch_result["ok"]:
            error_msg = fetch_result.get("error", "Unknown error")
            _log_ingestion(db, "usgs", False, error_msg, 0, 0, 0, 0, fetch_duration_ms, None)
            _upsert_provider_health(db, "usgs", usgs.PROVIDER_NAME, False, error_msg, fetch_duration_ms, 0, None, None, None)
            result["error"] = error_msg
            return result

        raw_events = fetch_result.get("events", [])
        counts = _persist_events(db, "usgs", raw_events, received_at)

        run_end = _utc_now()
        total_ms = (run_end - run_start).total_seconds() * 1000

        last_event_time = None
        latest_delay = None
        if raw_events:
            et = raw_events[0].get("event_time")
            if et and hasattr(et, "isoformat"):
                last_event_time = et.replace(tzinfo=None) if et.tzinfo else et
            delays = [
                (received_at.replace(tzinfo=None) - et.replace(tzinfo=None)).total_seconds()
                for e in raw_events
                if (et := e.get("event_time")) and hasattr(et, "isoformat")
            ]
            if delays:
                latest_delay = delays[0]

        _log_ingestion(
            db, "usgs", True, None,
            len(raw_events), counts["new"], counts["duplicate"], counts["rejected"],
            fetch_duration_ms, total_ms
        )
        _upsert_provider_health(
            db, "usgs", usgs.PROVIDER_NAME, True, None, fetch_duration_ms,
            counts["new"], last_event_time, latest_delay, latest_delay
        )

        # Record latency metric
        lm = LatencyMetric(
            provider_id="usgs",
            measured_at=run_end,
            ingestion_delay_s=latest_delay,
            fetch_duration_ms=fetch_duration_ms,
            events_ingested=counts["new"],
        )
        db.add(lm)
        db.commit()

        result.update({"ok": True, "events_fetched": len(raw_events), "events_new": counts["new"]})

    except Exception as e:
        logger.exception("USGS ingestion cycle failed: %s", e)
        try:
            _log_ingestion(db, "usgs", False, str(e), 0, 0, 0, 0, None, None)
            _upsert_provider_health(db, "usgs", usgs.PROVIDER_NAME, False, str(e), None, 0, None, None, None)
        except Exception:
            pass
        result["error"] = str(e)
    finally:
        if own_session:
            db.close()

    return result


def run_firms_ingestion(db: Optional[Session] = None) -> Dict[str, Any]:
    """Run a single NASA FIRMS ingestion cycle."""
    own_session = db is None
    if own_session:
        db = SessionLocal()

    run_start = _utc_now()
    result = {"ok": False, "provider_id": "nasa_firms"}

    try:
        # Try VIIRS first, fall back to MODIS
        fetch_result = nasa_firms.fetch_firms_data(source="VIIRS_SNPP_NRT", day_range=1)
        if not fetch_result["ok"] and "authentication" not in fetch_result.get("error", "").lower():
            fetch_result = nasa_firms.fetch_firms_data(source="MODIS_NRT", day_range=1)

        received_at = _utc_now()
        fetch_duration_ms = fetch_result.get("fetch_duration_ms")

        if not fetch_result["ok"]:
            error_msg = fetch_result.get("error", "Unknown error")
            _log_ingestion(db, "nasa_firms", False, error_msg, 0, 0, 0, 0, fetch_duration_ms, None)
            _upsert_provider_health(db, "nasa_firms", nasa_firms.PROVIDER_NAME, False, error_msg, fetch_duration_ms, 0, None, None, None)
            result["error"] = error_msg
            return result

        raw_events = fetch_result.get("events", [])
        counts = _persist_events(db, "nasa_firms", raw_events, received_at)

        run_end = _utc_now()
        total_ms = (run_end - run_start).total_seconds() * 1000

        _log_ingestion(
            db, "nasa_firms", True, None,
            len(raw_events), counts["new"], counts["duplicate"], counts["rejected"],
            fetch_duration_ms, total_ms
        )
        _upsert_provider_health(
            db, "nasa_firms", nasa_firms.PROVIDER_NAME, True, None, fetch_duration_ms,
            counts["new"], None, None, None
        )

        lm = LatencyMetric(
            provider_id="nasa_firms",
            measured_at=run_end,
            fetch_duration_ms=fetch_duration_ms,
            events_ingested=counts["new"],
        )
        db.add(lm)
        db.commit()

        result.update({"ok": True, "events_fetched": len(raw_events), "events_new": counts["new"]})

    except Exception as e:
        logger.exception("NASA FIRMS ingestion cycle failed: %s", e)
        try:
            _log_ingestion(db, "nasa_firms", False, str(e), 0, 0, 0, 0, None, None)
            _upsert_provider_health(db, "nasa_firms", nasa_firms.PROVIDER_NAME, False, str(e), None, 0, None, None, None)
        except Exception:
            pass
        result["error"] = str(e)
    finally:
        if own_session:
            db.close()

    return result


def run_weather_ingestion(db: Optional[Session] = None) -> Dict[str, Any]:
    """Run a single Open-Meteo ingestion cycle."""
    own_session = db is None
    if own_session:
        db = SessionLocal()

    run_start = _utc_now()
    result = {"ok": False, "provider_id": "open_meteo"}

    try:
        # Fetch weather for configured monitoring regions
        all_results = open_meteo.fetch_all_regions()
        received_at = _utc_now()

        all_events = []
        total_duration = 0.0
        any_error = None

        for fetch_result in all_results:
            if fetch_result.get("ok"):
                all_events.extend(fetch_result.get("events", []))
                total_duration += fetch_result.get("fetch_duration_ms", 0) or 0
            else:
                any_error = fetch_result.get("error")

        counts = _persist_events(db, "open_meteo", all_events, received_at)
        run_end = _utc_now()
        total_ms = (run_end - run_start).total_seconds() * 1000

        success = len(all_events) > 0 or any_error is None
        _log_ingestion(
            db, "open_meteo", success, any_error,
            len(all_events), counts["new"], counts["duplicate"], counts["rejected"],
            total_duration / max(len(all_results), 1), total_ms
        )
        _upsert_provider_health(
            db, "open_meteo", open_meteo.PROVIDER_NAME, success, any_error,
            total_duration, counts["new"], None, None, None
        )

        lm = LatencyMetric(
            provider_id="open_meteo",
            measured_at=run_end,
            fetch_duration_ms=total_duration,
            events_ingested=counts["new"],
        )
        db.add(lm)
        db.commit()

        result.update({"ok": True, "events_fetched": len(all_events), "events_new": counts["new"]})

    except Exception as e:
        logger.exception("Open-Meteo ingestion cycle failed: %s", e)
        try:
            _log_ingestion(db, "open_meteo", False, str(e), 0, 0, 0, 0, None, None)
            _upsert_provider_health(db, "open_meteo", open_meteo.PROVIDER_NAME, False, str(e), None, 0, None, None, None)
        except Exception:
            pass
        result["error"] = str(e)
    finally:
        if own_session:
            db.close()

    return result


def run_all_providers() -> Dict[str, Any]:
    """
    Run all three providers independently.
    A failure in one does NOT stop the others.
    """
    results = {}
    for name, fn in [
        ("usgs", run_usgs_ingestion),
        ("nasa_firms", run_firms_ingestion),
        ("open_meteo", run_weather_ingestion),
    ]:
        try:
            results[name] = fn()
        except Exception as e:
            logger.exception("Provider %s critically failed: %s", name, e)
            results[name] = {"ok": False, "provider_id": name, "error": str(e)}
    return results
