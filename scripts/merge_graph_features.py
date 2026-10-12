"""
Project Vigilance - Graph Feature Integration Pipeline
======================================================
Script: scripts/merge_graph_features.py

Purpose:
Integrates account-level graph intelligence features (PageRank, Louvain,
directional degree centrality, circular transaction cycles) into the
transaction-level ML matrix by mapping features onto BOTH sender_account
and receiver_account.

Key Guarantees:
1. Immutability:
   - Leaves data/processed/aml_150k_features.csv strictly untouched.
   - Outputs to a new isolated dataset: data/processed/aml_150k_graph_features.csv.
2. Dimensionality:
   - 76 existing Phase 2 columns preserved exactly.
   - 11 sender graph features + 11 receiver graph features = 22 new features.
   - Total resulting schema: exactly 98 columns, 150,000 rows.
3. Integrity:
   - 100% join coverage on both sender_account and receiver_account (zero unmatched).
   - Strict preservation of chronological transaction ordering and transaction_id alignment.
   - Zero NaNs, zero infinities, and faithful preservation of sentinel values (-1 for no cycle).
4. Temporal Disclosure:
   - Explicitly documents that these graph metrics are computed over the full observed 150k
     network (static graph intelligence) rather than causal point-in-time sliding windows.
"""

import sys
import os
import time
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Tuple
import pandas as pd
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INPUT_CSV = PROJECT_ROOT / "data" / "processed" / "aml_150k_features.csv"
OUTPUT_CSV = PROJECT_ROOT / "data" / "processed" / "aml_150k_graph_features.csv"
GRAPH_FEATURES_DIR = PROJECT_ROOT / "data" / "processed" / "graph_features"

GRAPH_FILES = {
    "pagerank": GRAPH_FEATURES_DIR / "account_pagerank.csv",
    "louvain": GRAPH_FEATURES_DIR / "account_louvain.csv",
    "degree": GRAPH_FEATURES_DIR / "account_degree.csv",
    "cycles": GRAPH_FEATURES_DIR / "account_cycles.csv",
}

EXPECTED_ACCOUNT_COUNT = 29998
EXPECTED_TXN_COUNT = 150000
EXPECTED_BASE_COLS = 76
EXPECTED_NEW_GRAPH_COLS = 22
EXPECTED_TOTAL_COLS = 98


def compute_sha256(filepath: Path) -> str:
    """Calculates SHA-256 checksum of a file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def load_and_validate_graph_features() -> pd.DataFrame:
    """Loads and joins all 4 account-level graph feature files."""
    print("\n[Step 1/5] Loading and validating isolated graph feature files...")
    dfs = {}
    for name, path in GRAPH_FILES.items():
        if not path.exists():
            raise FileNotFoundError(f"Missing graph feature file: {path}")
        df = pd.read_csv(path)
        print(f"  - Loaded {name:<10}: {len(df):,} rows, {len(df.columns)} columns from {path.name}")
        
        # Validate uniqueness and completeness
        if len(df) != EXPECTED_ACCOUNT_COUNT:
            raise ValueError(f"{name} has {len(df)} rows, expected {EXPECTED_ACCOUNT_COUNT}")
        if df["account_id"].nunique() != EXPECTED_ACCOUNT_COUNT:
            raise ValueError(f"{name} has duplicate account_id entries")
        if df.isnull().sum().sum() > 0:
            raise ValueError(f"{name} contains null values")
        dfs[name] = df

    # Merge into a single master account-level feature table
    acc_master = dfs["pagerank"].merge(dfs["louvain"], on="account_id", how="inner")
    acc_master = acc_master.merge(dfs["degree"], on="account_id", how="inner")
    acc_master = acc_master.merge(dfs["cycles"], on="account_id", how="inner")

    if len(acc_master) != EXPECTED_ACCOUNT_COUNT:
        raise ValueError(f"Merged account master table has {len(acc_master)} rows, expected {EXPECTED_ACCOUNT_COUNT}")

    feature_cols = [c for c in acc_master.columns if c != "account_id"]
    print(f"  Master account table built: {len(acc_master):,} accounts with {len(feature_cols)} graph features:")
    for i, col in enumerate(feature_cols, 1):
        print(f"    {i:2d}. {col}")

    return acc_master


def merge_graph_features():
    print("=" * 80)
    print(" PROJECT VIGILANCE — PHASE 3 STEP 5: GRAPH FEATURE INTEGRATION")
    print("=" * 80)
    print(f"Input Features File  : {INPUT_CSV}")
    print(f"Output Features File : {OUTPUT_CSV}")

    # Initial file check & hash
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Input transaction features dataset not found: {INPUT_CSV}")
    
    t0_hash = time.time()
    input_hash_initial = compute_sha256(INPUT_CSV)
    print(f"Input file SHA-256 (pre-merge) : {input_hash_initial} (checked in {time.time()-t0_hash:.2f}s)")

    # 1. Load account graph features
    acc_df = load_and_validate_graph_features()
    feature_cols = [c for c in acc_df.columns if c != "account_id"]

    # Prepare sender feature lookup
    sender_df = acc_df.copy()
    sender_df.columns = ["sender_account"] + [f"sender_{c}" for c in feature_cols]

    # Prepare receiver feature lookup
    receiver_df = acc_df.copy()
    receiver_df.columns = ["receiver_account"] + [f"receiver_{c}" for c in feature_cols]

    sender_feature_names = [f"sender_{c}" for c in feature_cols]
    receiver_feature_names = [f"receiver_{c}" for c in feature_cols]

    # 2. Load transaction features dataset
    print(f"\n[Step 2/5] Loading Phase 2 transaction features dataset ({INPUT_CSV.name})...")
    t0_load = time.time()
    txn_df = pd.read_csv(INPUT_CSV)
    print(f"  Loaded {len(txn_df):,} transactions x {len(txn_df.columns)} columns in {time.time()-t0_load:.2f}s")

    if len(txn_df) != EXPECTED_TXN_COUNT:
        raise ValueError(f"Expected {EXPECTED_TXN_COUNT} transactions, found {len(txn_df)}")
    if len(txn_df.columns) != EXPECTED_BASE_COLS:
        raise ValueError(f"Expected {EXPECTED_BASE_COLS} columns, found {len(txn_df.columns)}")

    # 3. Join Coverage Validation
    print("\n[Step 3/5] Validating account lookup coverage...")
    account_lookup_set = set(acc_df["account_id"])
    txn_senders = set(txn_df["sender_account"])
    txn_receivers = set(txn_df["receiver_account"])

    unmatched_senders = txn_senders - account_lookup_set
    unmatched_receivers = txn_receivers - account_lookup_set

    print(f"  - Unique senders in transactions  : {len(txn_senders):,}")
    print(f"  - Unique receivers in transactions: {len(txn_receivers):,}")
    print(f"  - Unmatched sender accounts       : {len(unmatched_senders)}")
    print(f"  - Unmatched receiver accounts     : {len(unmatched_receivers)}")

    if len(unmatched_senders) > 0:
        raise ValueError(f"Unmatched sender accounts found ({len(unmatched_senders)}). Halting merge per specification.")
    if len(unmatched_receivers) > 0:
        raise ValueError(f"Unmatched receiver accounts found ({len(unmatched_receivers)}). Halting merge per specification.")

    # 4. Perform Left Joins
    print("\n[Step 4/5] Merging sender and receiver graph features onto transactions...")
    t0_merge = time.time()
    
    # Left join sender features
    merged_df = txn_df.merge(sender_df, on="sender_account", how="left")
    # Left join receiver features
    merged_df = merged_df.merge(receiver_df, on="receiver_account", how="left")

    merge_elapsed = time.time() - t0_merge
    print(f"  Merge completed in {merge_elapsed:.2f}s")
    print(f"  Resulting dataset shape: {merged_df.shape[0]:,} rows x {merged_df.shape[1]} columns")

    # 5. Strict Verification & Integrity Auditing
    print("\n[Step 5/5] Performing post-merge integrity checks...")

    # Check 1: Row count
    if len(merged_df) != EXPECTED_TXN_COUNT:
        raise AssertionError(f"Output row count mismatch: {len(merged_df)} != {EXPECTED_TXN_COUNT}")

    # Check 2: Column count
    if len(merged_df.columns) != EXPECTED_TOTAL_COLS:
        raise AssertionError(f"Output column count mismatch: {len(merged_df.columns)} != {EXPECTED_TOTAL_COLS}")

    # Check 3: Transaction ID sequence and ordering preservation
    if not (merged_df["transaction_id"] == txn_df["transaction_id"]).all():
        raise AssertionError("Transaction ID sequence or row ordering was perturbed!")

    # Check 4: Base Phase 2 columns and values untouched
    for base_col in txn_df.columns:
        if base_col not in merged_df.columns:
            raise AssertionError(f"Base column {base_col} missing from output!")
        # Check series equality (handling NaN equivalence for nullable columns)
        if not (merged_df[base_col].fillna("__NA__") == txn_df[base_col].fillna("__NA__")).all():
            raise AssertionError(f"Values in original column {base_col} were altered during merge!")

    # Check 5: Null / NaN / Inf checks in new graph features
    new_graph_columns = sender_feature_names + receiver_feature_names
    null_counts = merged_df[new_graph_columns].isnull().sum()
    if null_counts.sum() > 0:
        raise AssertionError(f"Null values detected in new graph features:\n{null_counts[null_counts > 0]}")

    inf_counts = np.isinf(merged_df[new_graph_columns].select_dtypes(include=[np.number])).sum()
    if inf_counts.sum() > 0:
        raise AssertionError(f"Infinite values detected in new graph features:\n{inf_counts[inf_counts > 0]}")

    # Check 6: Sentinel preservation for shortest_cycle_length
    print(f"  - Senders with no cycle (sentinel -1)   : {(merged_df['sender_shortest_cycle_length'] == -1).sum():,}")
    print(f"  - Receivers with no cycle (sentinel -1) : {(merged_df['receiver_shortest_cycle_length'] == -1).sum():,}")

    # Write output to new file
    print(f"\nWriting merged feature matrix to {OUTPUT_CSV}...")
    t0_write = time.time()
    merged_df.to_csv(OUTPUT_CSV, index=False)
    print(f"Successfully wrote {len(merged_df):,} rows to {OUTPUT_CSV} in {time.time()-t0_write:.2f}s")

    # Hash verification
    input_hash_post = compute_sha256(INPUT_CSV)
    output_hash = compute_sha256(OUTPUT_CSV)

    if input_hash_initial != input_hash_post:
        raise AssertionError("CRITICAL: Input file aml_150k_features.csv was modified during merge execution!")
    
    print("\n" + "=" * 80)
    print(" HASH VERIFICATION")
    print("=" * 80)
    print(f"Original Input File  : {INPUT_CSV.name}")
    print(f"  SHA-256 (Post-run) : {input_hash_post} (UNMODIFIED)")
    print(f"New Merged File      : {OUTPUT_CSV.name}")
    print(f"  SHA-256            : {output_hash}")
    print("=" * 80)

    # Feature distribution summary
    print("\nGRAPH FEATURE DISTRIBUTION SUMMARY (150,000 TRANSACTIONS):")
    print("-" * 80)
    stats_df = merged_df[new_graph_columns].describe().T[["min", "mean", "50%", "max", "std"]]
    stats_df.rename(columns={"50%": "median"}, inplace=True)
    print(stats_df.to_string())
    print("-" * 80)

    return {
        "input_hash": input_hash_post,
        "output_hash": output_hash,
        "merged_shape": merged_df.shape,
        "new_features": new_graph_columns,
        "stats": stats_df,
    }


if __name__ == "__main__":
    merge_graph_features()
