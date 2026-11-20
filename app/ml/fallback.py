"""Rule-based Environmental Susceptibility Index (ESI) fallback.

Used when historical wildlife-sighting data is unavailable and the
trained Random Forest model cannot produce a meaningful prediction.

ESI = 0.40 * NDVI + 0.30 * Moisture + 0.30 * (1 - NormDist)

All inputs are expected to be **normalised to [0, 1]** before calling
``compute_esi``.  Helper normalisers are included for convenience.
"""

from __future__ import annotations


def normalise(value: float, min_val: float, max_val: float) -> float:
    """Min-max normalise *value* into [0, 1], clamped."""
    if max_val == min_val:
        return 0.0
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def compute_esi(
    ndvi_norm: float,
    moisture_norm: float,
    dist_norm: float,
) -> float:
    """Calculate the Environmental Susceptibility Index.

    Parameters
    ----------
    ndvi_norm:
        Normalised NDVI value in [0, 1].  Higher → denser vegetation →
        greater wildlife habitat suitability.
    moisture_norm:
        Normalised soil / surface moisture proxy (e.g. NDWI) in [0, 1].
    dist_norm:
        Normalised distance to nearest forest edge in [0, 1]
        (0 = adjacent, 1 = maximum observed distance).

    Returns
    -------
    float in [0, 1] – higher values indicate greater environmental
    susceptibility to wildlife raids.
    """
    esi: float = (
        0.40 * ndvi_norm
        + 0.30 * moisture_norm
        + 0.30 * (1.0 - dist_norm)
    )
    # Clamp to guard against tiny floating-point drift
    return max(0.0, min(1.0, esi))


def esi_from_raw(
    ndvi: float,
    moisture: float,
    distance_m: float,
    *,
    ndvi_range: tuple[float, float] = (-0.2, 1.0),
    moisture_range: tuple[float, float] = (-0.5, 1.0),
    distance_range: tuple[float, float] = (0.0, 10_000.0),
) -> float:
    """Convenience wrapper that normalises raw values, then computes ESI.

    Parameters
    ----------
    ndvi:
        Raw NDVI (typically -0.2 … 1.0).
    moisture:
        Raw moisture index (e.g. NDWI, typically -0.5 … 1.0).
    distance_m:
        Distance to forest edge in metres.
    ndvi_range / moisture_range / distance_range:
        (min, max) pairs used for normalisation.  Override with
        dataset-specific bounds for better accuracy.
    """
    return compute_esi(
        ndvi_norm=normalise(ndvi, *ndvi_range),
        moisture_norm=normalise(moisture, *moisture_range),
        dist_norm=normalise(distance_m, *distance_range),
    )
