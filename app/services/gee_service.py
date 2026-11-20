"""Google Earth Engine data-extraction service.

Provides authenticated access to:
* **Sentinel-2 Surface Reflectance** – mean NDVI and NDWI over an AOI.
* **NASA SRTM DEM** – terrain slope (degrees) over an AOI.

When valid GEE credentials are not available (e.g. during local
development or CI) the module falls back to a deterministic mock data
generator that produces plausible synthetic values.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Sequence

import numpy as np

logger = logging.getLogger(__name__)

# ── Lazy GEE import ─────────────────────────────────────────────────────

_ee: Any | None = None
_ee_initialised: bool = False


def _get_ee():
    """Import and return the ``ee`` module (lazy so tests can skip it)."""
    global _ee
    if _ee is None:
        import ee  # type: ignore[import-untyped]

        _ee = ee
    return _ee


# ── Data containers ──────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class SpectralFeatures:
    """Sentinel-2 derived spectral indices for a region."""

    ndvi: float
    ndwi: float


@dataclass(frozen=True, slots=True)
class TerrainFeatures:
    """SRTM-derived terrain features for a region."""

    slope: float  # mean slope in degrees
    elevation: float  # mean elevation in metres


@dataclass(frozen=True, slots=True)
class GEEFeatures:
    """Combined feature set returned by the service."""

    ndvi: float
    ndwi: float
    slope: float
    elevation: float
    is_mock: bool = False


# ── Authentication ───────────────────────────────────────────────────────


def authenticate(
    service_account: str,
    private_key_path: str,
) -> bool:
    """Authenticate with GEE using a service-account JSON key.

    Returns ``True`` on success, ``False`` if the key is missing or
    initialisation fails (in which case the mock generator should be used).
    """
    global _ee_initialised

    key_file = Path(private_key_path)
    if not key_file.exists():
        logger.warning(
            "GEE key file not found at %s – falling back to mock data.",
            private_key_path,
        )
        _ee_initialised = False
        return False

    try:
        ee = _get_ee()
        credentials = ee.ServiceAccountCredentials(
            service_account,
            str(key_file),
        )
        ee.Initialize(credentials)
        _ee_initialised = True
        logger.info("GEE authenticated successfully as %s", service_account)
        return True
    except Exception:
        logger.exception("GEE authentication failed")
        _ee_initialised = False
        return False


def is_initialised() -> bool:
    """Return whether GEE has been successfully initialised."""
    return _ee_initialised


# ── Sentinel-2 Surface Reflectance (NDVI / NDWI) ────────────────────────


def extract_sentinel2_indices(
    bounds: tuple[float, float, float, float],
    start_date: str | date | None = None,
    end_date: str | date | None = None,
) -> SpectralFeatures:
    """Compute mean NDVI and NDWI from Sentinel-2 SR over *bounds*.

    Parameters
    ----------
    bounds:
        ``(min_lon, min_lat, max_lon, max_lat)`` in EPSG:4326.
    start_date / end_date:
        Temporal window. Defaults to the most recent 30 days.

    Returns
    -------
    SpectralFeatures with ``ndvi`` and ``ndwi`` (both in [-1, 1]).
    """
    if not _ee_initialised:
        raise RuntimeError("GEE is not initialised.  Call authenticate() first.")

    ee = _get_ee()

    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = (
            end_date - timedelta(days=30)
            if isinstance(end_date, date)
            else date.today() - timedelta(days=30)
        )

    aoi = ee.Geometry.Rectangle(list(bounds))

    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(aoi)
        .filterDate(str(start_date), str(end_date))
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    )

    def _add_indices(image: Any) -> Any:
        ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
        ndwi = image.normalizedDifference(["B3", "B8"]).rename("NDWI")
        return image.addBands([ndvi, ndwi])

    with_indices = collection.map(_add_indices)
    composite = with_indices.median().select(["NDVI", "NDWI"])

    stats = composite.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=10,
        maxPixels=1e9,
    ).getInfo()

    return SpectralFeatures(
        ndvi=stats.get("NDVI", 0.0) or 0.0,
        ndwi=stats.get("NDWI", 0.0) or 0.0,
    )


# ── SRTM DEM (slope & elevation) ────────────────────────────────────────


def extract_terrain_features(
    bounds: tuple[float, float, float, float],
) -> TerrainFeatures:
    """Compute mean slope and elevation from SRTM 30-m DEM over *bounds*.

    Parameters
    ----------
    bounds:
        ``(min_lon, min_lat, max_lon, max_lat)`` in EPSG:4326.
    """
    if not _ee_initialised:
        raise RuntimeError("GEE is not initialised.  Call authenticate() first.")

    ee = _get_ee()
    aoi = ee.Geometry.Rectangle(list(bounds))

    dem = ee.Image("USGS/SRTMGL1_003")
    slope = ee.Terrain.slope(dem)

    elevation_stats = dem.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    slope_stats = slope.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=30,
        maxPixels=1e9,
    ).getInfo()

    return TerrainFeatures(
        slope=slope_stats.get("slope", 0.0) or 0.0,
        elevation=elevation_stats.get("elevation", 0.0) or 0.0,
    )


# ── Combined extraction ─────────────────────────────────────────────────


def extract_features(
    bounds: tuple[float, float, float, float],
    start_date: str | date | None = None,
    end_date: str | date | None = None,
) -> GEEFeatures:
    """Extract the full GEE feature set for an AOI.

    Falls back to mock data if GEE is not initialised.
    """
    if not _ee_initialised:
        logger.info("GEE not available – using mock data for bounds %s", bounds)
        return generate_mock_features(bounds)

    spectral = extract_sentinel2_indices(bounds, start_date, end_date)
    terrain = extract_terrain_features(bounds)

    return GEEFeatures(
        ndvi=spectral.ndvi,
        ndwi=spectral.ndwi,
        slope=terrain.slope,
        elevation=terrain.elevation,
        is_mock=False,
    )


# ── Mock data generator ─────────────────────────────────────────────────


def generate_mock_features(
    bounds: tuple[float, float, float, float],
    seed: int | None = None,
) -> GEEFeatures:
    """Generate plausible synthetic GEE features for development / testing.

    The values are deterministically derived from the bounding box centre
    so the same AOI always returns the same mock values (unless *seed*
    is overridden).  Ranges mirror realistic sub-Saharan East-African
    agricultural landscapes.

    Parameters
    ----------
    bounds:
        ``(min_lon, min_lat, max_lon, max_lat)`` in EPSG:4326.
    seed:
        Optional RNG seed.  When ``None`` a seed is derived from the
        bounding-box centre for reproducibility.
    """
    centre_lon = (bounds[0] + bounds[2]) / 2.0
    centre_lat = (bounds[1] + bounds[3]) / 2.0

    if seed is None:
        # deterministic seed from spatial location
        seed = int(abs(centre_lon * 1e6 + centre_lat * 1e6)) % (2**31)

    rng = np.random.default_rng(seed)

    # NDVI: 0.15 – 0.85  (sparse scrub → dense canopy)
    ndvi = float(rng.uniform(0.15, 0.85))

    # NDWI: -0.10 – 0.60  (dry → saturated soil / open water)
    ndwi = float(rng.uniform(-0.10, 0.60))

    # Slope: 0° – 35°
    slope = float(rng.uniform(0.0, 35.0))

    # Elevation: 500 m – 2 800 m  (Great Rift Valley range)
    elevation = float(rng.uniform(500.0, 2800.0))

    return GEEFeatures(
        ndvi=round(ndvi, 4),
        ndwi=round(ndwi, 4),
        slope=round(slope, 2),
        elevation=round(elevation, 1),
        is_mock=True,
    )


def generate_mock_batch(
    grid_bounds: Sequence[tuple[float, float, float, float]],
) -> list[GEEFeatures]:
    """Generate mock features for an entire grid of cells."""
    return [generate_mock_features(b) for b in grid_bounds]
