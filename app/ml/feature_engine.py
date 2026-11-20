"""Spatial grid generation and zonal feature extraction.

Divides an agricultural perimeter into uniform square cells and enriches
each cell with environmental features sourced from Google Earth Engine
(or mock data when GEE credentials are absent).
"""

from __future__ import annotations

import logging
import math
import uuid
from typing import Any, Sequence

import geopandas as gpd
import numpy as np
from shapely.geometry import Polygon, box, mapping

from app.services.gee_service import GEEFeatures, extract_features, generate_mock_features

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────

#: Approximate metres per degree of latitude (constant on a sphere).
_M_PER_DEG_LAT: float = 111_320.0


def _m_per_deg_lon(lat_deg: float) -> float:
    """Metres per degree of longitude at a given latitude."""
    return _M_PER_DEG_LAT * math.cos(math.radians(lat_deg))


# ── Grid generation ─────────────────────────────────────────────────────


def generate_spatial_grid(
    bounding_box: tuple[float, float, float, float],
    cell_size_m: int = 500,
) -> gpd.GeoDataFrame:
    """Divide an agricultural perimeter into *cell_size_m* × *cell_size_m*
    polygon cells and extract zonal environmental features for each cell.

    Parameters
    ----------
    bounding_box:
        ``(min_lon, min_lat, max_lon, max_lat)`` in EPSG:4326.
    cell_size_m:
        Side length of each square grid cell in metres (default 500 m).

    Returns
    -------
    GeoDataFrame with columns:
        ``cell_id``, ``geometry``, ``ndvi``, ``ndwi``, ``slope``,
        ``elevation``, ``dist_forest_m``, ``is_mock``

    The returned CRS is EPSG:4326.
    """
    min_lon, min_lat, max_lon, max_lat = bounding_box
    centre_lat = (min_lat + max_lat) / 2.0

    # Convert cell size from metres to degrees
    d_lat = cell_size_m / _M_PER_DEG_LAT
    d_lon = cell_size_m / _m_per_deg_lon(centre_lat)

    # Build grid of polygons
    cells: list[dict[str, Any]] = []

    lat = min_lat
    row_idx = 0
    while lat + d_lat <= max_lat + 1e-9:  # tolerance for floating point
        lon = min_lon
        col_idx = 0
        while lon + d_lon <= max_lon + 1e-9:
            cell_min_lon = lon
            cell_min_lat = lat
            cell_max_lon = min(lon + d_lon, max_lon)
            cell_max_lat = min(lat + d_lat, max_lat)

            polygon = box(cell_min_lon, cell_min_lat, cell_max_lon, cell_max_lat)
            cell_id = f"R{row_idx:04d}_C{col_idx:04d}"

            cells.append(
                {
                    "cell_id": cell_id,
                    "geometry": polygon,
                    "bounds": (cell_min_lon, cell_min_lat, cell_max_lon, cell_max_lat),
                }
            )
            lon += d_lon
            col_idx += 1
        lat += d_lat
        row_idx += 1

    if not cells:
        logger.warning(
            "Bounding box %s is too small for %d m cells – returning empty grid.",
            bounding_box,
            cell_size_m,
        )
        return gpd.GeoDataFrame(
            columns=[
                "cell_id",
                "geometry",
                "ndvi",
                "ndwi",
                "slope",
                "elevation",
                "dist_forest_m",
                "is_mock",
            ],
            geometry="geometry",
            crs="EPSG:4326",
        )

    logger.info(
        "Generated %d grid cells (%d m) for bounding box %s",
        len(cells),
        cell_size_m,
        bounding_box,
    )

    # ── Extract zonal features per cell ──────────────────────────────────
    enriched = _enrich_cells(cells)

    gdf = gpd.GeoDataFrame(enriched, geometry="geometry", crs="EPSG:4326")
    gdf = gdf.drop(columns=["bounds"], errors="ignore")
    return gdf


# ── Zonal feature extraction ────────────────────────────────────────────


def _enrich_cells(cells: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach environmental features to each cell dict (in-place).

    Calls ``extract_features`` per cell – which auto-falls-back to mock
    data when GEE is unavailable.
    """
    rng = np.random.default_rng(42)

    for cell in cells:
        bounds: tuple[float, float, float, float] = cell["bounds"]
        features: GEEFeatures = extract_features(bounds)

        cell["ndvi"] = features.ndvi
        cell["ndwi"] = features.ndwi
        cell["slope"] = features.slope
        cell["elevation"] = features.elevation
        cell["is_mock"] = features.is_mock

        # dist_forest_m is not available from GEE directly – approximate
        # with a heuristic or mock.  In production this would come from
        # a Hansen-style forest-cover mask + proximity analysis.
        cell["dist_forest_m"] = _estimate_forest_distance(bounds, rng)

    return cells


def _estimate_forest_distance(
    bounds: tuple[float, float, float, float],
    rng: np.random.Generator,
) -> float:
    """Estimate distance to nearest forest edge (placeholder).

    In production, replace with a GEE computation against Hansen Global
    Forest Change (``UMD/hansen/global_forest_change_*``) or a local
    vector overlay.
    """
    # Deterministic-ish synthetic value in 0 – 8 000 m range
    centre_lon = (bounds[0] + bounds[2]) / 2.0
    centre_lat = (bounds[1] + bounds[3]) / 2.0
    base = abs(math.sin(centre_lon * 100) * math.cos(centre_lat * 100))
    jitter = float(rng.uniform(-500, 500))
    return round(max(0.0, base * 6_000 + jitter), 1)


# ── Utility helpers ──────────────────────────────────────────────────────


def grid_to_geojson(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    """Serialise the grid GeoDataFrame to a GeoJSON dict."""
    return gdf.__geo_interface__


def grid_summary(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    """Return quick summary statistics for the grid."""
    if gdf.empty:
        return {"n_cells": 0}
    return {
        "n_cells": len(gdf),
        "ndvi_mean": round(float(gdf["ndvi"].mean()), 4),
        "ndwi_mean": round(float(gdf["ndwi"].mean()), 4),
        "slope_mean": round(float(gdf["slope"].mean()), 2),
        "elevation_mean": round(float(gdf["elevation"].mean()), 1),
        "dist_forest_m_mean": round(float(gdf["dist_forest_m"].mean()), 1),
    }
