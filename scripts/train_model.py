#!/usr/bin/env python3
"""One-shot script to train the wildlife-raid Random Forest and export
the serialised model to app/ml/artifacts/rf_model.joblib.

Usage
-----
    python -m scripts.train_model          # from project root
    python scripts/train_model.py          # or directly
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Ensure the project root is on sys.path so `app` is importable.
_PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from app.ml.model import predict_grid_risk, train_and_export_model  # noqa: E402


def main() -> None:
    print("=" * 60)
    print("  EcoShield – Wildlife-Raid Risk Model Training")
    print("=" * 60)

    t0 = time.perf_counter()
    model_path = train_and_export_model(
        n_samples=10_000,
        raid_fraction=0.025,
        seed=42,
    )
    elapsed = time.perf_counter() - t0
    print(f"Training completed in {elapsed:.2f}s")
    print(f"Artifact : {model_path}  ({model_path.stat().st_size / 1024:.0f} KB)")

    # Quick smoke test
    print("\n── Smoke-test inference ──")
    sample_features = [0.35, 0.55, 8.0, 400.0, 1200.0, 180.0, 24.0]
    risk = predict_grid_risk(sample_features)
    print(f"Input features : {sample_features}")
    print(f"Predicted risk : {risk:.4f}")
    print("Done ✓")


if __name__ == "__main__":
    main()
