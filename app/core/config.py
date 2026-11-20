"""Application configuration loaded from environment / .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the .env file relative to the project root (two levels up from this file).
_ENV_FILE: Path = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Strictly-typed application settings.

    Values are loaded – in priority order – from:
      1. Environment variables (highest priority)
      2. The project-root `.env` file
    """

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Database ─────────────────────────────────────────────────────────
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    @property
    def database_url(self) -> str:
        """Build the PostgreSQL DSN using psycopg2 driver."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── Redis & Celery ───────────────────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"

    # ── Security / Auth ──────────────────────────────────────────────────
    SECRET_KEY: str
    FERNET_KEY: str
    HMAC_SECRET: str

    # ── Twilio ───────────────────────────────────────────────────────────
    TWILIO_ACCOUNT_SID: str
    TWILIO_AUTH_TOKEN: str
    TWILIO_PHONE_NUMBER: str

    # ── Google Earth Engine ──────────────────────────────────────────────
    GEE_SERVICE_ACCOUNT: str
    GEE_PRIVATE_KEY_PATH: str = Field(
        default="/app/secrets/gee-key.json",
        description="Absolute path to the GEE service-account JSON key.",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton of the application settings."""
    return Settings()  # type: ignore[call-arg]
