"""
RESQNET AI — API v1 Endpoints
Includes original incident endpoints plus all new external data/feed endpoints.
"""

import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import services
from ...db import models as db_models
from ...utils import duplicate, priority
from . import models as api_models
from ...services import live_data_manager, ingestion_scheduler
from ...services.data_latency import event_latency_payload, latency_label, latency_color, format_latency
from ...integrations import nasa_firms as firms_module, usgs as usgs_module, open_meteo as om_module

router = APIRouter()


# ── DB session dependency ────────────────────────────────────────────
def get_db():
    db = db_models.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Ensure DB schema on startup
from ...db.models import init_db as db_init
db_init()


# ════════════════════════════════════════════════════════════════════
# ORIGINAL INCIDENT ENDPOINTS — unchanged behaviour
# ════════════════════════════════════════════════════════════════════

@router.post("/incidents/", response_model=api_models.IncidentOut, status_code=status.HTTP_201_CREATED)
def create_incident(inc: api_models.IncidentCreate, db: Session = Depends(get_db)):
    analysis = services.analyze_report(inc.raw_report, inc.latitude, inc.longitude, inc.location_name)
    dup_ids = duplicate.find_duplicates(db, analysis)
    is_duplicate = len(dup_ids) > 0
    duplicate_of = dup_ids[0] if is_duplicate else None

    score, label, explanation = priority.score_priority(
        analysis.get("category", ""),
        analysis.get("immediate_threats"),
        analysis.get("people_affected"),
        analysis.get("vulnerable_people"),
    )

    incident = db_models.Incident(
        raw_report=inc.raw_report,
        category=analysis.get("category"),
        description=analysis.get("description"),
        location_name=analysis.get("location_name"),
        latitude=analysis.get("latitude"),
        longitude=analysis.get("longitude"),
        people_affected=analysis.get("people_affected"),
        vulnerable_people=analysis.get("vulnerable_people"),
        immediate_threats=analysis.get("immediate_threats"),
        required_resources=analysis.get("required_resources"),
        confidence=analysis.get("confidence"),
        recommended_urgency=analysis.get("recommended_urgency"),
        priority_score=score,
        priority_label=label,
        priority_explanation=explanation,
        is_duplicate=is_duplicate,
        duplicate_of=duplicate_of,
        is_simulation=False,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return services.incident_to_out(incident)


@router.get("/incidents/", response_model=List[api_models.IncidentOut])
def list_incidents(status: str = None, priority: str = None, db: Session = Depends(get_db)):
    query = db.query(db_models.Incident)
    if status:
        query = query.filter(db_models.Incident.status == status)
    if priority:
        query = query.filter(db_models.Incident.priority_label == priority)
    return [services.incident_to_out(i) for i in query.all()]


@router.patch("/incidents/{incident_id}", response_model=api_models.IncidentOut)
def update_incident(incident_id: int, update: api_models.IncidentUpdate, db: Session = Depends(get_db)):
    incident = db.query(db_models.Incident).filter(db_models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    for attr, value in update.dict(exclude_unset=True).items():
        setattr(incident, attr, value)
    db.commit()
    db.refresh(incident)
    return services.incident_to_out(incident)


@router.post("/simulation/trigger", response_model=List[api_models.IncidentOut])
def trigger_simulation(trigger: api_models.SimulationTrigger, db: Session = Depends(get_db)):
    try:
        incidents = services.run_simulation(trigger.scenario, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [services.incident_to_out(i) for i in incidents]


@router.get("/resources/{category}", response_model=api_models.ResourceRecommendation)
def get_resources(category: str):
    mapping = {
        "flood": ["Rescue boats", "Life jackets", "Medical team"],
        "fire": ["Fire engine", "Protective gear", "Medical team"],
        "medical": ["Ambulance", "Paramedics", "First aid kits"],
        "earthquake": ["Search‑and‑rescue team", "Medical supplies", "Heavy‑crane"],
        "infrastructure": ["Repair crew", "Generators", "Spare parts"],
    }
    resources = mapping.get(category.lower(), [])
    return {"category": category, "resources": resources}


# ════════════════════════════════════════════════════════════════════
# HELPER — convert ExternalEvent ORM → dict for API responses
# ════════════════════════════════════════════════════════════════════

def _event_to_dict(ev: db_models.ExternalEvent) -> Dict[str, Any]:
    latency = event_latency_payload(ev)
    return {
        "id": ev.id,
        "provider_id": ev.provider_id,
        "external_id": ev.external_id,
        "category": ev.category,
        "title": ev.title,
        "description": ev.description,
        "location_name": ev.location_name,
        "latitude": ev.latitude,
        "longitude": ev.longitude,
        "severity": ev.severity,
        "verification_status": ev.verification_status,
        "source_url": ev.source_url,
        # USGS-specific
        "magnitude": ev.magnitude,
        "magnitude_type": ev.magnitude_type,
        "depth_km": ev.depth_km,
        "alert_level": ev.alert_level,
        "tsunami_flag": ev.tsunami_flag,
        # Fire-specific
        "brightness_kelvin": ev.brightness_kelvin,
        "fire_radiative_power_mw": ev.fire_radiative_power_mw,
        "confidence_label": ev.confidence_label,
        "satellite": ev.satellite,
        "instrument": ev.instrument,
        "day_night": ev.day_night,
        "source_dataset": ev.source_dataset,
        # Weather-specific
        "temperature_c": ev.temperature_c,
        "relative_humidity_pct": ev.relative_humidity_pct,
        "precipitation_mm": ev.precipitation_mm,
        "wind_speed_kmh": ev.wind_speed_kmh,
        "wind_direction_deg": ev.wind_direction_deg,
        "weather_code": ev.weather_code,
        "weather_description": ev.weather_description,
        "is_alert_candidate": ev.is_alert_candidate,
        "threshold_breaches": ev.threshold_breaches,
        # Timing & latency
        "latency": latency,
        "raw_metadata": ev.raw_metadata,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


# ════════════════════════════════════════════════════════════════════
# FEEDS / PROVIDER HEALTH
# ════════════════════════════════════════════════════════════════════

@router.get("/feeds/")
def list_feeds(db: Session = Depends(get_db)):
    """List all configured external data providers with health status."""
    providers = db.query(db_models.ProviderHealth).all()
    result = []
    for p in providers:
        result.append({
            "provider_id": p.provider_id,
            "provider_name": p.provider_name,
            "status": p.status,
            "enabled": True,
            "last_fetch_at": p.last_fetch_at.isoformat() if p.last_fetch_at else None,
            "last_success_at": p.last_success_at.isoformat() if p.last_success_at else None,
            "last_error_at": p.last_error_at.isoformat() if p.last_error_at else None,
            "last_error_message": p.last_error_message,
            "avg_ingestion_delay_s": p.avg_ingestion_delay_s,
            "latest_ingestion_delay_s": p.latest_ingestion_delay_s,
            "avg_fetch_duration_ms": p.avg_fetch_duration_ms,
            "latest_fetch_duration_ms": p.latest_fetch_duration_ms,
            "total_events_received": p.total_events_received,
            "total_errors": p.total_errors,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return result


@router.get("/feeds/health")
def feeds_health(db: Session = Depends(get_db)):
    """Overall health summary across all providers."""
    providers = db.query(db_models.ProviderHealth).all()
    total_events = sum((p.total_events_received or 0) for p in providers)
    all_ok = all(p.status == "ok" for p in providers) if providers else False
    return {
        "overall_status": "ok" if all_ok else ("degraded" if providers else "unknown"),
        "provider_count": len(providers),
        "total_events_ingested": total_events,
        "providers": [
            {"provider_id": p.provider_id, "status": p.status, "last_success_at": p.last_success_at.isoformat() if p.last_success_at else None}
            for p in providers
        ],
        "scheduler": ingestion_scheduler.get_scheduler_status(),
    }


@router.get("/feeds/latency")
def all_feeds_latency(db: Session = Depends(get_db)):
    """Aggregate latency metrics across all providers."""
    metrics = (
        db.query(db_models.LatencyMetric)
        .order_by(db_models.LatencyMetric.measured_at.desc())
        .limit(500)
        .all()
    )
    result = {}
    for m in metrics:
        pid = m.provider_id
        if pid not in result:
            result[pid] = []
        result[pid].append({
            "measured_at": m.measured_at.isoformat(),
            "ingestion_delay_s": m.ingestion_delay_s,
            "fetch_duration_ms": m.fetch_duration_ms,
            "events_ingested": m.events_ingested,
        })
    return result


@router.get("/feeds/{provider_id}/latency")
def provider_latency(provider_id: str, limit: int = 100, db: Session = Depends(get_db)):
    """Latency history for a single provider."""
    metrics = (
        db.query(db_models.LatencyMetric)
        .filter(db_models.LatencyMetric.provider_id == provider_id)
        .order_by(db_models.LatencyMetric.measured_at.desc())
        .limit(limit)
        .all()
    )
    ph = db.query(db_models.ProviderHealth).filter(db_models.ProviderHealth.provider_id == provider_id).first()
    return {
        "provider_id": provider_id,
        "health": {
            "status": ph.status if ph else "unknown",
            "avg_ingestion_delay_s": ph.avg_ingestion_delay_s if ph else None,
            "latest_ingestion_delay_s": ph.latest_ingestion_delay_s if ph else None,
            "avg_fetch_duration_ms": ph.avg_fetch_duration_ms if ph else None,
        } if ph else {},
        "history": [
            {
                "measured_at": m.measured_at.isoformat(),
                "ingestion_delay_s": m.ingestion_delay_s,
                "fetch_duration_ms": m.fetch_duration_ms,
                "events_ingested": m.events_ingested,
            }
            for m in metrics
        ],
    }


@router.post("/feeds/{provider_id}/sync")
def manual_sync(provider_id: str):
    """Manually trigger an immediate ingestion cycle for the given provider."""
    result = ingestion_scheduler.trigger_provider_sync(provider_id)
    if not result.get("ok") and "Unknown provider" in result.get("error", ""):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")
    return result


# ════════════════════════════════════════════════════════════════════
# EXTERNAL EVENTS
# ════════════════════════════════════════════════════════════════════

@router.get("/external-events/")
def list_external_events(
    provider_id: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    since_hours: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """List external events with optional filters."""
    query = db.query(db_models.ExternalEvent).order_by(
        db_models.ExternalEvent.event_time.desc().nullslast(),
        db_models.ExternalEvent.received_at.desc(),
    )
    if provider_id:
        query = query.filter(db_models.ExternalEvent.provider_id == provider_id)
    if category:
        query = query.filter(db_models.ExternalEvent.category == category)
    if severity:
        query = query.filter(db_models.ExternalEvent.severity == severity)
    if since_hours:
        cutoff = datetime.utcnow() - timedelta(hours=since_hours)
        query = query.filter(db_models.ExternalEvent.received_at >= cutoff)

    total = query.count()
    events = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [_event_to_dict(ev) for ev in events],
    }


@router.get("/external-events/statistics")
def external_events_statistics(db: Session = Depends(get_db)):
    """Aggregate statistics across all external events."""
    total = db.query(func.count(db_models.ExternalEvent.id)).scalar()
    by_provider = (
        db.query(db_models.ExternalEvent.provider_id, func.count(db_models.ExternalEvent.id))
        .group_by(db_models.ExternalEvent.provider_id)
        .all()
    )
    by_category = (
        db.query(db_models.ExternalEvent.category, func.count(db_models.ExternalEvent.id))
        .group_by(db_models.ExternalEvent.category)
        .all()
    )
    by_severity = (
        db.query(db_models.ExternalEvent.severity, func.count(db_models.ExternalEvent.id))
        .group_by(db_models.ExternalEvent.severity)
        .all()
    )
    last_24h = db.query(func.count(db_models.ExternalEvent.id)).filter(
        db_models.ExternalEvent.received_at >= datetime.utcnow() - timedelta(hours=24)
    ).scalar()

    return {
        "total_events": total,
        "last_24h": last_24h,
        "by_provider": dict(by_provider),
        "by_category": dict(by_category),
        "by_severity": dict(by_severity),
    }


@router.get("/external-events/{event_id}")
def get_external_event(event_id: int, db: Session = Depends(get_db)):
    """Get a single external event by ID with full latency detail panel."""
    ev = db.query(db_models.ExternalEvent).filter(db_models.ExternalEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail=f"External event {event_id} not found")

    # Mark displayed_at on first retrieval (frontend has received it)
    if ev.displayed_at is None:
        ev.displayed_at = datetime.utcnow()
        if ev.received_at:
            ev.frontend_delivery_delay_s = max(0.0, (ev.displayed_at - ev.received_at).total_seconds())
        db.commit()
        db.refresh(ev)

    return _event_to_dict(ev)


# ════════════════════════════════════════════════════════════════════
# ANALYTICS / INGESTION
# ════════════════════════════════════════════════════════════════════

@router.get("/analytics/ingestion-latency")
def ingestion_latency_analytics(
    provider_id: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """Return recent ingestion latency data for charting."""
    query = db.query(db_models.IngestionLog).order_by(db_models.IngestionLog.run_at.desc())
    if provider_id:
        query = query.filter(db_models.IngestionLog.provider_id == provider_id)
    logs = query.limit(limit).all()
    return [
        {
            "provider_id": l.provider_id,
            "run_at": l.run_at.isoformat(),
            "success": l.success,
            "events_fetched": l.events_fetched,
            "events_new": l.events_new,
            "events_duplicate": l.events_duplicate,
            "events_rejected": l.events_rejected,
            "fetch_duration_ms": l.fetch_duration_ms,
            "total_duration_ms": l.total_duration_ms,
            "error_message": l.error_message,
        }
        for l in logs
    ]


@router.get("/system/ingestion")
def system_ingestion_status(db: Session = Depends(get_db)):
    """Full system ingestion status including scheduler, provider health, and recent logs."""
    scheduler_status = ingestion_scheduler.get_scheduler_status()

    providers = db.query(db_models.ProviderHealth).all()

    recent_logs = (
        db.query(db_models.IngestionLog)
        .order_by(db_models.IngestionLog.run_at.desc())
        .limit(30)
        .all()
    )

    total_events = db.query(func.count(db_models.ExternalEvent.id)).scalar()

    return {
        "scheduler": scheduler_status,
        "providers": [
            {
                "provider_id": p.provider_id,
                "provider_name": p.provider_name,
                "status": p.status,
                "last_success_at": p.last_success_at.isoformat() if p.last_success_at else None,
                "last_error_message": p.last_error_message,
                "total_events_received": p.total_events_received,
                "avg_ingestion_delay_s": p.avg_ingestion_delay_s,
                "avg_fetch_duration_ms": p.avg_fetch_duration_ms,
            }
            for p in providers
        ],
        "total_events_in_db": total_events,
        "recent_ingestion_logs": [
            {
                "provider_id": l.provider_id,
                "run_at": l.run_at.isoformat(),
                "success": l.success,
                "events_new": l.events_new,
                "error_message": l.error_message,
            }
            for l in recent_logs
        ],
    }
