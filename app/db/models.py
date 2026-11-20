"""SQLAlchemy + GeoAlchemy2 ORM models for EcoShield."""

import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Farmer ───────────────────────────────────────────────────────────────


class Farmer(Base):
    """A registered farmer with an encrypted phone number and GPS location."""

    __tablename__ = "farmers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    phone_encrypted: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        comment="Fernet-encrypted phone number",
    )
    village_sector: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    location_geom: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=False,
    )

    # relationships
    alert_logs: Mapped[list["AlertDispatchLog"]] = relationship(
        back_populates="farmer",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Farmer {self.id!s} village={self.village_sector!r}>"


# ── Risk Grid Cell ───────────────────────────────────────────────────────


class RiskGridCell(Base):
    """A geospatial polygon cell carrying satellite-derived risk indicators."""

    __tablename__ = "risk_grid_cells"

    cell_id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
    )
    geom: Mapped[str] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326),
        nullable=False,
    )
    ndvi: Mapped[float] = mapped_column(Float, nullable=True)
    ndwi: Mapped[float] = mapped_column(Float, nullable=True)
    slope: Mapped[float] = mapped_column(Float, nullable=True)
    dist_forest_m: Mapped[float] = mapped_column(Float, nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, nullable=True, index=True)
    prediction_date: Mapped[date] = mapped_column(Date, nullable=False)

    # relationships
    alert_logs: Mapped[list["AlertDispatchLog"]] = relationship(
        back_populates="cell",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<RiskGridCell {self.cell_id} score={self.risk_score}>"


# ── Alert Dispatch Log ───────────────────────────────────────────────────


class AlertDispatchLog(Base):
    """Audit trail for every SMS/voice alert dispatched to a farmer."""

    __tablename__ = "alert_dispatch_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    cell_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("risk_grid_cells.cell_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    farmer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("farmers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    dispatched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    delivery_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
        comment="pending | sent | delivered | failed",
    )

    # relationships
    farmer: Mapped["Farmer"] = relationship(back_populates="alert_logs")
    cell: Mapped["RiskGridCell"] = relationship(back_populates="alert_logs")

    def __repr__(self) -> str:
        return (
            f"<AlertDispatchLog {self.id!s} "
            f"farmer={self.farmer_id!s} status={self.delivery_status!r}>"
        )


# ── Animal Sighting ──────────────────────────────────────────────────────


class AnimalSighting(Base):
    """Wildlife sighting logged by field rangers."""

    __tablename__ = "animal_sightings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    species: Mapped[str] = mapped_column(String(100), nullable=False)
    count: Mapped[int] = mapped_column(nullable=False, default=1)
    location_geom: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=False,
    )
    sighting_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    logged_by: Mapped[str] = mapped_column(String(100), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<AnimalSighting {self.id!s} species={self.species!r} "
            f"count={self.count} by={self.logged_by!r}>"
        )

