"""
RESQNET AI — Database Models
Includes the original Incident model plus new external data models.
"""

import os
import json
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, JSON, Text, Index, UniqueConstraint, BigInteger
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SQLITE_PATH = os.path.join(BASE_DIR, 'resqnet.db')
engine = create_engine(
    f'sqlite:///{SQLITE_PATH}',
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─────────────────────────────────────────────────────────────────
# ORIGINAL MODEL — unchanged
# ─────────────────────────────────────────────────────────────────
class Incident(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True, index=True)
    raw_report = Column(String, nullable=False)
    category = Column(String, nullable=True)
    description = Column(String, nullable=True)
    location_name = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    people_affected = Column(Integer, nullable=True)
    vulnerable_people = Column(JSON, nullable=True)
    immediate_threats = Column(JSON, nullable=True)
    required_resources = Column(JSON, nullable=True)
    confidence = Column(Float, nullable=True)
    recommended_urgency = Column(String, nullable=True)
    priority_score = Column(Integer, nullable=True)
    priority_label = Column(String, nullable=True)
    priority_explanation = Column(String, nullable=True)
    is_duplicate = Column(Boolean, default=False)
    duplicate_of = Column(Integer, nullable=True)
    status = Column(String, default="awaiting")
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_simulation = Column(Boolean, default=False)


# ─────────────────────────────────────────────────────────────────
# NEW MODELS — external data integration
# ─────────────────────────────────────────────────────────────────

class ExternalDataSource(Base):
    """Registry of configured external data providers."""
    __tablename__ = "external_data_sources"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String, unique=True, nullable=False, index=True)  # usgs | nasa_firms | open_meteo
    provider_name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    poll_interval_seconds = Column(Integer, default=300)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ExternalEvent(Base):
    """
    A single event received from an external data provider.
    The external_id + provider_id combination is unique to prevent duplicates.
    """
    __tablename__ = "external_events"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String, nullable=False, index=True)       # usgs | nasa_firms | open_meteo
    external_id = Column(String, nullable=False, index=True)       # Original provider event ID

    # ── Event data ──────────────────────────────────────────────
    category = Column(String, nullable=True, index=True)           # earthquake | fire | weather
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    location_name = Column(String, nullable=True)
    latitude = Column(Float, nullable=True, index=True)
    longitude = Column(Float, nullable=True, index=True)
    severity = Column(String, nullable=True, index=True)            # critical | high | medium | low
    verification_status = Column(String, nullable=True)             # e.g. VERIFIED—USGS | SATELLITE FIRE DETECTION—UNVERIFIED
    source_url = Column(String, nullable=True)

    # ── Provider-specific fields ────────────────────────────────
    magnitude = Column(Float, nullable=True)
    magnitude_type = Column(String, nullable=True)
    depth_km = Column(Float, nullable=True)
    alert_level = Column(String, nullable=True)
    tsunami_flag = Column(Integer, nullable=True)
    event_status_provider = Column(String, nullable=True)

    # Fire fields
    brightness_kelvin = Column(Float, nullable=True)
    fire_radiative_power_mw = Column(Float, nullable=True)
    confidence_label = Column(String, nullable=True)
    satellite = Column(String, nullable=True)
    instrument = Column(String, nullable=True)
    day_night = Column(String, nullable=True)
    source_dataset = Column(String, nullable=True)

    # Weather fields
    temperature_c = Column(Float, nullable=True)
    relative_humidity_pct = Column(Float, nullable=True)
    precipitation_mm = Column(Float, nullable=True)
    wind_speed_kmh = Column(Float, nullable=True)
    wind_direction_deg = Column(Float, nullable=True)
    weather_code = Column(Integer, nullable=True)
    weather_description = Column(String, nullable=True)
    is_alert_candidate = Column(Boolean, default=False)
    threshold_breaches = Column(JSON, nullable=True)

    # ── Timing fields (all UTC) ──────────────────────────────────
    # Explicitly indexed below in __table_args__.
    event_time = Column(DateTime, nullable=True)                    # When the event occurred
    source_published_at = Column(DateTime, nullable=True)           # When the source published it
    source_updated_at = Column(DateTime, nullable=True)             # When the source last updated it
    received_at = Column(DateTime, nullable=False, default=datetime.utcnow)  # When RESQNET received it
    analyzed_at = Column(DateTime, nullable=True)                   # When AI analysis completed
    displayed_at = Column(DateTime, nullable=True)                  # When frontend acknowledged receipt

    # ── Computed latency metrics (seconds) ──────────────────────
    source_publication_delay_s = Column(Float, nullable=True)       # received_at - source_published_at
    event_detection_delay_s = Column(Float, nullable=True)          # received_at - event_time
    ai_processing_delay_s = Column(Float, nullable=True)            # analyzed_at - received_at
    frontend_delivery_delay_s = Column(Float, nullable=True)        # displayed_at - received_at

    raw_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Unique constraint prevents duplicate ingestion
    __table_args__ = (
        UniqueConstraint("provider_id", "external_id", name="uq_external_event"),
        Index("ix_external_events_event_time", "event_time"),
        Index("ix_external_events_received_at", "received_at"),
    )


class IngestionLog(Base):
    """Log of every ingestion run for each provider."""
    __tablename__ = "ingestion_logs"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String, nullable=False, index=True)
    run_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    success = Column(Boolean, nullable=False)
    error_message = Column(Text, nullable=True)
    events_fetched = Column(Integer, default=0)
    events_new = Column(Integer, default=0)
    events_duplicate = Column(Integer, default=0)
    events_rejected = Column(Integer, default=0)
    fetch_duration_ms = Column(Float, nullable=True)
    total_duration_ms = Column(Float, nullable=True)
    http_status = Column(Integer, nullable=True)
    response_metadata = Column(JSON, nullable=True)


class ProviderHealth(Base):
    """Current health snapshot for each provider (one row per provider, upserted)."""
    __tablename__ = "provider_health"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String, unique=True, nullable=False, index=True)
    provider_name = Column(String, nullable=True)
    status = Column(String, default="unknown")        # ok | error | degraded | unknown
    last_success_at = Column(DateTime, nullable=True)
    last_error_at = Column(DateTime, nullable=True)
    last_error_message = Column(Text, nullable=True)
    last_fetch_at = Column(DateTime, nullable=True)
    last_event_time = Column(DateTime, nullable=True)
    avg_ingestion_delay_s = Column(Float, nullable=True)
    latest_ingestion_delay_s = Column(Float, nullable=True)
    avg_fetch_duration_ms = Column(Float, nullable=True)
    latest_fetch_duration_ms = Column(Float, nullable=True)
    total_events_received = Column(Integer, default=0)
    total_events_today = Column(Integer, default=0)
    total_errors = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LatencyMetric(Base):
    """Historical latency measurements for timeline charts."""
    __tablename__ = "latency_metrics"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String, nullable=False, index=True)
    measured_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    ingestion_delay_s = Column(Float, nullable=True)
    fetch_duration_ms = Column(Float, nullable=True)
    ai_processing_delay_s = Column(Float, nullable=True)
    events_ingested = Column(Integer, default=0)


def init_db():
    Base.metadata.create_all(bind=engine)
