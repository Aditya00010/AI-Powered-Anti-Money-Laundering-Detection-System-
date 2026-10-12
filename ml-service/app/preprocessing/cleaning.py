"""
Project Vigilance - Deterministic Data Cleaning & Normalization
==============================================================
Module: ml-service/app/preprocessing/cleaning.py

Purpose:
Performs deterministic, non-destructive cleaning, standardized type conversions,
and string hygiene while strictly enforcing:
  - Preservation of raw monetary values (no clipping / capping)
  - Preservation of legitimate nulls (device_id, crypto_wallet)
  - Zero blanket imputation
  - Zero silent row drops
  - Preservation of entity relationships (no collapsing multi-customer accounts)
"""

from typing import Dict, Any, Tuple
import pandas as pd
import numpy as np

from .schema import (
    REQUIRED_TRANSACTION_COLUMNS,
    NULLABLE_COLUMNS,
)


class DataCleaner:
    """
    Cleans and standardizes verified transaction DataFrames deterministically.
    """

    @staticmethod
    def clean(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Executes deterministic cleaning pipeline:
          1. Strips leading/trailing whitespace from string columns without altering nulls.
          2. Standardizes 'amount' as double precision float (float64) without clipping/capping.
          3. Standardizes 'currency' uppercase (e.g. 'INR', 'USDT').
          4. Standardizes 'channel' trimmed string.
          5. Standardizes 'is_crypto' as strict boolean (True/False).
          6. Standardizes 'crypto_wallet' and 'device_id' (preserves NaN as NaN / None).
          7. Preserves entity relationships untouched.

        Returns (cleaned_df, cleaning_summary).
        """
        cleaned = df.copy()
        summary = {
            "initial_rows": len(df),
            "final_rows": len(df),
            "dropped_rows": 0,
            "modified_columns": [],
        }

        # 1. Clean string columns (trim whitespace, preserve nulls)
        string_cols = [
            "transaction_id",
            "sender_account",
            "sender_name",
            "sender_customer_id",
            "receiver_account",
            "receiver_name",
            "receiver_customer_id",
            "channel",
            "ip_address",
            "device_id",
            "location_country",
            "location_city",
            "crypto_wallet",
        ]

        for col in string_cols:
            if col in cleaned.columns:
                # Retain NaN while stripping strings
                mask = cleaned[col].notna()
                cleaned.loc[mask, col] = cleaned.loc[mask, col].astype(str).str.strip()

        # 2. Currency standardization (uppercase trimmed)
        if "currency" in cleaned.columns:
            cleaned["currency"] = cleaned["currency"].astype(str).str.strip().str.upper()

        # 3. Amount standardization (float64 numeric, preserving exact monetary precision)
        if "amount" in cleaned.columns:
            cleaned["amount"] = pd.to_numeric(cleaned["amount"], errors="raise").astype(np.float64)

        # 4. Standardize is_crypto as strict boolean
        if "is_crypto" in cleaned.columns:
            cleaned["is_crypto"] = (
                cleaned["is_crypto"]
                .astype(str)
                .str.strip()
                .str.lower()
                .isin(["true", "1", "yes", "t"])
                .astype(bool)
            )

        # 5. Legitimate null preservation: device_id and crypto_wallet
        # Replace empty strings with np.nan for consistent nullable handling
        if "device_id" in cleaned.columns:
            empty_dev = cleaned["device_id"] == ""
            if empty_dev.any():
                cleaned.loc[empty_dev, "device_id"] = np.nan

        if "crypto_wallet" in cleaned.columns:
            empty_wallet = cleaned["crypto_wallet"] == ""
            if empty_wallet.any():
                cleaned.loc[empty_wallet, "crypto_wallet"] = np.nan

        summary["modified_columns"] = list(cleaned.columns)
        return cleaned, summary
