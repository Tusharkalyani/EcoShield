"""Geospatial context filters for EcoShield risk scoring.

Applies population/settlement and park-proximity rules:

* Any grid cell centre **inside or within 1 500 m of the Volcanoes National Park
  boundary** retains its full ML/ESI-computed risk score.
* Any cell centre **farther than 1 500 m from the park boundary** is capped at
  SAFE_SCORE_CAP (< 0.15) – 100 % green – because wildlife raids are extremely
  rare outside the park's immediate agricultural corridor.
* Any cell centre **within the settlement exclusion radius of a major town**
  (Musanze, Ruhengeri, Kinigi town, etc.) is also capped, because dense human
  settlement deters wildlife.

Park polygon source: Digitised from IUCN WDPA (Rwanda), simplified to 24 vertices.
Coordinate system: EPSG:4326 (WGS84 lat/lon).  Accuracy: ±300 m at 500 m cell size.

Usage
-----
    from app.ml.geo_filters import apply_geo_context_filter, filter_score
    adjusted = filter_score(lat, lon, raw_score)
"""

from __future__ import annotations

import math
from typing import NamedTuple

# ── Thresholds ────────────────────────────────────────────────────────────────

PARK_PROXIMITY_THRESHOLD_M: float = 1_500.0
"""Cells within this distance of the park boundary keep their full risk score."""

SETTLEMENT_EXCLUSION_RADIUS_M: float = 1_000.0
"""Default radius around town centres where wildlife raids are unlikely (metres)."""

SAFE_SCORE_CAP: float = 0.14
"""Maximum risk score for coordinates outside the wildlife-corridor zone."""

# ── Volcanoes National Park boundary (corrected polygon, EPSG:4326) ───────────
#
# Eastern Rwanda portion of VNP – Kinigi agricultural corridor.
# Excludes Musanze/Ruhengeri towns (east of park).
# Extends to DRC border (west) and Uganda border (north).
# Format: list of (lat, lon), counter-clockwise, closed.

PARK_BOUNDARY_COORDS: list[tuple[float, float]] = [
    (-1.3800, 29.5100),   # N – near Uganda border / Muhabura
    (-1.3900, 29.5350),
    (-1.4050, 29.5500),
    (-1.4200, 29.5600),
    (-1.4350, 29.5680),
    (-1.4500, 29.5720),   # NE – park edge near Kinigi sector
    (-1.4650, 29.5700),
    (-1.4780, 29.5660),   # E edge – Kinigi / agricultural corridor
    (-1.4900, 29.5600),
    (-1.5050, 29.5500),
    (-1.5200, 29.5350),
    (-1.5350, 29.5150),
    (-1.5450, 29.4950),   # SE
    (-1.5500, 29.4700),
    (-1.5450, 29.4450),   # S-SW
    (-1.5300, 29.4250),
    (-1.5100, 29.4100),   # W – DRC border area
    (-1.4850, 29.3950),
    (-1.4600, 29.3900),
    (-1.4350, 29.4000),
    (-1.4150, 29.4200),
    (-1.4000, 29.4450),
    (-1.3900, 29.4700),
    (-1.3800, 29.4950),
    (-1.3800, 29.5100),   # closed
]

# ── Major settlements to exclude from high-risk scoring ──────────────────────

class Settlement(NamedTuple):
    name: str
    lat: float
    lon: float
    radius_m: float = SETTLEMENT_EXCLUSION_RADIUS_M

SETTLEMENTS: list[Settlement] = [
    Settlement("Musanze/Ruhengeri",  -1.4994, 29.6342, 2_500.0),  # city, largest
    Settlement("Kinigi town centre", -1.4860, 29.5842, 1_200.0),  # tourism hub
    Settlement("Nyakinama",          -1.5261, 29.5953, 1_000.0),
    Settlement("Mukamira",           -1.4820, 29.6089, 1_000.0),
    Settlement("Busogo",             -1.5531, 29.5706, 1_000.0),
    Settlement("Cyuve",              -1.5253, 29.5444,   900.0),
    Settlement("Nkotsi",             -1.5103, 29.5214,   900.0),
    Settlement("Gataraga",           -1.4703, 29.6194,   900.0),
    Settlement("Kinoni",             -1.4567, 29.5950,   800.0),
]

# ── Maths helpers ─────────────────────────────────────────────────────────────

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in metres between two (lat, lon) points."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _dist_to_segment_m(
    px: float, py: float,   # point (lat, lon)
    ax: float, ay: float,   # segment start (lat, lon)
    bx: float, by: float,   # segment end   (lat, lon)
) -> float:
    """Minimum distance from point to line segment, returned in metres."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_m(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return _haversine_m(px, py, ax + t * dx, ay + t * dy)


def _point_in_polygon(lat: float, lon: float, polygon: list[tuple[float, float]]) -> bool:
    """Ray-casting test – True when (lat, lon) is inside the closed polygon."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][1], polygon[i][0]   # lon, lat
        xj, yj = polygon[j][1], polygon[j][0]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def distance_to_park_boundary_m(lat: float, lon: float) -> float:
    """Minimum distance (metres) from (lat, lon) to the nearest park boundary segment."""
    boundary = PARK_BOUNDARY_COORDS
    min_dist = math.inf
    for i in range(len(boundary) - 1):
        lat_a, lon_a = boundary[i]
        lat_b, lon_b = boundary[i + 1]
        d = _dist_to_segment_m(lat, lon, lat_a, lon_a, lat_b, lon_b)
        if d < min_dist:
            min_dist = d
    return float(min_dist)


def is_inside_park(lat: float, lon: float) -> bool:
    """True if the coordinate is inside the Volcanoes NP polygon."""
    return _point_in_polygon(lat, lon, PARK_BOUNDARY_COORDS)


def distance_to_nearest_settlement_m(lat: float, lon: float) -> tuple[float, str]:
    """Return (distance_m, name) for the closest major settlement."""
    best_dist, best_name = math.inf, "none"
    for s in SETTLEMENTS:
        d = _haversine_m(lat, lon, s.lat, s.lon)
        if d < best_dist:
            best_dist, best_name = d, s.name
    return float(best_dist), best_name


# ── Result container ──────────────────────────────────────────────────────────

class GeoContextResult:
    """Detailed result of the geo-context filter call."""
    __slots__ = (
        "adjusted_score", "original_score", "capped",
        "cap_reason", "dist_to_park_m", "dist_to_settlement_m",
        "inside_park", "nearest_settlement",
    )

    def __init__(
        self,
        adjusted_score: float,
        original_score: float,
        capped: bool,
        cap_reason: str,
        dist_to_park_m: float,
        dist_to_settlement_m: float,
        inside_park: bool,
        nearest_settlement: str,
    ) -> None:
        self.adjusted_score       = round(adjusted_score, 4)
        self.original_score       = round(original_score, 4)
        self.capped               = capped
        self.cap_reason           = cap_reason
        self.dist_to_park_m       = round(dist_to_park_m, 1)
        self.dist_to_settlement_m = round(dist_to_settlement_m, 1)
        self.inside_park          = inside_park
        self.nearest_settlement   = nearest_settlement


# ── Main filter ───────────────────────────────────────────────────────────────

def apply_geo_context_filter(lat: float, lon: float, raw_score: float) -> GeoContextResult:
    """Apply park-proximity and settlement filters to a raw danger score.

    Decision logic (checked in order):
    1. Inside park polygon        → keep raw_score (maximum danger zone).
    2. Within settlement radius   → cap at SAFE_SCORE_CAP (settlement trumps corridor).
    3. Within PARK_PROXIMITY_THRESHOLD_M of boundary → keep raw_score.
    4. Otherwise (too far from park) → cap at SAFE_SCORE_CAP.
    """
    dist_park_m          = distance_to_park_boundary_m(lat, lon)
    dist_settlement_m, nearest_settlement = distance_to_nearest_settlement_m(lat, lon)
    inside               = is_inside_park(lat, lon)

    nearest_obj    = next((s for s in SETTLEMENTS if s.name == nearest_settlement), None)
    settle_radius  = nearest_obj.radius_m if nearest_obj else SETTLEMENT_EXCLUSION_RADIUS_M

    # 1. Inside park
    if inside:
        # Still cap if right on the edge of a settlement (e.g. park gate compounds)
        if dist_settlement_m < settle_radius:
            capped_score = min(raw_score, SAFE_SCORE_CAP)
            return GeoContextResult(
                adjusted_score=capped_score, original_score=raw_score, capped=True,
                cap_reason=f"settlement_inside_park ({nearest_settlement})",
                dist_to_park_m=0.0, dist_to_settlement_m=dist_settlement_m,
                inside_park=True, nearest_settlement=nearest_settlement,
            )
        return GeoContextResult(
            adjusted_score=raw_score, original_score=raw_score, capped=False,
            cap_reason="inside_park",
            dist_to_park_m=0.0, dist_to_settlement_m=dist_settlement_m,
            inside_park=True, nearest_settlement=nearest_settlement,
        )

    # 2. Settlement proximity (applies everywhere outside park too)
    if dist_settlement_m < settle_radius:
        return GeoContextResult(
            adjusted_score=min(raw_score, SAFE_SCORE_CAP), original_score=raw_score,
            capped=True,
            cap_reason=f"settlement_proximity ({nearest_settlement}, {dist_settlement_m:.0f}m)",
            dist_to_park_m=dist_park_m, dist_to_settlement_m=dist_settlement_m,
            inside_park=False, nearest_settlement=nearest_settlement,
        )

    # 3. Within park corridor (outside boundary but close enough)
    if dist_park_m <= PARK_PROXIMITY_THRESHOLD_M:
        return GeoContextResult(
            adjusted_score=raw_score, original_score=raw_score, capped=False,
            cap_reason=f"within_park_corridor ({dist_park_m:.0f}m from boundary)",
            dist_to_park_m=dist_park_m, dist_to_settlement_m=dist_settlement_m,
            inside_park=False, nearest_settlement=nearest_settlement,
        )

    # 4. Too far from park – green zone
    return GeoContextResult(
        adjusted_score=min(raw_score, SAFE_SCORE_CAP), original_score=raw_score,
        capped=True,
        cap_reason=f"outside_park_corridor ({dist_park_m:.0f}m from boundary, threshold={PARK_PROXIMITY_THRESHOLD_M:.0f}m)",
        dist_to_park_m=dist_park_m, dist_to_settlement_m=dist_settlement_m,
        inside_park=False, nearest_settlement=nearest_settlement,
    )


def filter_score(lat: float, lon: float, raw_score: float) -> float:
    """Lightweight wrapper – returns only the adjusted score float."""
    return apply_geo_context_filter(lat, lon, raw_score).adjusted_score
