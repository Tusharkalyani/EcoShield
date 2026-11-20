"""Random-Forest wildlife-raid risk model with synthetic data generation.

Key design decisions
--------------------
* **Class imbalance**: raids occur in <3 % of observations.  We combine
  SMOTE oversampling (on the minority class) with ``class_weight='balanced'``
  to avoid a classifier that simply predicts "no raid" everywhere.
* **Calibration**: after fitting, we wrap the forest in a
  ``CalibratedClassifierCV`` so that ``predict_proba`` outputs true
  probabilities – which is what ``predict_grid_risk`` returns.
* **Persistence**: the final calibrated pipeline is serialised with
  ``joblib`` to ``app/ml/artifacts/rf_model.joblib``.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence

import joblib
import numpy as np
from numpy.typing import ArrayLike
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from imblearn.over_sampling import SMOTE
    from imblearn.pipeline import Pipeline as ImbPipeline

    _HAS_IMBLEARN = True
except ImportError:  # allow import even when imblearn is not installed
    _HAS_IMBLEARN = False

# ── Paths ────────────────────────────────────────────────────────────────

_ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = _ARTIFACTS_DIR / "rf_model.joblib"

# ── Feature order (must match inference) ─────────────────────────────────

FEATURE_NAMES: list[str] = [
    "ndvi",
    "ndwi",
    "slope",
    "dist_forest_m",
    "elevation",
    "precipitation",
    "temperature",
]

# ── Synthetic data generator ─────────────────────────────────────────────


def generate_synthetic_data(
    n_samples: int = 10_000,
    raid_fraction: float = 0.025,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """Generate synthetic spatial observations for model training.

    Parameters
    ----------
    n_samples:
        Total number of observations.
    raid_fraction:
        Fraction of positive (raid) labels – kept below 3 %.
    seed:
        Random seed for reproducibility.

    Returns
    -------
    X : ndarray of shape (n_samples, n_features)
    y : ndarray of shape (n_samples,)   – 0 = no raid, 1 = raid
    """
    rng = np.random.default_rng(seed)
    n_raids = int(n_samples * raid_fraction)
    n_safe = n_samples - n_raids

    # --- safe observations ---
    ndvi_safe = rng.uniform(0.4, 0.9, n_safe)
    ndwi_safe = rng.uniform(0.1, 0.5, n_safe)
    slope_safe = rng.uniform(0, 30, n_safe)
    dist_forest_safe = rng.uniform(1_000, 10_000, n_safe)
    elev_safe = rng.uniform(500, 2_500, n_safe)
    precip_safe = rng.uniform(50, 250, n_safe)
    temp_safe = rng.uniform(15, 35, n_safe)

    X_safe = np.column_stack(
        [ndvi_safe, ndwi_safe, slope_safe, dist_forest_safe, elev_safe, precip_safe, temp_safe]
    )

    # --- raid observations (closer to forest, wetter, lower NDVI) ---
    ndvi_raid = rng.uniform(0.15, 0.55, n_raids)
    ndwi_raid = rng.uniform(0.3, 0.8, n_raids)
    slope_raid = rng.uniform(0, 15, n_raids)
    dist_forest_raid = rng.uniform(0, 1_500, n_raids)
    elev_raid = rng.uniform(800, 2_000, n_raids)
    precip_raid = rng.uniform(100, 350, n_raids)
    temp_raid = rng.uniform(18, 30, n_raids)

    X_raid = np.column_stack(
        [ndvi_raid, ndwi_raid, slope_raid, dist_forest_raid, elev_raid, precip_raid, temp_raid]
    )

    X = np.vstack([X_safe, X_raid])
    y = np.concatenate([np.zeros(n_safe), np.ones(n_raids)])

    # shuffle
    idx = rng.permutation(n_samples)
    return X[idx], y[idx]


# ── Training ─────────────────────────────────────────────────────────────


def train_and_export_model(
    n_samples: int = 10_000,
    raid_fraction: float = 0.025,
    seed: int = 42,
) -> Path:
    """Train a calibrated Random Forest and persist it to disk.

    Returns the path to the saved model artifact.
    """
    if not _HAS_IMBLEARN:
        raise RuntimeError(
            "imbalanced-learn is required for training.  "
            "Install it with:  pip install imbalanced-learn"
        )

    X, y = generate_synthetic_data(n_samples, raid_fraction, seed)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=seed
    )

    # Pipeline: scale → SMOTE → balanced RF
    base_pipeline = ImbPipeline(
        [
            ("scaler", StandardScaler()),
            ("smote", SMOTE(random_state=seed)),
            (
                "rf",
                RandomForestClassifier(
                    n_estimators=200,
                    max_depth=12,
                    min_samples_leaf=5,
                    class_weight="balanced",
                    random_state=seed,
                    n_jobs=-1,
                ),
            ),
        ]
    )

    # Calibrate probabilities via 5-fold CV
    calibrated = CalibratedClassifierCV(
        estimator=base_pipeline,
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=seed),
        method="sigmoid",
    )
    calibrated.fit(X_train, y_train)

    # Evaluate on held-out set
    accuracy = calibrated.score(X_test, y_test)
    proba = calibrated.predict_proba(X_test)[:, 1]
    print(f"Test accuracy : {accuracy:.4f}")
    print(f"Raid prevalence in test set: {y_test.mean():.4f}")
    print(
        f"Predicted-proba stats  – "
        f"min={proba.min():.4f}  mean={proba.mean():.4f}  max={proba.max():.4f}"
    )

    # Persist
    _ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(calibrated, MODEL_PATH)
    print(f"Model saved → {MODEL_PATH}")
    return MODEL_PATH


# ── Inference ────────────────────────────────────────────────────────────

_model_cache: CalibratedClassifierCV | None = None


def _load_model() -> CalibratedClassifierCV:
    global _model_cache
    if _model_cache is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Trained model not found at {MODEL_PATH}.  "
                "Run train_and_export_model() first."
            )
        _model_cache = joblib.load(MODEL_PATH)
    return _model_cache


def predict_grid_risk(features: Sequence[float] | ArrayLike) -> float:
    """Return a calibrated raid-probability for a single grid cell.

    Parameters
    ----------
    features:
        A flat sequence of length ``len(FEATURE_NAMES)`` in the canonical
        feature order (ndvi, ndwi, slope, dist_forest_m, elevation,
        precipitation, temperature).

    Returns
    -------
    float in [0, 1] – calibrated probability of a wildlife raid.
    """
    model = _load_model()
    arr = np.asarray(features, dtype=np.float64).reshape(1, -1)
    if arr.shape[1] != len(FEATURE_NAMES):
        raise ValueError(
            f"Expected {len(FEATURE_NAMES)} features, got {arr.shape[1]}"
        )
    return float(model.predict_proba(arr)[0, 1])
