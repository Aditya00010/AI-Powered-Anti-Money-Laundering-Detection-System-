"""
Project Vigilance - Leakage-Safe Velocity Feature Engineering
=============================================================
Module: ml-service/app/features/velocity_features.py

Purpose:
Computes high-performance, strictly past-looking rolling window transaction counts,
monetary volume sums, and counterparty diversities over 1-hour (3600s) and 24-hour (86400s) windows.

Strict Leakage Invariant:
For transaction T at timestamp t_T, the window [t_T - Window, t_T) strictly EXCLUDES
the current transaction T itself and any transactions occurring after T.
"""

from typing import Tuple, Dict, Any
import numpy as np
import pandas as pd


def compute_entity_velocity_features(
    df: pd.DataFrame,
    entity_col: str,
    prefix: str,
    counterparty_col: str,
) -> pd.DataFrame:
    """
    Computes past 1-hour and past 24-hour transaction velocity and counterparty diversity
    for an entity (sender or receiver).

    Assumes input df is already sorted by [timestamp, transaction_id] ascending.
    """
    n = len(df)
    out = pd.DataFrame(index=df.index)

    # Convert timestamps to epoch seconds for fast binary search
    if pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        ts_sec = df["timestamp"].values.astype("datetime64[s]").astype("int64")
    else:
        ts_sec = pd.to_datetime(df["timestamp"], utc=True).values.astype("datetime64[s]").astype("int64")

    amounts = df["amount"].astype(np.float64).values
    counterparties = df[counterparty_col].astype(str).values

    count_1h = np.zeros(n, dtype=np.int32)
    amount_1h = np.zeros(n, dtype=np.float64)
    count_24h = np.zeros(n, dtype=np.int32)
    amount_24h = np.zeros(n, dtype=np.float64)
    uniq_cp_1h = np.zeros(n, dtype=np.int32)
    uniq_cp_24h = np.zeros(n, dtype=np.int32)

    # Group entity indices preserving chronological order
    groups = df.groupby(entity_col, sort=False).indices

    for entity, idxs in groups.items():
        m = len(idxs)
        if m <= 1:
            # First and only transaction for entity has 0 prior transactions
            continue

        g_ts = ts_sec[idxs]
        g_amt = amounts[idxs]
        g_cp = counterparties[idxs]
        cum_amt = np.cumsum(g_amt)

        for k in range(1, m):
            t_k = g_ts[k]
            # 1h Window: strictly [t_k - 3600, t_k)
            t_1h_start = t_k - 3600
            j_1h = np.searchsorted(g_ts[:k], t_1h_start, side="left")
            count_1h[idxs[k]] = k - j_1h
            amount_1h[idxs[k]] = cum_amt[k - 1] - (cum_amt[j_1h - 1] if j_1h > 0 else 0.0)
            uniq_cp_1h[idxs[k]] = len(set(g_cp[j_1h:k]))

            # 24h Window: strictly [t_k - 86400, t_k)
            t_24h_start = t_k - 86400
            j_24h = np.searchsorted(g_ts[:k], t_24h_start, side="left")
            count_24h[idxs[k]] = k - j_24h
            amount_24h[idxs[k]] = cum_amt[k - 1] - (cum_amt[j_24h - 1] if j_24h > 0 else 0.0)
            uniq_cp_24h[idxs[k]] = len(set(g_cp[j_24h:k]))

    out[f"{prefix}_txn_count_prev_1h"] = count_1h
    out[f"{prefix}_amount_sum_prev_1h"] = amount_1h
    out[f"{prefix}_txn_count_prev_24h"] = count_24h
    out[f"{prefix}_amount_sum_prev_24h"] = amount_24h
    out[f"{prefix}_unique_counterparties_prev_1h"] = uniq_cp_1h
    out[f"{prefix}_unique_counterparties_prev_24h"] = uniq_cp_24h

    return out


def extract_velocity_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes all sender and receiver velocity features across 1h and 24h rolling windows.
    Returns combined velocity feature DataFrame.
    """
    # Sender velocity & counterparty diversity
    sender_vel = compute_entity_velocity_features(
        df=df,
        entity_col="sender_account",
        prefix="sender",
        counterparty_col="receiver_account",
    )
    # Rename counterparty column to explicit semantic name
    sender_vel.rename(
        columns={
            "sender_unique_counterparties_prev_1h": "sender_unique_receivers_prev_1h",
            "sender_unique_counterparties_prev_24h": "sender_unique_receivers_prev_24h",
        },
        inplace=True,
    )

    # Receiver velocity & counterparty diversity
    receiver_vel = compute_entity_velocity_features(
        df=df,
        entity_col="receiver_account",
        prefix="receiver",
        counterparty_col="sender_account",
    )
    receiver_vel.rename(
        columns={
            "receiver_unique_counterparties_prev_1h": "receiver_unique_senders_prev_1h",
            "receiver_unique_counterparties_prev_24h": "receiver_unique_senders_prev_24h",
        },
        inplace=True,
    )

    return pd.concat([sender_vel, receiver_vel], axis=1)
