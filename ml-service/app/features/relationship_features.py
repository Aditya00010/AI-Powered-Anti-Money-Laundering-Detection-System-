"""
Project Vigilance - Leakage-Safe Entity Relationship Feature Engineering
========================================================================
Module: ml-service/app/features/relationship_features.py

Purpose:
Computes historical entity relationship metrics while preserving the multi-customer
account relationships discovered during Phase 0:
  - sender_customers_count_historical: distinct customer IDs operating sender account prior to T
  - receiver_customers_count_historical: distinct customer IDs operating receiver account prior to T
  - sender_customer_accounts_count_historical: distinct accounts operated by sender customer prior to T

Strict Relationship Guardrail:
Does NOT collapse multiple customers to a single customer.
Does NOT overwrite entity links.
Zero ground-truth dependence.
"""

from typing import Dict, Any, List
import numpy as np
import pandas as pd


def extract_relationship_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes prior historical entity mapping counts without future leakage.
    Assumes df is pre-sorted by [timestamp, transaction_id] ascending.
    """
    n = len(df)
    out = pd.DataFrame(index=df.index)

    sender_accs = df["sender_account"].astype(str).values
    sender_custs = df["sender_customer_id"].astype(str).values
    receiver_accs = df["receiver_account"].astype(str).values
    receiver_custs = df["receiver_customer_id"].astype(str).values

    sender_cust_count = np.zeros(n, dtype=np.int32)
    receiver_cust_count = np.zeros(n, dtype=np.int32)
    cust_acc_count = np.zeros(n, dtype=np.int32)

    # 1. Sender account -> historical distinct customer IDs
    sender_groups = df.groupby("sender_account", sort=False).indices
    for acc, idxs in sender_groups.items():
        seen = set()
        for k, idx in enumerate(idxs):
            if k > 0:
                sender_cust_count[idx] = len(seen)
            seen.add(sender_custs[idx])

    # 2. Receiver account -> historical distinct customer IDs
    receiver_groups = df.groupby("receiver_account", sort=False).indices
    for acc, idxs in receiver_groups.items():
        seen = set()
        for k, idx in enumerate(idxs):
            if k > 0:
                receiver_cust_count[idx] = len(seen)
            seen.add(receiver_custs[idx])

    # 3. Sender customer -> historical distinct accounts
    cust_groups = df.groupby("sender_customer_id", sort=False).indices
    for cust, idxs in cust_groups.items():
        seen = set()
        for k, idx in enumerate(idxs):
            if k > 0:
                cust_acc_count[idx] = len(seen)
            seen.add(sender_accs[idx])

    out["sender_customers_count_historical"] = sender_cust_count
    out["receiver_customers_count_historical"] = receiver_cust_count
    out["sender_customer_accounts_count_historical"] = cust_acc_count

    return out
