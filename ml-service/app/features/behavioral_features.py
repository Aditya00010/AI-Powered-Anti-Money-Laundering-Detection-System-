"""
Project Vigilance - Leakage-Safe Behavioral Feature Engineering
==============================================================
Module: ml-service/app/features/behavioral_features.py

Purpose:
Computes cumulative historical statistics, amount deviation ratios,
near-regulatory-threshold indicators, and crypto participation patterns for senders and receivers.

Strict Leakage Invariant:
For transaction T, only transactions strictly preceding T are used.
If T is the first transaction for an entity, historical counts/sums/averages are 0,
and deviation ratios default to 1.0.

Domain Disclaimer & Regulatory Context:
Under the Indian PMLA / FIU-IND Rule 3(1)(A) framework, the statutory Cash Transaction
Reporting (CTR) threshold is ₹10 Lakhs (₹1,000,000 INR).
Structuring (smurfing) behavioral patterns involve transacting just below statutory limits.
This feature is an objective behavioral indicator (count of prior sender transactions in the
configured 90%-100% threshold range), NOT a legal determination or fraud label.
The dataset contains non-cash channels (UPI, IMPS, NEFT, RTGS, Card, Crypto Gateway)
where reporting rules differ; thus, this serves as evidence for downstream ML scoring.
"""

from typing import Dict, Any, List
import numpy as np
import pandas as pd

# Regulatory CTR threshold and near-threshold ratio configuration
REGULATORY_CTR_THRESHOLD_INR: float = 1_000_000.0
NEAR_THRESHOLD_LOWER_RATIO: float = 0.90


def compute_entity_behavioral_features(
    df: pd.DataFrame,
    entity_col: str,
    prefix: str,
    counterparty_col: str,
) -> pd.DataFrame:
    """
    Computes prior historical cumulative statistics for an entity (sender or receiver):
      - txn_count_historical
      - amount_sum_historical
      - amount_avg_historical
      - amount_std_historical
      - unique_counterparties_historical
      - unique_channels_historical
      - crypto_txn_count_historical
      - amount_to_avg_ratio
      - amount_zscore_historical

    Assumes df is pre-sorted by [timestamp, transaction_id] ascending.
    """
    n = len(df)
    out = pd.DataFrame(index=df.index)

    amounts = df["amount"].astype(np.float64).values
    counterparties = df[counterparty_col].astype(str).values
    channels = df["channel"].astype(str).values
    is_crypto_arr = df["is_crypto"].astype(bool).values

    txn_count_hist = np.zeros(n, dtype=np.int32)
    amount_sum_hist = np.zeros(n, dtype=np.float64)
    amount_avg_hist = np.zeros(n, dtype=np.float64)
    amount_std_hist = np.zeros(n, dtype=np.float64)
    uniq_cp_hist = np.zeros(n, dtype=np.int32)
    uniq_chan_hist = np.zeros(n, dtype=np.int32)
    crypto_count_hist = np.zeros(n, dtype=np.int32)
    amt_to_avg_ratio = np.ones(n, dtype=np.float64)  # 1.0 default for first txn
    amt_zscore_hist = np.zeros(n, dtype=np.float64)

    groups = df.groupby(entity_col, sort=False).indices

    for entity, idxs in groups.items():
        m = len(idxs)
        if m == 0:
            continue

        g_amt = amounts[idxs]
        g_cp = counterparties[idxs]
        g_chan = channels[idxs]
        g_crypto = is_crypto_arr[idxs]

        running_sum = 0.0
        running_sq_sum = 0.0
        seen_cp = set()
        seen_chan = set()
        cum_crypto = 0

        for k in range(m):
            target_idx = idxs[k]

            if k == 0:
                # 1st transaction has zero prior history
                txn_count_hist[target_idx] = 0
                amount_sum_hist[target_idx] = 0.0
                amount_avg_hist[target_idx] = 0.0
                amount_std_hist[target_idx] = 0.0
                uniq_cp_hist[target_idx] = 0
                uniq_chan_hist[target_idx] = 0
                crypto_count_hist[target_idx] = 0
                amt_to_avg_ratio[target_idx] = 1.0
                amt_zscore_hist[target_idx] = 0.0
            else:
                prior_count = k
                avg_amt = running_sum / prior_count

                if prior_count > 1:
                    variance = (running_sq_sum - (running_sum ** 2) / prior_count) / (prior_count - 1)
                    std_amt = np.sqrt(max(0.0, variance))
                else:
                    std_amt = 0.0

                txn_count_hist[target_idx] = prior_count
                amount_sum_hist[target_idx] = running_sum
                amount_avg_hist[target_idx] = avg_amt
                amount_std_hist[target_idx] = std_amt
                uniq_cp_hist[target_idx] = len(seen_cp)
                uniq_chan_hist[target_idx] = len(seen_chan)
                crypto_count_hist[target_idx] = cum_crypto

                # Amount deviation relative to prior mean
                current_amt = g_amt[k]
                amt_to_avg_ratio[target_idx] = current_amt / avg_amt if avg_amt > 0 else 1.0
                amt_zscore_hist[target_idx] = (current_amt - avg_amt) / std_amt if std_amt > 0 else 0.0

            # Update running stats WITH transaction k (for future transactions k+1 onwards)
            amt_k = g_amt[k]
            running_sum += amt_k
            running_sq_sum += amt_k ** 2
            seen_cp.add(g_cp[k])
            seen_chan.add(g_chan[k])
            if g_crypto[k]:
                cum_crypto += 1

    out[f"{prefix}_txn_count_historical"] = txn_count_hist
    out[f"{prefix}_amount_sum_historical"] = amount_sum_hist
    out[f"{prefix}_amount_avg_historical"] = amount_avg_hist
    out[f"{prefix}_amount_std_historical"] = amount_std_hist
    out[f"{prefix}_unique_counterparties_historical"] = uniq_cp_hist
    out[f"{prefix}_unique_channels_historical"] = uniq_chan_hist
    out[f"{prefix}_crypto_txn_count_historical"] = crypto_count_hist
    out[f"amount_to_{prefix}_avg_ratio"] = amt_to_avg_ratio
    out[f"{prefix}_amount_zscore_historical"] = amt_zscore_hist

    return out


def compute_near_regulatory_threshold_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes near-regulatory-threshold behavioral evidence indicators:
      - sender_near_regulatory_threshold_txns_prev_24h: count of prior transactions by this sender
        in the previous 24 hours with amount near the configured regulatory threshold:
        lower_bound <= amount < REGULATORY_CTR_THRESHOLD_INR
        where lower_bound = REGULATORY_CTR_THRESHOLD_INR * NEAR_THRESHOLD_LOWER_RATIO (₹900,000 INR).

    Domain Disclaimer:
    The ₹1,000,000 value represents the configured INR threshold for applicable cash transaction
    reporting context under the Indian AML/PMLA framework. This feature is an objective behavioral
    indicator for downstream ML scoring, NOT a legal determination or fraud label.
    """
    n = len(df)
    out = pd.DataFrame(index=df.index)

    if pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        ts_sec = df["timestamp"].values.astype("datetime64[s]").astype("int64")
    else:
        ts_sec = pd.to_datetime(df["timestamp"], utc=True).values.astype("datetime64[s]").astype("int64")

    lower_bound = REGULATORY_CTR_THRESHOLD_INR * NEAR_THRESHOLD_LOWER_RATIO
    upper_bound = REGULATORY_CTR_THRESHOLD_INR

    amounts = df["amount"].astype(np.float64).values
    # In near-regulatory-threshold bracket indicator (exclusive upper bound)
    in_bracket = ((amounts >= lower_bound) & (amounts < upper_bound)).astype(np.int32)

    struct_count_24h = np.zeros(n, dtype=np.int32)
    groups = df.groupby("sender_account", sort=False).indices

    for sender, idxs in groups.items():
        m = len(idxs)
        if m <= 1:
            continue

        g_ts = ts_sec[idxs]
        g_in_b = in_bracket[idxs]
        cum_b = np.cumsum(g_in_b)

        for k in range(1, m):
            t_k = g_ts[k]
            t_24h_start = t_k - 86400
            j = np.searchsorted(g_ts[:k], t_24h_start, side="left")
            struct_count_24h[idxs[k]] = cum_b[k - 1] - (cum_b[j - 1] if j > 0 else 0)

    out["sender_near_regulatory_threshold_txns_prev_24h"] = struct_count_24h
    return out


def extract_behavioral_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes all sender and receiver historical behavioral attributes,
    amount ratios, and near-regulatory-threshold indicators.
    """
    sender_beh = compute_entity_behavioral_features(
        df=df,
        entity_col="sender_account",
        prefix="sender",
        counterparty_col="receiver_account",
    )
    sender_beh.rename(
        columns={
            "sender_unique_counterparties_historical": "sender_unique_receivers_historical",
        },
        inplace=True,
    )

    receiver_beh = compute_entity_behavioral_features(
        df=df,
        entity_col="receiver_account",
        prefix="receiver",
        counterparty_col="sender_account",
    )
    receiver_beh.rename(
        columns={
            "receiver_unique_counterparties_historical": "receiver_unique_senders_historical",
        },
        inplace=True,
    )

    near_threshold = compute_near_regulatory_threshold_indicators(df)

    return pd.concat([sender_beh, receiver_beh, near_threshold], axis=1)
