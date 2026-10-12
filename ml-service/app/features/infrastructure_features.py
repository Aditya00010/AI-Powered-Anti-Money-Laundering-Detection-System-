"""
Project Vigilance - Leakage-Safe Infrastructure Feature Engineering
===================================================================
Module: ml-service/app/features/infrastructure_features.py

Purpose:
Computes historical device and IP reuse statistics:
  - Prior transactions from device / IP
  - Unique accounts previously operating from device / IP
  - Unique customer IDs previously operating from device / IP
  - Velocity of transactions from device / IP in past 1h and 24h

Strict Missingness Guardrail:
Missing device_id values are strictly preserved; for transactions with null device_id,
all device features evaluate strictly to 0 (no shared 'UNKNOWN' or '0' placeholder).
"""

from typing import Dict, Any, List
import numpy as np
import pandas as pd


def compute_infrastructure_features_for_entity(
    df: pd.DataFrame,
    infra_col: str,
    prefix: str,
    allow_nulls: bool = False,
) -> pd.DataFrame:
    """
    Computes prior historical reuse and rolling velocity for device_id or ip_address.
    Assumes df is pre-sorted by [timestamp, transaction_id] ascending.
    """
    n = len(df)
    out = pd.DataFrame(index=df.index)

    if pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        ts_sec = df["timestamp"].values.astype("datetime64[s]").astype("int64")
    else:
        ts_sec = pd.to_datetime(df["timestamp"], utc=True).values.astype("datetime64[s]").astype("int64")

    accounts = df["sender_account"].astype(str).values
    customers = df["sender_customer_id"].astype(str).values

    hist_txns = np.zeros(n, dtype=np.int32)
    hist_accounts = np.zeros(n, dtype=np.int32)
    hist_customers = np.zeros(n, dtype=np.int32)
    vel_1h = np.zeros(n, dtype=np.int32)
    vel_24h = np.zeros(n, dtype=np.int32)

    # Filter out nulls if column is nullable (e.g. device_id)
    if allow_nulls:
        valid_mask = df[infra_col].notna() & (df[infra_col].astype(str).str.strip() != "")
        sub_df = df[valid_mask]
        groups = sub_df.groupby(infra_col, sort=False).indices
    else:
        groups = df.groupby(infra_col, sort=False).indices

    for key, idxs in groups.items():
        m = len(idxs)
        if m <= 1:
            continue

        g_ts = ts_sec[idxs]
        g_acc = accounts[idxs]
        g_cust = customers[idxs]

        seen_acc = set()
        seen_cust = set()

        for k in range(m):
            if k > 0:
                hist_txns[idxs[k]] = k
                hist_accounts[idxs[k]] = len(seen_acc)
                hist_customers[idxs[k]] = len(seen_cust)

                t_k = g_ts[k]
                # 1h Window
                j_1h = np.searchsorted(g_ts[:k], t_k - 3600, side="left")
                vel_1h[idxs[k]] = k - j_1h

                # 24h Window
                j_24h = np.searchsorted(g_ts[:k], t_k - 86400, side="left")
                vel_24h[idxs[k]] = k - j_24h

            seen_acc.add(g_acc[k])
            seen_cust.add(g_cust[k])

    out[f"{prefix}_txn_count_historical"] = hist_txns
    out[f"{prefix}_unique_accounts_historical"] = hist_accounts
    out[f"{prefix}_unique_customers_historical"] = hist_customers
    out[f"{prefix}_txn_count_prev_1h"] = vel_1h
    out[f"{prefix}_txn_count_prev_24h"] = vel_24h

    return out


def extract_infrastructure_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes all device and IP reuse and velocity features.
    """
    device_features = compute_infrastructure_features_for_entity(
        df=df,
        infra_col="device_id",
        prefix="device",
        allow_nulls=True,
    )

    ip_features = compute_infrastructure_features_for_entity(
        df=df,
        infra_col="ip_address",
        prefix="ip",
        allow_nulls=False,
    )

    return pd.concat([device_features, ip_features], axis=1)
