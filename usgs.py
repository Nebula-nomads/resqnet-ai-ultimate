"""
RESQNET AI — USGS Earthquake Data Integration
Official USGS FDSN Event Web Service
API: https://earthquake.usgs.gov/fdsnws/event/1/query
"""

import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

USGS_API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
PROVIDER_ID = "usgs"
PROVIDER_NAME = "USGS Earthquake Hazards Program"


def _parse_ts(ms: Optional[int]) -> Optional[datetime]:
    """Convert USGS millisecond epoch to UTC datetime."""
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    except Exception:
        return None


def _severity_from_magnitude(mag: Optional[float]) -> str:
    if mag is None:
        return "unknown"
    if mag >= 7.0:
        return "critical"
    if mag >= 5.0:
        return "high"
    if mag >= 3.0:
        return "medium"
    return "low"


def fetch_earthquakes(
    min_magnitude: float = 2.5,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
    limit: int = 100,
    order_by: str = "time",
) -> Dict[str, Any]:
    """
    Fetch earthquake events from the USGS FDSN Event Web Service.
    Returns normalized result dict with raw GeoJSON and parsed events.
    """
    if start_time is None:
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)

    params: Dict[str, Any] = {
        "format": "geojson",
        "minmagnitude": min_magnitude,
        "starttime": start_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "limit": limit,
        "orderby": order_by,
    }
    if end_time:
        params["endtime"] = end_time.strftime("%Y-%m-%dT%H:%M:%S")
    if min_lat is not None:
        params["minlatitude"] = min_lat
    if max_lat is not None:
        params["maxlatitude"] = max_lat
    if min_lon is not None:
        params["minlongitude"] = min_lon
    if max_lon is not None:
        params["maxlongitude"] = max_lon

    fetch_start = datetime.now(timezone.utc)
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(USGS_API_URL, params=params)
            response.raise_for_status()
            fetch_end = datetime.now(timezone.utc)
            fetch_duration_ms = (fetch_end - fetch_start).total_seconds() * 1000

            geojson = response.json()
            events = []
            for feature in geojson.get("features", []):
                props = feature.get("properties", {})
                geom = feature.get("geometry", {})
                coords = geom.get("coordinates", [None, None, None])

                event_time = _parse_ts(props.get("time"))
                updated_time = _parse_ts(props.get("updated"))

                event = {
                    "provider_id": PROVIDER_ID,
                    "external_id": feature.get("id"),
                    "event_time": event_time,
                    "source_published_at": event_time,  # USGS publishes shortly after occurrence
                    "source_updated_at": updated_time,
                    "latitude": coords[1] if coords[1] is not None else None,
                    "longitude": coords[0] if coords[0] is not None else None,
                    "depth_km": coords[2] if len(coords) > 2 else None,
                    "title": props.get("title", "Earthquake"),
                    "location_name": props.get("place", "Unknown location"),
                    "magnitude": props.get("mag"),
                    "magnitude_type": props.get("magType"),
                    "alert_level": props.get("alert"),
                    "tsunami_flag": props.get("tsunami", 0),
                    "event_status": props.get("status"),
                    "source_url": props.get("url"),
                    "severity": _severity_from_magnitude(props.get("mag")),
                    "category": "earthquake",
                    "verification_status": "VERIFIED — USGS OFFICIAL DATA",
                    "raw_metadata": {
                        "sig": props.get("sig"),
                        "nst": props.get("nst"),
                        "dmin": props.get("dmin"),
                        "rms": props.get("rms"),
                        "gap": props.get("gap"),
                        "magNst": props.get("magNst"),
                        "net": props.get("net"),
                        "sources": props.get("sources"),
                        "types": props.get("types"),
                        "felt": props.get("felt"),
                        "cdi": props.get("cdi"),
                        "mmi": props.get("mmi"),
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
                "metadata_count": geojson.get("metadata", {}).get("count", 0),
            }

    except httpx.TimeoutException as e:
        logger.error("USGS fetch timed out: %s", e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": f"Timeout: {e}", "events": []}
    except httpx.HTTPStatusError as e:
        logger.error("USGS HTTP error %s: %s", e.response.status_code, e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}", "events": []}
    except Exception as e:
        logger.exception("USGS fetch failed: %s", e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": str(e), "events": []}
