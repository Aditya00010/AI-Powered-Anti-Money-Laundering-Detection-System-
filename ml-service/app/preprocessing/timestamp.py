"""
Project Vigilance - Timestamp Normalization & Basic Temporal Features
====================================================================
Module: ml-service/app/preprocessing/timestamp.py

Purpose:
Deterministic timestamp parsing, UTC timezone standardization, and extraction of
basic transaction-level temporal fields (date, hour, weekday).

Strict Boundary Guardrail:
Phase 1 derives ONLY basic date, hour, and weekday.
DO NOT implement rolling windows, velocity features, or account counters here.
Those belong strictly to Phase 2.
"""

from typing import Tuple
import pandas as pd
import numpy as np


def parse_and_normalize_timestamps(series: pd.Series) -> pd.Series:
    """
    Parses ISO-8601 timestamps and normalizes strictly to UTC timezone.
    Raises ValueError if invalid dates are encountered (no silent NaN conversion).
    """
    parsed = pd.to_datetime(series, format="ISO8601", utc=True)
    if parsed.isna().sum() > series.isna().sum():
        raise ValueError("Invalid timestamp encountered during deterministic UTC conversion.")
    return parsed


def extract_basic_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Extracts strictly basic temporal attributes from normalized UTC timestamp:
      - transaction_date: string (YYYY-MM-DD)
      - transaction_hour: integer (0 - 23)
      - transaction_weekday: integer (0 - 6, where Monday=0, Sunday=6)

    Returns a new DataFrame with the 3 canonical derived columns appended.
    Does NOT mutate input DataFrame in place.
    """
    out_df = df.copy()

    # Ensure UTC datetime format
    if not pd.api.types.is_datetime64_any_dtype(out_df["timestamp"]):
        utc_dt = parse_and_normalize_timestamps(out_df["timestamp"])
    else:
        utc_dt = pd.to_datetime(out_df["timestamp"], utc=True)

    out_df["transaction_date"] = utc_dt.dt.strftime("%Y-%m-%d")
    out_df["transaction_hour"] = utc_dt.dt.hour.astype(np.int32)
    out_df["transaction_weekday"] = utc_dt.dt.weekday.astype(np.int32)

    return out_df
