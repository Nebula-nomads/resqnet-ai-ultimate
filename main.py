"""
RESQNET AI Backend — Main Application Entry Point
"""

import asyncio
import json
import logging
import queue
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .api.v1 import endpoints
from .db.models import init_db
from .services.ingestion_scheduler import start_scheduler, stop_scheduler
from .services.live_data_manager import add_sse_subscriber, remove_sse_subscriber

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ─────────────────────────────────────────────────
    init_db()
    logger.info("Database initialised.")
    start_scheduler()
    logger.info("Ingestion scheduler started.")
    yield
    # ── Shutdown ────────────────────────────────────────────────
    stop_scheduler()
    logger.info("Ingestion scheduler stopped.")


app = FastAPI(title="RESQNET AI Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"service": "RESQNET AI Backend", "status": "ok", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── SSE live stream ──────────────────────────────────────────────────
@app.get("/api/v1/stream")
async def sse_stream(request: Request):
    """
    Server-Sent Events endpoint.
    Clients connect once; new external events are pushed as they are ingested.
    """
    event_queue: queue.Queue = queue.Queue(maxsize=256)
    add_sse_subscriber(event_queue)

    async def generator():
        try:
            # Send a connection-established heartbeat immediately
            yield "event: connected\ndata: {\"status\": \"connected\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # Drain available events (non-blocking)
                    events_sent = 0
                    while not event_queue.empty() and events_sent < 20:
                        ev = event_queue.get_nowait()
                        payload = json.dumps(ev, default=str)
                        yield f"event: new_event\ndata: {payload}\n\n"
                        events_sent += 1
                except queue.Empty:
                    pass
                # Heartbeat every 15 seconds to keep connection alive
                yield ": heartbeat\n\n"
                await asyncio.sleep(15)
        except asyncio.CancelledError:
            pass
        finally:
            remove_sse_subscriber(event_queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
