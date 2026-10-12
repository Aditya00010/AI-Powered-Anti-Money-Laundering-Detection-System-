"""
Project Vigilance - Temporal Feature Engineering
================================================
Module: ml-service/app/features/temporal_features.py

Purpose:
Extracts deterministic temporal and cyclical features from normalized UTC timestamps.
Strictly past/current timestamp semantics only; no future calculations.
"""

import numpy as np
import pandas as pd


def extract_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Derives deterministic calendar and cyclical temporal attributes.
    Returns a new DataFrame containing engineered temporal features.
    """
    out = pd.DataFrame(index=df.index)

    # Ensure UTC timestamp
    if pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        dt = pd.to_datetime(df["timestamp"], utc=True)
    else:
        dt = pd.to_datetime(df["timestamp"], format="ISO8601", utc=True)

    out["transaction_hour"] = dt.dt.hour.astype(np.int32)
    out["transaction_weekday"] = dt.dt.weekday.astype(np.int32)
    out["transaction_day"] = dt.dt.day.astype(np.int32)

    # Weekend flag (Saturday=5, Sunday=6)
    out["is_weekend"] = dt.dt.weekday.isin([5, 6]).astype(int)

    # Cyclical hour encoding (sin / cos) to preserve 23:00 -> 00:00 continuity
    hour_radians = 2.0 * np.pi * out["transaction_hour"] / 24.0
    out["hour_sin"] = np.sin(hour_radians).astype(np.float64)
    out["hour_cos"] = np.cos(hour_radians).astype(np.float64)

    return out
