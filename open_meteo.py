"""
RESQNET AI — Open-Meteo Weather Integration
Official API: https://open-meteo.com/en/docs
Free, no API key required.

IMPORTANT: Weather forecasts are NOT confirmed disaster reports.
Disaster alert candidates are only generated when defined thresholds are exceeded.
"""

import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

OPEN_METEO_API_URL = "https://api.open-meteo.com/v1/forecast"
PROVIDER_ID = "open_meteo"
PROVIDER_NAME = "Open-Meteo (Weather Forecast API)"

# Monitored regions: (name, lat, lon)
DEFAULT_REGIONS: List[Tuple[str, float, float]] = [
    ("Global Reference — Equator/Prime Meridian", 0.0, 0.0),
    ("Los Angeles, CA", 34.0522, -118.2437),
    ("New York, NY", 40.7128, -74.0060),
    ("London, UK", 51.5074, -0.1278),
    ("Tokyo, Japan", 35.6762, 139.6503),
    ("Sydney, Australia", -33.8688, 151.2093),
    ("Mumbai, India", 19.0760, 72.8777),
]

# Severe weather alert thresholds (RESQNET internal — not official warnings)
THRESHOLDS = {
    "wind_speed_kmh": 80.0,           # > 80 km/h → alert candidate
    "precipitation_mm_per_hour": 50.0, # > 50 mm/h → alert candidate
    "temperature_max_c": 45.0,         # > 45°C → alert candidate
    "temperature_min_c": -25.0,        # < -25°C → alert candidate
}

WMO_CODE_MAP: Dict[int, str] = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}

SEVERE_WMO = {82, 85, 86, 95, 96, 99}


def _wmo_description(code: Optional[int]) -> str:
    if code is None:
        return "Unknown"
    return WMO_CODE_MAP.get(code, f"WMO code {code}")


def _check_thresholds(hourly: Dict[str, Any], idx: int) -> List[str]:
    """Return a list of threshold breaches for a given hourly index."""
    breaches = []
    wind = hourly.get("wind_speed_10m", [None] * (idx + 1))[idx]
    precip = hourly.get("precipitation", [None] * (idx + 1))[idx]
    temp = hourly.get("temperature_2m", [None] * (idx + 1))[idx]
    wmo = hourly.get("weather_code", [None] * (idx + 1))[idx]

    if wind is not None and wind > THRESHOLDS["wind_speed_kmh"]:
        breaches.append(f"Wind speed {wind:.1f} km/h exceeds {THRESHOLDS['wind_speed_kmh']} km/h threshold")
    if precip is not None and precip > THRESHOLDS["precipitation_mm_per_hour"]:
        breaches.append(f"Precipitation {precip:.1f} mm/h exceeds {THRESHOLDS['precipitation_mm_per_hour']} mm/h threshold")
    if temp is not None and temp > THRESHOLDS["temperature_max_c"]:
        breaches.append(f"Temperature {temp:.1f}°C exceeds {THRESHOLDS['temperature_max_c']}°C threshold")
    if temp is not None and temp < THRESHOLDS["temperature_min_c"]:
        breaches.append(f"Temperature {temp:.1f}°C below {THRESHOLDS['temperature_min_c']}°C threshold")
    if wmo is not None and wmo in SEVERE_WMO:
        breaches.append(f"Severe weather condition: {_wmo_description(wmo)} (WMO {wmo})")
    return breaches


def fetch_weather(
    latitude: float,
    longitude: float,
    location_name: str = "Unknown",
    hourly_vars: Optional[List[str]] = None,
    forecast_days: int = 1,
) -> Dict[str, Any]:
    """
    Fetch weather forecast for a single location.
    Returns normalized result with current conditions and forecast snapshots.
    """
    if hourly_vars is None:
        hourly_vars = [
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "rain",
            "wind_speed_10m",
            "wind_direction_10m",
            "weather_code",
            "apparent_temperature",
            "precipitation_probability",
            "surface_pressure",
        ]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(hourly_vars),
        "forecast_days": forecast_days,
        "timezone": "UTC",
    }

    fetch_start = datetime.now(timezone.utc)
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(OPEN_METEO_API_URL, params=params)
            response.raise_for_status()
            fetch_end = datetime.now(timezone.utc)
            fetch_duration_ms = (fetch_end - fetch_start).total_seconds() * 1000

            data = response.json()
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])

            # Identify the current / most recent past hour
            now_utc = datetime.now(timezone.utc)
            current_idx = 0
            for i, t_str in enumerate(times):
                try:
                    t = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
                    if t <= now_utc:
                        current_idx = i
                except Exception:
                    pass

            # Build events — one per significant hour (current + severe forecasts)
            events = []

            # Current conditions event
            if times:
                event_time_str = times[current_idx]
                try:
                    event_time = datetime.fromisoformat(event_time_str).replace(tzinfo=timezone.utc)
                except Exception:
                    event_time = fetch_end

                def safe_get(key: str) -> Optional[Any]:
                    arr = hourly.get(key, [])
                    return arr[current_idx] if current_idx < len(arr) else None

                wmo_code = safe_get("weather_code")
                breaches = _check_thresholds(hourly, current_idx)
                wind_spd = safe_get("wind_speed_10m")
                precip = safe_get("precipitation")
                temp = safe_get("temperature_2m")

                event = {
                    "provider_id": PROVIDER_ID,
                    "external_id": f"openmeteo_{latitude}_{longitude}_{event_time_str}",
                    "event_time": event_time,
                    "source_published_at": fetch_end,  # Open-Meteo doesn't give individual publication times
                    "source_updated_at": fetch_end,
                    "latitude": latitude,
                    "longitude": longitude,
                    "location_name": location_name,
                    "title": f"Weather — {_wmo_description(wmo_code)} at {location_name}",
                    "category": "weather",
                    "weather_code": wmo_code,
                    "weather_description": _wmo_description(wmo_code),
                    "temperature_c": temp,
                    "apparent_temperature_c": safe_get("apparent_temperature"),
                    "relative_humidity_pct": safe_get("relative_humidity_2m"),
                    "precipitation_mm": precip,
                    "rain_mm": safe_get("rain"),
                    "wind_speed_kmh": wind_spd,
                    "wind_direction_deg": safe_get("wind_direction_10m"),
                    "precipitation_probability_pct": safe_get("precipitation_probability"),
                    "surface_pressure_hpa": safe_get("surface_pressure"),
                    "threshold_breaches": breaches,
                    "is_alert_candidate": len(breaches) > 0,
                    # Weather data is forecast, not a confirmed disaster
                    "verification_status": "WEATHER FORECAST — NOT A CONFIRMED DISASTER REPORT",
                    "severity": "high" if breaches else "low",
                    "source_url": f"https://open-meteo.com/en/docs#latitude={latitude}&longitude={longitude}",
                    "forecast_init_time": fetch_end.isoformat(),
                    "raw_metadata": {
                        "forecast_days": forecast_days,
                        "timezone": data.get("timezone"),
                        "elevation": data.get("elevation"),
                        "hourly_units": data.get("hourly_units", {}),
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
                "location": location_name,
                "latitude": latitude,
                "longitude": longitude,
                "forecast_init_time": fetch_end.isoformat(),
            }

    except httpx.TimeoutException as e:
        logger.error("Open-Meteo fetch timed out: %s", e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": f"Timeout: {e}", "events": []}
    except httpx.HTTPStatusError as e:
        logger.error("Open-Meteo HTTP error %s: %s", e.response.status_code, e)
        return {
            "ok": False,
            "provider_id": PROVIDER_ID,
            "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}",
            "events": [],
        }
    except Exception as e:
        logger.exception("Open-Meteo fetch failed: %s", e)
        return {"ok": False, "provider_id": PROVIDER_ID, "error": str(e), "events": []}


def fetch_all_regions() -> List[Dict[str, Any]]:
    """Fetch weather for all configured monitoring regions. Returns list of results."""
    results = []
    for name, lat, lon in DEFAULT_REGIONS:
        result = fetch_weather(lat, lon, name)
        results.append(result)
    return results
