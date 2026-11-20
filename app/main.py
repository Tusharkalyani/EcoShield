"""EcoShield FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.endpoints import router as api_router
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Rate Limiter ──────────────────────────────────────────────────────────

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/minute"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown hooks."""
    logger.info("EcoShield API starting up...")
    yield
    logger.info("EcoShield API shutting down...")


# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(
    title="EcoShield API",
    description="Geospatial Early Warning and Predictive Defense System for Wildlife Raids",
    version="1.0.0",
    lifespan=lifespan,
)

# Attach rate limiter to app state and register error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS Middleware ───────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local & dashboard integration
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount Routers ─────────────────────────────────────────────────────────

app.include_router(api_router, prefix="/api/v1")
app.include_router(api_router)  # Also mount at root for /farmers, /predict-zone, /sightings


@app.get("/health", tags=["System"])
def health_check():
    """Health status endpoint."""
    return {"status": "healthy", "service": "ecoshield"}
