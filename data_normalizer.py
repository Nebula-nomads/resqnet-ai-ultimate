"""
RESQNET AI — Data Normalizer
Converts raw provider adapter results into normalized ExternalEvent DB records.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # store as naive UTC


def _to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _compute_delay(later: Optional[datetime], earlier: Optional[datetime]) -> Optional[float]:
    """Return delay in seconds between two naive UTC datetimes, or None."""
    if later is None or earlier is None:
        return None
    try:
        return max(0.0, (later - earlier).total_seconds())
    except Exception:
        return None


def normalize_usgs_event(raw: Dict[str, Any], received_at: datetime) -> Dict[str, Any]:
    """Convert a USGS raw event dict into a normalized ExternalEvent field dict."""
    received_naive = _to_naive_utc(received_at)
    event_time = _to_naive_utc(raw.get("event_time"))
    source_published_at = _to_naive_utc(raw.get("source_published_at"))
    source_updated_at = _to_naive_utc(raw.get("source_updated_at"))

    return {
        "provider_id": raw["provider_id"],
        "external_id": raw["external_id"],
        "category": raw.get("category", "earthquake"),
        "title": raw.get("title"),
        "location_name": raw.get("location_name"),
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "severity": raw.get("severity"),
        "verification_status": raw.get("verification_status"),
        "source_url": raw.get("source_url"),
        "magnitude": raw.get("magnitude"),
        "magnitude_type": raw.get("magnitude_type"),
        "depth_km": raw.get("depth_km"),
        "alert_level": raw.get("alert_level"),
        "tsunami_flag": raw.get("tsunami_flag"),
        "event_status_provider": raw.get("event_status"),
        "event_time": event_time,
        "source_published_at": source_published_at,
        "source_updated_at": source_updated_at,
        "received_at": received_naive,
        "source_publication_delay_s": _compute_delay(received_naive, source_published_at),
        "event_detection_delay_s": _compute_delay(received_naive, event_time),
        "raw_metadata": raw.get("raw_metadata"),
    }


def normalize_firms_event(raw: Dict[str, Any], received_at: datetime) -> Dict[str, Any]:
    """Convert a NASA FIRMS raw event dict into a normalized ExternalEvent field dict."""
    received_naive = _to_naive_utc(received_at)
    event_time = _to_naive_utc(raw.get("event_time"))
    source_published_at = _to_naive_utc(raw.get("source_published_at"))

    return {
        "provider_id": raw["provider_id"],
        "external_id": raw["external_id"],
        "category": raw.get("category", "fire"),
        "title": raw.get("title"),
        "location_name": raw.get("location_name"),
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "severity": raw.get("severity"),
        "verification_status": raw.get("verification_status"),
        "source_url": raw.get("source_url"),
        "brightness_kelvin": raw.get("brightness_kelvin"),
        "fire_radiative_power_mw": raw.get("fire_radiative_power_mw"),
        "confidence_label": raw.get("confidence_label"),
        "satellite": raw.get("satellite"),
        "instrument": raw.get("instrument"),
        "day_night": raw.get("day_night"),
        "source_dataset": raw.get("source_dataset"),
        "event_time": event_time,
        "source_published_at": source_published_at,
        "source_updated_at": source_published_at,
        "received_at": received_naive,
        "source_publication_delay_s": _compute_delay(received_naive, source_published_at),
        "event_detection_delay_s": _compute_delay(received_naive, event_time),
        "raw_metadata": raw.get("raw_metadata"),
    }


def normalize_weather_event(raw: Dict[str, Any], received_at: datetime) -> Dict[str, Any]:
    """Convert an Open-Meteo raw event dict into a normalized ExternalEvent field dict."""
    received_naive = _to_naive_utc(received_at)
    event_time = _to_naive_utc(raw.get("event_time"))
    source_published_at = _to_naive_utc(raw.get("source_published_at"))

    return {
        "provider_id": raw["provider_id"],
        "external_id": raw["external_id"],
        "category": raw.get("category", "weather"),
        "title": raw.get("title"),
        "location_name": raw.get("location_name"),
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "severity": raw.get("severity"),
        "verification_status": raw.get("verification_status"),
        "source_url": raw.get("source_url"),
        "temperature_c": raw.get("temperature_c"),
        "relative_humidity_pct": raw.get("relative_humidity_pct"),
        "precipitation_mm": raw.get("precipitation_mm"),
        "wind_speed_kmh": raw.get("wind_speed_kmh"),
        "wind_direction_deg": raw.get("wind_direction_deg"),
        "weather_code": raw.get("weather_code"),
        "weather_description": raw.get("weather_description"),
        "is_alert_candidate": raw.get("is_alert_candidate", False),
        "threshold_breaches": raw.get("threshold_breaches", []),
        "event_time": event_time,
        "source_published_at": source_published_at,
        "source_updated_at": source_published_at,
        "received_at": received_naive,
        # Open-Meteo publishes forecasts so source_published_at ≈ received_at
        "source_publication_delay_s": 0.0,
        "event_detection_delay_s": _compute_delay(received_naive, event_time),
        "raw_metadata": raw.get("raw_metadata"),
    }


NORMALIZERS = {
    "usgs": normalize_usgs_event,
    "nasa_firms": normalize_firms_event,
    "open_meteo": normalize_weather_event,
}


def normalize_event(provider_id: str, raw: Dict[str, Any], received_at: datetime) -> Optional[Dict[str, Any]]:
    """Route to the correct normalizer for the given provider."""
    fn = NORMALIZERS.get(provider_id)
    if fn is None:
        return None
    return fn(raw, received_at)
