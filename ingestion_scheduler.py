"""
RESQNET AI — Ingestion Scheduler
APScheduler-based background polling for all three data providers.
Each provider runs on its own configurable interval.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .live_data_manager import (
    run_usgs_ingestion,
    run_firms_ingestion,
    run_weather_ingestion,
)

logger = logging.getLogger(__name__)

# ── Poll intervals (seconds) ─────────────────────────────────────────
# USGS: earthquakes update in near-real-time, poll every 60s
# NASA FIRMS: satellite passes every ~100 min, poll every 10 min
# Open-Meteo: forecast updates hourly, poll every 15 min
POLL_INTERVALS = {
    "usgs": 60,
    "nasa_firms": 600,
    "open_meteo": 900,
}

_scheduler: Optional[BackgroundScheduler] = None


def _job_usgs():
    try:
        result = run_usgs_ingestion()
        if result.get("ok"):
            logger.info(
                "USGS ingestion OK: %d fetched, %d new",
                result.get("events_fetched", 0),
                result.get("events_new", 0),
            )
        else:
            logger.warning("USGS ingestion failed: %s", result.get("error"))
    except Exception as e:
        logger.exception("USGS scheduled job raised: %s", e)


def _job_firms():
    try:
        result = run_firms_ingestion()
        if result.get("ok"):
            logger.info(
                "NASA FIRMS ingestion OK: %d fetched, %d new",
                result.get("events_fetched", 0),
                result.get("events_new", 0),
            )
        else:
            logger.warning("NASA FIRMS ingestion failed: %s", result.get("error"))
    except Exception as e:
        logger.exception("NASA FIRMS scheduled job raised: %s", e)


def _job_weather():
    try:
        result = run_weather_ingestion()
        if result.get("ok"):
            logger.info(
                "Open-Meteo ingestion OK: %d fetched, %d new",
                result.get("events_fetched", 0),
                result.get("events_new", 0),
            )
        else:
            logger.warning("Open-Meteo ingestion failed: %s", result.get("error"))
    except Exception as e:
        logger.exception("Open-Meteo scheduled job raised: %s", e)


def start_scheduler():
    """Start the background scheduler. Call once on application startup."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        logger.warning("Scheduler already running — ignoring start_scheduler() call")
        return

    _scheduler = BackgroundScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 30},
    )

    _scheduler.add_job(
        _job_usgs,
        trigger=IntervalTrigger(seconds=POLL_INTERVALS["usgs"]),
        id="usgs_ingestion",
        name="USGS Earthquake Ingestion",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_firms,
        trigger=IntervalTrigger(seconds=POLL_INTERVALS["nasa_firms"]),
        id="firms_ingestion",
        name="NASA FIRMS Fire Detection Ingestion",
        replace_existing=True,
    )
    _scheduler.add_job(
        _job_weather,
        trigger=IntervalTrigger(seconds=POLL_INTERVALS["open_meteo"]),
        id="weather_ingestion",
        name="Open-Meteo Weather Ingestion",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Ingestion scheduler started. USGS=%ds, FIRMS=%ds, Weather=%ds",
        POLL_INTERVALS["usgs"],
        POLL_INTERVALS["nasa_firms"],
        POLL_INTERVALS["open_meteo"],
    )

    # Run initial fetches immediately (non-blocking, in scheduler threads)
    _scheduler.add_job(_job_usgs, id="usgs_boot", name="USGS boot fetch", replace_existing=True)
    _scheduler.add_job(_job_firms, id="firms_boot", name="FIRMS boot fetch", replace_existing=True)
    _scheduler.add_job(_job_weather, id="weather_boot", name="Weather boot fetch", replace_existing=True)


def stop_scheduler():
    """Stop the background scheduler. Call on application shutdown."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Ingestion scheduler stopped.")
    _scheduler = None


def get_scheduler_status() -> Dict[str, object]:
    """Return status information about the scheduler."""
    if _scheduler is None or not _scheduler.running:
        return {"running": False, "jobs": []}
    jobs = []
    for job in _scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        })
    return {"running": True, "jobs": jobs}


def trigger_provider_sync(provider_id: str) -> Dict[str, object]:
    """Manually trigger an immediate sync for a specific provider."""
    if provider_id == "usgs":
        return run_usgs_ingestion()
    if provider_id == "nasa_firms":
        return run_firms_ingestion()
    if provider_id == "open_meteo":
        return run_weather_ingestion()
    return {"ok": False, "error": f"Unknown provider: {provider_id}"}
