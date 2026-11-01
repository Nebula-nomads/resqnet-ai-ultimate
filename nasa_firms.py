"""
RESQNET AI — NASA FIRMS Fire Detection Integration
Official NASA FIRMS API: https://firms.modaps.eosdis.nasa.gov/api/
API key stored in NASA_FIRMS_API_KEY environment variable.

IMPORTANT: Satellite thermal anomalies are detections, NOT confirmed wildfires.
All detections are labelled: SATELLITE FIRE DETECTION — UNVERIFIED
"""

import os
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api"
PROVIDER_ID = "nasa_firms"
PROVIDER_NAME = "NASA FIRMS (Fire Information for Resource Management System)"


def _get_api_key() -> Optional[str]:
    return os.getenv("NASA_FIRMS_API_KEY")


def _parse_firms_datetime(date_str: str, time_str: str) -> Optional[datetime]:
    """Parse FIRMS acq_date + acq_time into UTC datetime."""
    try:
        # acq_time is HHMM as a string/int, acq_date is YYYY-MM-DD
        time_padded = str(int(time_str)).zfill(4)
        dt_str = f"{date_str} {time_padded[:2]}:{time_padded[2:]}"
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _confidence_label(conf: str) -> str:
    try:
        c = int(conf)
        if c >= 80:
            return "high"
        if c >= 50:
            return "medium"
        return "low"
    except (ValueError, TypeError):
        cl = str(conf).lower()
        if cl in ("h", "high"):
            return "high"
        if cl in ("n", "nominal"):
            return "medium"
        if cl in ("l", "low"):
            return "low"
        return "low"


def _severity_from_frp(frp: Optional[float]) -> str:
    """Fire Radiative Power (MW) → severity label."""
    if frp is None:
        return "unknown"
    if frp >= 1000:
        return "critical"
    if frp >= 200:
        return "high"
    if frp >= 50:
        return "medium"
    return "low"


def fetch_firms_data(
    source: str = "VIIRS_SNPP_NRT",
    area_coords: Optional[str] = None,  # "lon_min,lat_min,lon_max,lat_max"
    day_range: int = 1,
) -> Dict[str, Any]:
    """
    Fetch active fire detections from NASA FIRMS API.
    source: MODIS_NRT | VIIRS_SNPP_NRT | VIIRS_NOAA20_NRT | LANDSAT_NRT
    Returns normalized detection list.
    """
    api_key = _get_api_key()
    if not api_key:
        return {
            "ok": False,
            "provider_id": PROVIDER_ID,
            "error": "NASA_FIRMS_API_KEY environment variable is not set. Obtain a free key at https://firms.modaps.eosdis.nasa.gov/api/",
            "events": [],
        }

    # Use world area if no specific area provided
    area = area_coords or "world"

    # CSV endpoint
    url = f"{FIRMS_API_BASE}/area/csv/{api_key}/{source}/{area}/{day_range}"

    fetch_start = datetime.now(timezone.utc)
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.get(url)

            if response.status_code == 400:
                return {
                    "ok": False,
                    "provider_id": PROVIDER_ID,
                    "error": f"FIRMS API 400: {response.text[:300]}. Check API key and source product name.",
                    "events": [],
                }
            if response.status_code == 401 or response.status_code == 403:
                return {
                    "ok": False,
                    "provider_id": PROVIDER_ID,
                    "error": f"FIRMS API authentication failed (HTTP {response.status_code}). Verify NASA_FIRMS_API_KEY.",
                    "events": [],
                }
            response.raise_for_status()

            fetch_end = datetime.now(timezone.utc)
            fetch_duration_ms = (fetch_end - fetch_start).total_seconds() * 1000

            text = response.text
            if not text.strip():
                return {
                    "ok": True,
                    "provider_id": PROVIDER_ID,
                    "provider_name": PROVIDER_NAME,
                    "event_count": 0,
                    "events": [],
                    "fetch_duration_ms": fetch_duration_ms,
                    "fetched_at": fetch_end,
                    "source_product": source,
                }

            reader = csv.DictReader(io.StringIO(text))
            events = []
            for row in reader:
                acq_date = row.get("acq_date", "")
                acq_time = row.get("acq_time", "0000")
                event_time = _parse_firms_datetime(acq_date, acq_time)

                try:
                    lat = float(row.get("latitude", 0) or 0)
                    lon = float(row.get("longitude", 0) or 0)
                    brightness = float(row.get("brightness", 0) or row.get("bright_ti4", 0) or 0) or None
                    bright_t31 = float(row.get("bright_t31", 0) or row.get("bright_ti5", 0) or 0) or None
                    frp_val = float(row.get("frp", 0) or 0) or None
                except (ValueError, TypeError):
                    continue

                conf_raw = row.get("confidence", "low")
                instrument = row.get("instrument", "")
                satellite = row.get("satellite", "")
                daynight = row.get("daynight", "")
                version = row.get("version", "")

                event = {
                    "provider_id": PROVIDER_ID,
                    "external_id": (
                        f"firms_{source}_{acq_date}_{acq_time}_{lat:.4f}_{lon:.4f}"
                    ),
                    "event_time": event_time,
                    "source_published_at": event_time,
                    "source_updated_at": event_time,
                    "latitude": lat,
                    "longitude": lon,
                    "title": "SATELLITE FIRE DETECTION — UNVERIFIED",
                    "location_name": f"Thermal anomaly at {lat:.4f}, {lon:.4f}",
                    "brightness_kelvin": brightness,
                    "bright_t31": bright_t31,
                    "fire_radiative_power_mw": frp_val,
                    "confidence_raw": conf_raw,
                    "confidence_label": _confidence_label(conf_raw),
                    "satellite": satellite,
                    "instrument": instrument,
                    "day_night": daynight,
                    "source_dataset": source,
                    "dataset_version": version,
                    "acq_date": acq_date,
                    "acq_time": acq_time,
                    "severity": _severity_from_frp(frp_val),
                    "category": "fire",
                    "verification_status": "SATELLITE FIRE DETECTION — UNVERIFIED",
                    "source_url": f"https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@{lon:.4f},{lat:.4f},12z",
                    "raw_metadata": {
                        "scan": row.get("scan"),
                        "track": row.get("track"),
                        "version": version,
                    },
                }
                events.append(event)

            return {
                "ok": True,
                "provider_id": PROVIDER_ID,
                "provider_name": PROVIDER_NAME,
                "event_count": len(events),
                "events": events,
                "fetch_duration_ms": fetch_duration_ms,
                "fetched_at": fetch_end,
                "source_product": source,
            }

    except httpx.TimeoutException as e:
        logger.error("NASA FIRMS fetch timed out: %s", e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": f"Timeout fetching FIRMS data: {e}", "events": []}
    except httpx.HTTPStatusError as e:
        logger.error("NASA FIRMS HTTP error %s: %s", e.response.status_code, e)
        return {
            "ok": False,
            "provider_id": PROVIDER_ID,
            "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}",
            "events": [],
        }
    except Exception as e:
        logger.exception("NASA FIRMS fetch failed: %s", e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": str(e), "events": []}


def check_api_key() -> Dict[str, Any]:
    """Verify the NASA FIRMS API key is present and usable."""
    api_key = _get_api_key()
    if not api_key:
        return {"valid": False, "reason": "NASA_FIRMS_API_KEY environment variable not set"}
    # Light check — transaction limit endpoint
    url = f"{FIRMS_API_BASE}/transaction/{api_key}"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url)
            if r.status_code == 200:
                return {"valid": True, "info": r.text[:200]}
            return {"valid": False, "reason": f"HTTP {r.status_code}: {r.text[:100]}"}
    except Exception as e:
        return {"valid": False, "reason": str(e)}
