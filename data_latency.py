"""
RESQNET AI — Data Latency Service
Computes and formats all latency metrics for events and provider health.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple


def _to_utc_naive(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def compute_latency_metrics(
    event_time: Optional[datetime],
    source_published_at: Optional[datetime],
    source_updated_at: Optional[datetime],
    received_at: Optional[datetime],
    analyzed_at: Optional[datetime] = None,
    displayed_at: Optional[datetime] = None,
) -> Dict[str, Optional[float]]:
    """
    Compute all latency metrics (in seconds) for a single event.
    All inputs should be naive UTC datetimes (or timezone-aware — we convert).
    """
    ev = _to_utc_naive(event_time)
    sp = _to_utc_naive(source_published_at)
    su = _to_utc_naive(source_updated_at)
    rc = _to_utc_naive(received_at)
    an = _to_utc_naive(analyzed_at)
    di = _to_utc_naive(displayed_at)

    def delay(later, earlier) -> Optional[float]:
        if later is None or earlier is None:
            return None
        d = (later - earlier).total_seconds()
        return max(0.0, d)

    return {
        "source_publication_delay_s": delay(rc, sp),
        "event_detection_delay_s": delay(rc, ev),
        "ai_processing_delay_s": delay(an, rc),
        "frontend_delivery_delay_s": delay(di, rc),
    }


def latency_label(seconds: Optional[float]) -> str:
    """Return the RESQNET display label for a latency in seconds."""
    if seconds is None:
        return "SOURCE PUBLICATION TIME UNAVAILABLE"
    if seconds <= 30:
        return "Very recent"
    if seconds <= 60:
        return "Recent"
    if seconds <= 300:
        return "Slight delay"
    if seconds <= 900:
        return "Delayed"
    if seconds <= 3600:
        return "Significantly delayed"
    return "Stale"


def latency_color(seconds: Optional[float]) -> str:
    """Return a CSS hex color for the latency value."""
    if seconds is None:
        return "#8294AA"  # grey — unknown
    if seconds <= 30:
        return "#27D99A"   # green
    if seconds <= 60:
        return "#00D9FF"   # cyan
    if seconds <= 300:
        return "#FFC247"   # yellow
    if seconds <= 900:
        return "#FF8A32"   # orange
    return "#FF354B"       # red


def format_latency(seconds: Optional[float]) -> str:
    """Human-readable latency string, e.g. '12 sec', '4 min'."""
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"{int(seconds)} sec"
    if seconds < 3600:
        return f"{int(seconds // 60)} min {int(seconds % 60)} sec"
    hours = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    return f"{hours}h {mins}m"


def event_latency_payload(event) -> Dict[str, Any]:
    """
    Build the full latency payload for an ExternalEvent ORM object.
    This is attached to API responses so the frontend can display exact delays.
    """
    ev_time = event.event_time
    sp_time = event.source_published_at
    rc_time = event.received_at
    an_time = event.analyzed_at

    metrics = compute_latency_metrics(
        event_time=ev_time,
        source_published_at=sp_time,
        source_updated_at=event.source_updated_at,
        received_at=rc_time,
        analyzed_at=an_time,
        displayed_at=event.displayed_at,
    )

    spd = metrics["source_publication_delay_s"]
    edd = metrics["event_detection_delay_s"]
    apd = metrics["ai_processing_delay_s"]
    fdd = metrics["frontend_delivery_delay_s"]

    return {
        "event_time_utc": ev_time.isoformat() if ev_time else None,
        "source_published_at_utc": sp_time.isoformat() if sp_time else None,
        "source_updated_at_utc": event.source_updated_at.isoformat() if event.source_updated_at else None,
        "received_at_utc": rc_time.isoformat() if rc_time else None,
        "analyzed_at_utc": an_time.isoformat() if an_time else None,
        "displayed_at_utc": event.displayed_at.isoformat() if event.displayed_at else None,
        "source_publication_delay_s": spd,
        "event_detection_delay_s": edd,
        "ai_processing_delay_s": apd,
        "frontend_delivery_delay_s": fdd,
        "source_publication_delay_label": latency_label(spd) if sp_time else "SOURCE PUBLICATION TIME UNAVAILABLE",
        "event_detection_delay_label": latency_label(edd),
        "source_publication_delay_formatted": format_latency(spd),
        "event_detection_delay_formatted": format_latency(edd),
        "ai_processing_delay_formatted": format_latency(apd),
        "latency_color": latency_color(edd),
    }
