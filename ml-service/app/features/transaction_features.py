"""
Project Vigilance - Transaction-Level Feature Engineering
=========================================================
Module: ml-service/app/features/transaction_features.py

Purpose:
Extracts deterministic transaction-level features from validated fields:
  - amount (raw monetary value preserved)
  - log_amount (natural logarithm for variance stabilization)
  - is_crypto (binary flag)
  - currency representation (deterministic binary indicators)
  - channel representation (deterministic binary indicators)
  - is_cross_border (contextual geographic indicator)
"""

from typing import List, Dict, Any, Tuple
import numpy as np
import pandas as pd


APPROVED_CURRENCIES = ["INR", "USDT"]
APPROVED_CHANNELS = [
    "UPI",
    "IMPS",
    "NEFT",
    "Crypto Gateway",
    "RTGS",
    "Card",
]


def extract_transaction_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes transaction-level features without label leakage.
    Returns a new DataFrame containing engineered transaction features.
    """
    out = pd.DataFrame(index=df.index)

    # 1. Raw amount & log_amount
    out["amount"] = df["amount"].astype(np.float64)
    out["log_amount"] = np.log1p(df["amount"].astype(np.float64))

    # 2. is_crypto as binary flag
    out["is_crypto"] = df["is_crypto"].astype(int)

    # 3. Currency deterministic one-hot representation
    for curr in APPROVED_CURRENCIES:
        col_name = f"currency_{curr}"
        out[col_name] = (df["currency"].astype(str).str.strip().str.upper() == curr).astype(int)

    # 4. Channel deterministic one-hot representation
    for ch in APPROVED_CHANNELS:
        # Sanitize column name for clean model feature naming
        clean_ch = ch.replace(" ", "_")
        col_name = f"channel_{clean_ch}"
        out[col_name] = (df["channel"].astype(str).str.strip() == ch).astype(int)

    # 5. Cross-border contextual indicator (India vs foreign jurisdiction)
    out["is_cross_border"] = (df["location_country"].astype(str).str.strip() != "India").astype(int)

    return out
