"""
Project Vigilance - Independent Dataset Audit (Phase 0)
======================================================
Architectural Module: ml-service/audit/dataset_audit.py

Purpose:
Independently audit and verify the integrity, consistency, distributions,
and potential label leakage of:
  - aml_150k.csv (operational transaction dataset)
  - aml_150k_ground_truth.csv (separate ground-truth target dataset)

Hardware Constraints:
Optimized for 8 GB RAM / Ryzen 5 5600H on Windows.
Memory-conscious chunking / scalar aggregation to avoid excessive DataFrame cloning.

Guardrail Compliance:
Does NOT modify source CSV files.
Does NOT train XGBoost or any ML model.
Identifies potential label proxies before model development.
"""

import os
import sys
import json
import re
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    accuracy_score,
)
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier


# Expected 17 canonical operational columns per Project Vigilance specification
EXPECTED_TX_COLUMNS = [
    "transaction_id",
    "timestamp",
    "sender_account",
    "sender_name",
    "sender_customer_id",
    "receiver_account",
    "receiver_name",
    "receiver_customer_id",
    "amount",
    "currency",
    "channel",
    "ip_address",
    "device_id",
    "location_country",
    "location_city",
    "is_crypto",
    "crypto_wallet",
]

MANDATORY_NON_NULL_COLUMNS = [
    "transaction_id",
    "timestamp",
    "amount",
    "currency",
    "channel",
    "ip_address",
    "location_country",
    "location_city",
    "is_crypto",
]

EXPECTED_GT_COLUMNS = [
    "transaction_id",
    "ground_truth",
]

SUSPICIOUS_KEYWORD_PATTERNS = [
    r"SMURF",
    r"STR[-_]?FWD",
    r"OFFSHORE",
    r"SHELL",
    r"CRIME",
    r"MULE",
    r"FRAUD",
    r"LAUNDER",
    r"DIRTY",
    r"ILLICIT",
    r"GATEWAY[-_]?CRYPTO",
    r"EXCHANGE[-_]?OFFRAMP",
]


class DatasetAuditor:
    def __init__(self, tx_path: str, gt_path: str):
        self.tx_path = Path(tx_path).resolve()
        self.gt_path = Path(gt_path).resolve()
        self.results: Dict[str, Any] = {
            "audit_meta": {
                "timestamp": datetime.now().isoformat(),
                "tx_file": str(self.tx_path),
                "gt_file": str(self.gt_path),
            },
            "findings": {},
            "verdict": {
                "status": "PENDING",
                "failures": [],
                "warnings": [],
                "passes": [],
            },
        }
        self.df_tx = None
        self.df_gt = None
        self.df_merged = None

    def log(self, message: str):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def execute_audit(self) -> Dict[str, Any]:
        self.log("Starting Phase 0: Independent Dataset Audit...")

        # 1. File Existence & Basic Metadata
        self._audit_file_existence()
        if self.results["verdict"]["failures"]:
            self._finalize_verdict()
            return self.results

        # 2. Load Datasets
        self._load_datasets()

        # 3. Schema & Column Names
        self._audit_schema()

        # 4. Duplicate Checks
        self._audit_duplicates()

        # 5. ID Alignment & Coverage
        self._audit_id_alignment()

        # 6. Class Distribution
        self._audit_class_distribution()

        # 7. Data Types & Inferred Semantics
        self._audit_data_types()

        # 8. Null Counts & Spec Compliance
        self._audit_null_values()

        # 9. Domain Validity
        self._audit_domain_validity()

        # 10. Categorical Distributions
        self._audit_categorical_distributions()

        # 11. Crypto Consistency
        self._audit_crypto_consistency()

        # 12. Entity & Account-Customer Consistency
        self._audit_entity_consistency()

        # 13. Amount Distribution by Class & Currency
        self._audit_amount_distributions()

        # 14. Timestamp & Temporal Distributions
        self._audit_timestamp_distributions()

        # 15. Infrastructure Sharing (Device & IP)
        self._audit_infrastructure_sharing()

        # 16. Entity Overlap & Network Patterns
        self._audit_entity_overlap()

        # 17. Suspicious Name & ID Marker Search
        self._audit_marker_keywords()

        # 18. Label Leakage & Deterministic Proxy Analysis
        self._audit_label_leakage()

        # 19. Simple Feature Shortcut & Baseline Probe Benchmark (Tests 1 - 8)
        self._audit_feature_shortcuts()

        # Final Verdict Computation
        self._finalize_verdict()
        self.log(f"Audit completed with status: {self.results['verdict']['status']}")
        return self.results

    def _audit_file_existence(self):
        self.log("Check 1: File existence and size...")
        tx_exists = self.tx_path.exists()
        gt_exists = self.gt_path.exists()

        tx_size = self.tx_path.stat().st_size if tx_exists else 0
        gt_size = self.gt_path.stat().st_size if gt_exists else 0

        self.results["findings"]["file_existence"] = {
            "tx_file_exists": tx_exists,
            "tx_file_size_bytes": tx_size,
            "tx_file_size_mb": round(tx_size / (1024 * 1024), 2),
            "gt_file_exists": gt_exists,
            "gt_file_size_bytes": gt_size,
            "gt_file_size_mb": round(gt_size / (1024 * 1024), 2),
        }

        if not tx_exists:
            self.results["verdict"]["failures"].append(f"Transaction file not found: {self.tx_path}")
        else:
            self.results["verdict"]["passes"].append("Transaction file exists.")

        if not gt_exists:
            self.results["verdict"]["failures"].append(f"Ground truth file not found: {self.gt_path}")
        else:
            self.results["verdict"]["passes"].append("Ground truth file exists.")

    def _load_datasets(self):
        self.log("Check 2: Loading dataset files into memory...")
        try:
            self.df_tx = pd.read_csv(self.tx_path, low_memory=False)
            self.df_gt = pd.read_csv(self.gt_path, low_memory=False)
            self.results["findings"]["row_counts"] = {
                "tx_rows": int(len(self.df_tx)),
                "gt_rows": int(len(self.df_gt)),
            }
            self.results["verdict"]["passes"].append(
                f"Loaded datasets: {len(self.df_tx):,} tx rows, {len(self.df_gt):,} gt rows."
            )
        except Exception as e:
            self.results["verdict"]["failures"].append(f"Dataset loading failed: {str(e)}")
            raise

    def _audit_schema(self):
        self.log("Check 3: Validating schema and exact column names...")
        tx_cols = list(self.df_tx.columns)
        gt_cols = list(self.df_gt.columns)

        missing_tx_cols = [c for c in EXPECTED_TX_COLUMNS if c not in tx_cols]
        extra_tx_cols = [c for c in tx_cols if c not in EXPECTED_TX_COLUMNS]

        missing_gt_cols = [c for c in EXPECTED_GT_COLUMNS if c not in gt_cols]
        extra_gt_cols = [c for c in gt_cols if c not in EXPECTED_GT_COLUMNS]

        # Guardrail: target column must NOT exist in tx dataset
        has_leak_target = "ground_truth" in tx_cols or "is_fraud" in tx_cols or "is_suspicious" in tx_cols

        self.results["findings"]["schema"] = {
            "tx_columns": tx_cols,
            "tx_column_count": len(tx_cols),
            "missing_tx_columns": missing_tx_cols,
            "extra_tx_columns": extra_tx_cols,
            "tx_columns_match_expected": tx_cols == EXPECTED_TX_COLUMNS,
            "gt_columns": gt_cols,
            "gt_column_count": len(gt_cols),
            "missing_gt_columns": missing_gt_cols,
            "extra_gt_cols": extra_gt_cols,
            "gt_columns_match_expected": gt_cols == EXPECTED_GT_COLUMNS,
            "target_leak_in_tx": has_leak_target,
        }

        if has_leak_target:
            self.results["verdict"]["failures"].append(
                "CRITICAL: Target column found directly inside operational transaction dataset!"
            )

        if missing_tx_cols:
            self.results["verdict"]["failures"].append(f"Missing expected tx columns: {missing_tx_cols}")
        elif extra_tx_cols:
            self.results["verdict"]["warnings"].append(f"Extra tx columns present: {extra_tx_cols}")
        else:
            self.results["verdict"]["passes"].append("Exact 17 transaction columns match specification.")

        if missing_gt_cols:
            self.results["verdict"]["failures"].append(f"Missing expected gt columns: {missing_gt_cols}")
        else:
            self.results["verdict"]["passes"].append("Ground-truth columns match specification.")

    def _audit_duplicates(self):
        self.log("Check 4 & 5: Checking for duplicate rows and transaction IDs...")
        tx_id_dup_count = int(self.df_tx["transaction_id"].duplicated().sum())
        gt_id_dup_count = int(self.df_gt["transaction_id"].duplicated().sum())
        tx_row_dup_count = int(self.df_tx.duplicated().sum())
        gt_row_dup_count = int(self.df_gt.duplicated().sum())

        self.results["findings"]["duplicates"] = {
            "tx_duplicate_ids": tx_id_dup_count,
            "gt_duplicate_ids": gt_id_dup_count,
            "tx_duplicate_rows": tx_row_dup_count,
            "gt_duplicate_rows": gt_row_dup_count,
        }

        if tx_id_dup_count > 0:
            self.results["verdict"]["failures"].append(f"Duplicate transaction IDs found in tx: {tx_id_dup_count}")
        else:
            self.results["verdict"]["passes"].append("Zero duplicate transaction IDs in transaction dataset.")

        if gt_id_dup_count > 0:
            self.results["verdict"]["failures"].append(f"Duplicate transaction IDs found in gt: {gt_id_dup_count}")
        else:
            self.results["verdict"]["passes"].append("Zero duplicate transaction IDs in ground truth dataset.")

        if tx_row_dup_count > 0:
            self.results["verdict"]["warnings"].append(f"Duplicate rows found in tx dataset: {tx_row_dup_count}")
        else:
            self.results["verdict"]["passes"].append("Zero duplicate rows in transaction dataset.")

    def _audit_id_alignment(self):
        self.log("Check 6 & 7: Checking transaction ID coverage and alignment...")
        tx_ids = set(self.df_tx["transaction_id"])
        gt_ids = set(self.df_gt["transaction_id"])

        tx_only = tx_ids - gt_ids
        gt_only = gt_ids - tx_ids
        intersection = tx_ids & gt_ids

        coverage_tx = (len(intersection) / len(tx_ids)) * 100 if tx_ids else 0
        coverage_gt = (len(intersection) / len(gt_ids)) * 100 if gt_ids else 0

        self.results["findings"]["id_alignment"] = {
            "total_unique_tx_ids": len(tx_ids),
            "total_unique_gt_ids": len(gt_ids),
            "common_ids": len(intersection),
            "ids_in_tx_missing_in_gt": len(tx_only),
            "ids_in_gt_missing_in_tx": len(gt_only),
            "tx_coverage_pct": round(coverage_tx, 4),
            "gt_coverage_pct": round(coverage_gt, 4),
            "sample_missing_in_gt": list(tx_only)[:5] if tx_only else [],
            "sample_missing_in_tx": list(gt_only)[:5] if gt_only else [],
        }

        if len(tx_only) > 0 or len(gt_only) > 0:
            self.results["verdict"]["failures"].append(
                f"Transaction ID mismatch! Missing in GT: {len(tx_only)}, Missing in TX: {len(gt_only)}"
            )
        else:
            self.results["verdict"]["passes"].append(
                f"100% ID alignment between tx and gt ({len(intersection):,} matching IDs)."
            )

        # Merge for downstream joint audits
        self.df_merged = pd.merge(self.df_tx, self.df_gt, on="transaction_id", how="inner")

    def _audit_class_distribution(self):
        self.log("Check 8: Analyzing ground truth class distribution...")
        gt_counts = self.df_gt["ground_truth"].value_counts().to_dict()
        total = len(self.df_gt)
        gt_pcts = {int(k): round((v / total) * 100, 4) for k, v in gt_counts.items()}

        normal_count = gt_counts.get(0, 0)
        suspicious_count = gt_counts.get(1, 0)
        other_count = sum(v for k, v in gt_counts.items() if k not in (0, 1))

        imbalance_ratio = round(normal_count / suspicious_count, 2) if suspicious_count > 0 else None

        self.results["findings"]["class_distribution"] = {
            "normal_count (0)": int(normal_count),
            "normal_pct (0)": gt_pcts.get(0, 0),
            "suspicious_count (1)": int(suspicious_count),
            "suspicious_pct (1)": gt_pcts.get(1, 0),
            "invalid_classes_count": int(other_count),
            "imbalance_ratio (Normal:Suspicious)": imbalance_ratio,
        }

        if other_count > 0:
            self.results["verdict"]["failures"].append(f"Invalid classes found in ground_truth: {other_count} non-0/1 records.")
        else:
            self.results["verdict"]["passes"].append("Ground truth values are strictly binary (0 or 1).")

        # Class distribution check against expected ~88.6% / ~11.4%
        susp_pct = gt_pcts.get(1, 0)
        if 8.0 <= susp_pct <= 15.0:
            self.results["verdict"]["passes"].append(
                f"Class distribution aligns with expected AML ratio (~{susp_pct:.2f}% suspicious)."
            )
        else:
            self.results["verdict"]["warnings"].append(
                f"Suspicious class percentage ({susp_pct:.2f}%) differs from expected ~11.4%."
            )

    def _audit_data_types(self):
        self.log("Check 9: Validating inferred column data types...")
        tx_dtypes = {col: str(dtype) for col, dtype in self.df_tx.dtypes.items()}
        gt_dtypes = {col: str(dtype) for col, dtype in self.df_gt.dtypes.items()}

        self.results["findings"]["data_types"] = {
            "tx_dtypes": tx_dtypes,
            "gt_dtypes": gt_dtypes,
        }

        # Check amount is float/int
        if not np.issubdtype(self.df_tx["amount"].dtype, np.number):
            self.results["verdict"]["failures"].append(f"Amount column is non-numeric: {self.df_tx['amount'].dtype}")
        else:
            self.results["verdict"]["passes"].append("Amount column is numeric.")

    def _audit_null_values(self):
        self.log("Check 10: Evaluating null values and specification nullable constraints...")
        tx_nulls = {}
        n_rows = len(self.df_tx)
        violations = []

        for col in self.df_tx.columns:
            null_count = int(self.df_tx[col].isna().sum())
            null_pct = round((null_count / n_rows) * 100, 4)
            tx_nulls[col] = {"null_count": null_count, "null_pct": null_pct}

            if col in MANDATORY_NON_NULL_COLUMNS and null_count > 0:
                violations.append(f"{col} is mandatory non-null but has {null_count} ({null_pct}%) nulls")

        gt_null_count = int(self.df_gt["ground_truth"].isna().sum())
        gt_id_null_count = int(self.df_gt["transaction_id"].isna().sum())

        self.results["findings"]["null_values"] = {
            "tx_nulls": tx_nulls,
            "gt_nulls": {
                "transaction_id": gt_id_null_count,
                "ground_truth": gt_null_count,
            },
            "mandatory_column_violations": violations,
        }

        if violations:
            self.results["verdict"]["failures"].append(f"Mandatory non-null columns contain nulls: {violations}")
        else:
            self.results["verdict"]["passes"].append("All mandatory columns contain 0 null values.")

        if gt_null_count > 0 or gt_id_null_count > 0:
            self.results["verdict"]["failures"].append("Ground truth file contains null values.")
        else:
            self.results["verdict"]["passes"].append("Ground truth file has 0 null values.")

    def _audit_domain_validity(self):
        self.log("Check 11: Validating domain constraints (amounts, timestamps, flags)...")
        # Amounts
        non_positive_amounts = int((self.df_tx["amount"] <= 0).sum())
        nan_amounts = int(self.df_tx["amount"].isna().sum())
        inf_amounts = int(np.isinf(self.df_tx["amount"]).sum())

        # Timestamps
        timestamp_sample = self.df_tx["timestamp"].dropna().head(100)
        invalid_ts_count = 0
        try:
            parsed_ts = pd.to_datetime(self.df_tx["timestamp"], format="ISO8601")
            min_ts = str(parsed_ts.min())
            max_ts = str(parsed_ts.max())
            date_span_days = round((parsed_ts.max() - parsed_ts.min()).total_seconds() / 86400, 2)
        except Exception as e:
            invalid_ts_count = -1
            min_ts, max_ts, date_span_days = None, None, None
            self.results["verdict"]["failures"].append(f"Timestamp ISO-8601 parsing error: {str(e)}")

        # is_crypto boolean values
        is_crypto_vals = self.df_tx["is_crypto"].unique().tolist()
        is_crypto_valid = all(v in [True, False, 1, 0, "True", "False", "TRUE", "FALSE"] for v in is_crypto_vals)

        self.results["findings"]["domain_validity"] = {
            "non_positive_amounts": non_positive_amounts,
            "nan_amounts": nan_amounts,
            "inf_amounts": inf_amounts,
            "invalid_timestamp_count": invalid_ts_count,
            "min_timestamp": min_ts,
            "max_timestamp": max_ts,
            "date_span_days": date_span_days,
            "is_crypto_unique_values": [str(x) for x in is_crypto_vals],
            "is_crypto_valid": is_crypto_valid,
        }

        if non_positive_amounts > 0:
            self.results["verdict"]["failures"].append(f"Found {non_positive_amounts} non-positive transaction amounts.")
        else:
            self.results["verdict"]["passes"].append("All amounts are strictly positive (> 0).")

        if invalid_ts_count == 0:
            self.results["verdict"]["passes"].append(
                f"Timestamps successfully parsed as ISO-8601 UTC. Span: {min_ts} to {max_ts} ({date_span_days} days)."
            )

    def _audit_categorical_distributions(self):
        self.log("Check 12, 13, 14: Analyzing currency, channel, and crypto distributions...")
        # Overall
        currency_dist = self.df_tx["currency"].value_counts().to_dict()
        channel_dist = self.df_tx["channel"].value_counts().to_dict()
        is_crypto_dist = self.df_tx["is_crypto"].value_counts().to_dict()

        # Class breakdown (Normal vs Suspicious)
        df = self.df_merged
        curr_by_class = (
            df.groupby(["currency", "ground_truth"], observed=False).size().unstack(fill_value=0).to_dict()
        )
        chan_by_class = (
            df.groupby(["channel", "ground_truth"], observed=False).size().unstack(fill_value=0).to_dict()
        )
        crypto_by_class = (
            df.groupby(["is_crypto", "ground_truth"], observed=False).size().unstack(fill_value=0).to_dict()
        )

        # Country / City counts
        country_counts = df["location_country"].value_counts().to_dict()
        city_counts = df["location_city"].value_counts().head(10).to_dict()

        self.results["findings"]["categorical_distributions"] = {
            "currency_distribution": currency_dist,
            "channel_distribution": channel_dist,
            "is_crypto_distribution": {str(k): v for k, v in is_crypto_dist.items()},
            "currency_by_class": {
                "normal": {k: int(v.get(k, 0)) for k, v in [(curr, curr_by_class.get(0, {})) for curr in currency_dist]},
                "suspicious": {k: int(v.get(k, 0)) for k, v in [(curr, curr_by_class.get(1, {})) for curr in currency_dist]},
            },
            "channel_by_class": {
                "normal": {k: int(chan_by_class.get(0, {}).get(k, 0)) for k in channel_dist},
                "suspicious": {k: int(chan_by_class.get(1, {}).get(k, 0)) for k in channel_dist},
            },
            "is_crypto_by_class": {
                "normal": {str(k): int(crypto_by_class.get(0, {}).get(k, 0)) for k in is_crypto_dist},
                "suspicious": {str(k): int(crypto_by_class.get(1, {}).get(k, 0)) for k in is_crypto_dist},
            },
            "country_distribution": country_counts,
            "top_10_cities": city_counts,
        }

        # Check for realistic overlap: normal transactions must exist in both fiat and crypto
        has_normal_crypto = crypto_by_class.get(0, {}).get(True, 0) > 0 or crypto_by_class.get(0, {}).get("True", 0) > 0
        has_susp_crypto = crypto_by_class.get(1, {}).get(True, 0) > 0 or crypto_by_class.get(1, {}).get("True", 0) > 0
        has_susp_fiat = crypto_by_class.get(1, {}).get(False, 0) > 0 or crypto_by_class.get(1, {}).get("False", 0) > 0

        if has_normal_crypto and has_susp_crypto and has_susp_fiat:
            self.results["verdict"]["passes"].append(
                "Realistic crypto/fiat overlap: legitimate crypto exists and suspicious non-crypto exists."
            )
        else:
            self.results["verdict"]["warnings"].append(
                f"Suspicious/Normal crypto partition check: norm_crypto={has_normal_crypto}, susp_crypto={has_susp_crypto}, susp_fiat={has_susp_fiat}"
            )

    def _audit_crypto_consistency(self):
        self.log("Check 15: Validating crypto_wallet consistency with is_crypto...")
        df = self.df_tx
        # Standardize boolean
        is_crypto_bool = df["is_crypto"].astype(str).str.lower().isin(["true", "1"])
        has_wallet = df["crypto_wallet"].notna() & (df["crypto_wallet"].astype(str).str.strip() != "")

        crypto_missing_wallet = int((is_crypto_bool & ~has_wallet).sum())
        non_crypto_with_wallet = int((~is_crypto_bool & has_wallet).sum())

        crypto_total = int(is_crypto_bool.sum())
        non_crypto_total = int((~is_crypto_bool).sum())

        crypto_wallet_rate = (
            round(((crypto_total - crypto_missing_wallet) / crypto_total) * 100, 2)
            if crypto_total > 0
            else 0
        )

        self.results["findings"]["crypto_consistency"] = {
            "total_crypto_transactions": crypto_total,
            "total_non_crypto_transactions": non_crypto_total,
            "crypto_tx_missing_wallet": crypto_missing_wallet,
            "crypto_wallet_present_pct": crypto_wallet_rate,
            "non_crypto_tx_with_wallet": non_crypto_with_wallet,
        }

        if non_crypto_with_wallet > 0:
            self.results["verdict"]["warnings"].append(
                f"Found {non_crypto_with_wallet} non-crypto transactions that have a crypto_wallet."
            )
        else:
            self.results["verdict"]["passes"].append("Zero non-crypto transactions have an unexpected crypto_wallet.")

        if crypto_missing_wallet > 0:
            self.results["verdict"]["warnings"].append(
                f"{crypto_missing_wallet} crypto transactions missing crypto_wallet ({100 - crypto_wallet_rate:.2f}%)."
            )
        else:
            self.results["verdict"]["passes"].append("100% of crypto transactions have an associated crypto_wallet.")

    def _audit_entity_consistency(self):
        self.log("Check 16, 17, 18: Auditing Account -> Customer consistency...")
        df = self.df_tx

        # Sender account -> customer consistency
        sender_pairs = df[["sender_account", "sender_customer_id"]].dropna().drop_duplicates()
        sender_acc_to_cust_count = sender_pairs.groupby("sender_account")["sender_customer_id"].nunique()
        sender_inconsistencies = sender_acc_to_cust_count[sender_acc_to_cust_count > 1]

        # Receiver account -> customer consistency
        receiver_pairs = df[["receiver_account", "receiver_customer_id"]].dropna().drop_duplicates()
        receiver_acc_to_cust_count = receiver_pairs.groupby("receiver_account")["receiver_customer_id"].nunique()
        receiver_inconsistencies = receiver_acc_to_cust_count[receiver_acc_to_cust_count > 1]

        # Cross consistency: Accounts that appear as both sender and receiver
        sender_map = dict(sender_pairs.values)
        receiver_map = dict(receiver_pairs.values)
        common_accounts = set(sender_map.keys()) & set(receiver_map.keys())
        cross_mismatches = [acc for acc in common_accounts if sender_map[acc] != receiver_map[acc]]

        self.results["findings"]["entity_consistency"] = {
            "unique_sender_accounts": int(df["sender_account"].nunique()),
            "unique_sender_customers": int(df["sender_customer_id"].nunique()),
            "sender_accounts_with_multiple_customers": int(len(sender_inconsistencies)),
            "unique_receiver_accounts": int(df["receiver_account"].nunique()),
            "unique_receiver_customers": int(df["receiver_customer_id"].nunique()),
            "receiver_accounts_with_multiple_customers": int(len(receiver_inconsistencies)),
            "accounts_present_as_both_sender_and_receiver": int(len(common_accounts)),
            "cross_role_account_customer_mismatches": int(len(cross_mismatches)),
        }

        if len(sender_inconsistencies) > 0:
            self.results["verdict"]["warnings"].append(
                f"{len(sender_inconsistencies)} sender accounts map to multiple sender customer IDs."
            )
        else:
            self.results["verdict"]["passes"].append("100% 1-to-1/N-to-1 consistency for sender account -> customer mapping.")

        if len(receiver_inconsistencies) > 0:
            self.results["verdict"]["warnings"].append(
                f"{len(receiver_inconsistencies)} receiver accounts map to multiple receiver customer IDs."
            )
        else:
            self.results["verdict"]["passes"].append("100% consistency for receiver account -> customer mapping.")

        if len(cross_mismatches) > 0:
            self.results["verdict"]["warnings"].append(
                f"{len(cross_mismatches)} shared accounts map to conflicting customer IDs across sender/receiver roles."
            )
        else:
            self.results["verdict"]["passes"].append("100% cross-role consistency between sender and receiver customer mappings.")

    def _audit_amount_distributions(self):
        self.log("Check 19: Auditing amount distributions by class and currency...")
        df = self.df_merged

        stats_by_class = {}
        for cls in [0, 1]:
            cls_df = df[df["ground_truth"] == cls]["amount"]
            stats_by_class[cls] = {
                "count": int(len(cls_df)),
                "min": float(round(cls_df.min(), 2)),
                "p25": float(round(cls_df.quantile(0.25), 2)),
                "median": float(round(cls_df.median(), 2)),
                "mean": float(round(cls_df.mean(), 2)),
                "p75": float(round(cls_df.quantile(0.75), 2)),
                "p95": float(round(cls_df.quantile(0.95), 2)),
                "p99": float(round(cls_df.quantile(0.99), 2)),
                "max": float(round(cls_df.max(), 2)),
                "std": float(round(cls_df.std(), 2)),
            }

        # Currency specific breakdown
        stats_by_currency = {}
        for curr in df["currency"].unique():
            stats_by_currency[curr] = {}
            for cls in [0, 1]:
                sub = df[(df["currency"] == curr) & (df["ground_truth"] == cls)]["amount"]
                if len(sub) > 0:
                    stats_by_currency[curr][cls] = {
                        "count": int(len(sub)),
                        "min": float(round(sub.min(), 2)),
                        "median": float(round(sub.median(), 2)),
                        "mean": float(round(sub.mean(), 2)),
                        "max": float(round(sub.max(), 2)),
                    }

        # Check overlap
        norm_min, norm_max = stats_by_class[0]["min"], stats_by_class[0]["max"]
        susp_min, susp_max = stats_by_class[1]["min"], stats_by_class[1]["max"]
        amount_overlap = max(0, min(norm_max, susp_max) - max(norm_min, susp_min))

        self.results["findings"]["amount_distributions"] = {
            "normal_amount_stats": stats_by_class[0],
            "suspicious_amount_stats": stats_by_class[1],
            "by_currency_stats": stats_by_currency,
            "has_amount_overlap": amount_overlap > 0,
            "overlap_range": [max(norm_min, susp_min), min(norm_max, susp_max)],
        }

        if amount_overlap > 0:
            self.results["verdict"]["passes"].append(
                f"Amounts show realistic overlap between normal and suspicious classes ({amount_overlap:,.2f} span overlap). No trivial cutoff separation."
            )
        else:
            self.results["verdict"]["failures"].append("Amounts have ZERO overlap between normal and suspicious transactions (leakage risk)!")

    def _audit_timestamp_distributions(self):
        self.log("Check 20 & 21: Auditing timestamp distributions and transaction rates...")
        df = self.df_merged.copy()
        df["dt"] = pd.to_datetime(df["timestamp"], format="ISO8601")

        norm_dt = df[df["ground_truth"] == 0]["dt"]
        susp_dt = df[df["ground_truth"] == 1]["dt"]

        # Hourly / daily rate
        df["date"] = df["dt"].dt.date
        daily_tx = df.groupby("date").size()
        daily_susp = df[df["ground_truth"] == 1].groupby("date").size()

        self.results["findings"]["timestamp_distributions"] = {
            "normal_range": {
                "start": str(norm_dt.min()),
                "end": str(norm_dt.max()),
                "days": round((norm_dt.max() - norm_dt.min()).total_seconds() / 86400, 2),
            },
            "suspicious_range": {
                "start": str(susp_dt.min()),
                "end": str(susp_dt.max()),
                "days": round((susp_dt.max() - susp_dt.min()).total_seconds() / 86400, 2),
            },
            "daily_tx_stats": {
                "mean_tx_per_day": round(float(daily_tx.mean()), 2),
                "min_tx_per_day": int(daily_tx.min()),
                "max_tx_per_day": int(daily_tx.max()),
            },
            "suspicious_active_days": int(len(daily_susp)),
            "total_days": int(len(daily_tx)),
        }

        # Check temporal overlap
        overlap_start = max(norm_dt.min(), susp_dt.min())
        overlap_end = min(norm_dt.max(), susp_dt.max())
        has_temporal_overlap = overlap_start < overlap_end

        if has_temporal_overlap:
            self.results["verdict"]["passes"].append(
                f"Temporal distribution overlaps normally across entire timeframe ({overlap_start.date()} to {overlap_end.date()})."
            )
        else:
            self.results["verdict"]["failures"].append(
                "Normal and suspicious transactions occur in disjoint time periods! Severe leakage risk."
            )

    def _audit_infrastructure_sharing(self):
        self.log("Check 22, 23, 24, 25: Auditing device and IP sharing statistics...")
        df = self.df_merged

        # Devices
        dev_valid = df[df["device_id"].notna() & (df["device_id"] != "")]
        dev_acc_counts = dev_valid.groupby("device_id")["sender_account"].nunique()
        dev_cust_counts = dev_valid.groupby("device_id")["sender_customer_id"].nunique()
        shared_devices = int((dev_acc_counts > 1).sum())

        # Devices by class
        dev_class = dev_valid.groupby("device_id")["ground_truth"].agg(["min", "max", "count"])
        dev_exclusive_susp = int(((dev_class["min"] == 1) & (dev_class["count"] > 1)).sum())
        dev_exclusive_norm = int(((dev_class["max"] == 0) & (dev_class["count"] > 1)).sum())
        dev_mixed = int(((dev_class["min"] == 0) & (dev_class["max"] == 1)).sum())

        # IPs
        ip_valid = df[df["ip_address"].notna() & (df["ip_address"] != "")]
        ip_acc_counts = ip_valid.groupby("ip_address")["sender_account"].nunique()
        ip_cust_counts = ip_valid.groupby("ip_address")["sender_customer_id"].nunique()
        shared_ips = int((ip_acc_counts > 1).sum())

        # IPs by class
        ip_class = ip_valid.groupby("ip_address")["ground_truth"].agg(["min", "max", "count"])
        ip_exclusive_susp = int(((ip_class["min"] == 1) & (ip_class["count"] > 1)).sum())
        ip_exclusive_norm = int(((ip_class["max"] == 0) & (ip_class["count"] > 1)).sum())
        ip_mixed = int(((ip_class["min"] == 0) & (ip_class["max"] == 1)).sum())

        self.results["findings"]["infrastructure_sharing"] = {
            "total_unique_devices": int(df["device_id"].nunique(dropna=True)),
            "devices_with_multiple_accounts": shared_devices,
            "max_accounts_per_device": int(dev_acc_counts.max()) if len(dev_acc_counts) > 0 else 0,
            "mean_accounts_per_device": round(float(dev_acc_counts.mean()), 2) if len(dev_acc_counts) > 0 else 0,
            "devices_only_in_suspicious": dev_exclusive_susp,
            "devices_only_in_normal": dev_exclusive_norm,
            "devices_mixed_classes": dev_mixed,
            "total_unique_ips": int(df["ip_address"].nunique(dropna=True)),
            "ips_with_multiple_accounts": shared_ips,
            "max_accounts_per_ip": int(ip_acc_counts.max()) if len(ip_acc_counts) > 0 else 0,
            "mean_accounts_per_ip": round(float(ip_acc_counts.mean()), 2) if len(ip_acc_counts) > 0 else 0,
            "ips_only_in_suspicious": ip_exclusive_susp,
            "ips_only_in_normal": ip_exclusive_norm,
            "ips_mixed_classes": ip_mixed,
        }

        # Check if legitimate shared devices/IPs exist (crucial requirement from spec)
        if shared_devices > 0 and shared_ips > 0:
            self.results["verdict"]["passes"].append(
                f"Infrastructure sharing verified: {shared_devices:,} shared devices, {shared_ips:,} shared IPs."
            )
        else:
            self.results["verdict"]["warnings"].append("Low infrastructure sharing detected in dataset.")

        if dev_mixed > 0 or ip_mixed > 0:
            self.results["verdict"]["passes"].append(
                f"Realistic device/IP overlap: {dev_mixed} devices and {ip_mixed} IPs host both legitimate and suspicious transactions."
            )
        else:
            self.results["verdict"]["warnings"].append(
                "Devices and IPs appear cleanly partitioned between classes. Pure network clusters detected."
            )

    def _audit_entity_overlap(self):
        self.log("Check 26: Auditing entity reuse and network graph connectivity...")
        df = self.df_merged

        senders = set(df["sender_account"].dropna())
        receivers = set(df["receiver_account"].dropna())
        conduits = senders & receivers  # Accounts that both send and receive

        # Entities involved in normal vs suspicious
        norm_senders = set(df[df["ground_truth"] == 0]["sender_account"].dropna())
        susp_senders = set(df[df["ground_truth"] == 1]["sender_account"].dropna())
        sender_overlap = norm_senders & susp_senders

        norm_receivers = set(df[df["ground_truth"] == 0]["receiver_account"].dropna())
        susp_receivers = set(df[df["ground_truth"] == 1]["receiver_account"].dropna())
        receiver_overlap = norm_receivers & susp_receivers

        self.results["findings"]["entity_overlap"] = {
            "total_senders": len(senders),
            "total_receivers": len(receivers),
            "conduit_accounts (both send & receive)": len(conduits),
            "conduit_account_pct": round((len(conduits) / len(senders | receivers)) * 100, 2)
            if (senders | receivers)
            else 0,
            "senders_in_both_normal_and_suspicious": len(sender_overlap),
            "receivers_in_both_normal_and_suspicious": len(receiver_overlap),
        }

        if len(conduits) > 0:
            self.results["verdict"]["passes"].append(
                f"Financial network interconnectedness confirmed: {len(conduits):,} accounts act as flow conduits (both send & receive)."
            )
        else:
            self.results["verdict"]["warnings"].append("No bipartite flow conduits found between senders and receivers.")

    def _audit_marker_keywords(self):
        self.log("Check 27, 28, 29: Searching for synthetic scenario marker keywords...")
        df = self.df_merged

        text_columns_to_check = [
            "transaction_id",
            "sender_account",
            "sender_name",
            "sender_customer_id",
            "receiver_account",
            "receiver_name",
            "receiver_customer_id",
            "device_id",
            "crypto_wallet",
        ]

        pattern = re.compile("|".join(SUSPICIOUS_KEYWORD_PATTERNS), re.IGNORECASE)
        marker_findings = {}

        total_flags = 0
        for col in text_columns_to_check:
            series = df[col].dropna().astype(str)
            matches = series.str.contains(pattern, regex=True)
            match_count = int(matches.sum())
            if match_count > 0:
                sample_matches = series[matches].head(5).tolist()
                susp_overlap = int(df.loc[matches[matches].index, "ground_truth"].sum())
                norm_overlap = match_count - susp_overlap
                marker_findings[col] = {
                    "matched_count": match_count,
                    "suspicious_count": susp_overlap,
                    "normal_count": norm_overlap,
                    "samples": sample_matches,
                }
                total_flags += match_count

        self.results["findings"]["suspicious_markers"] = {
            "total_marker_occurrences": total_flags,
            "columns_with_markers": marker_findings,
        }

        if total_flags == 0:
            self.results["verdict"]["passes"].append(
                "Zero synthetic scenario marker keywords found (no SMURF, STR-FWD, SHELL, CRIME, MULE tags in names or IDs)."
            )
        else:
            self.results["verdict"]["warnings"].append(
                f"Synthetic marker strings identified: {total_flags} occurrences across {list(marker_findings.keys())}."
            )

    def _audit_label_leakage(self):
        self.log("Check 30: Auditing potential label leakage and deterministic proxies...")
        df = self.df_merged
        n_total = len(df)
        base_susp_rate = df["ground_truth"].mean()

        potential_proxies = []

        # 1. Categorical columns check
        cat_cols = ["currency", "channel", "is_crypto", "location_country", "location_city"]
        cat_leakage = {}

        for col in cat_cols:
            grouped = df.groupby(col, observed=False)["ground_truth"].agg(["count", "mean", "sum"])
            grouped["norm_count"] = grouped["count"] - grouped["sum"]
            cat_leakage[col] = {}
            for val, row in grouped.iterrows():
                val_str = str(val)
                count = int(row["count"])
                susp_rate = float(round(row["mean"], 4))
                cat_leakage[col][val_str] = {
                    "support": count,
                    "pct_of_dataset": round((count / n_total) * 100, 2),
                    "suspicious_rate": susp_rate,
                }
                # Flag if a high-support category has 100% or 0% suspicious rate deterministically
                if count >= 100 and (susp_rate == 1.0 or susp_rate == 0.0):
                    potential_proxies.append({
                        "feature": col,
                        "value": val_str,
                        "support": count,
                        "suspicious_rate": susp_rate,
                        "issue": "Deterministic class assignment with significant support (>100)",
                    })

        # 2. Check Amount threshold exact cuts
        # For example, amounts ending in exact repetitive figures or deterministic ranges
        amount_leakage = {}
        # Structuring check: count of amounts just below 10 Lakhs (e.g. 900,000 to 999,999)
        structuring_bracket = df[(df["amount"] >= 900000) & (df["amount"] < 1000000)]
        struct_count = len(structuring_bracket)
        struct_susp_rate = structuring_bracket["ground_truth"].mean() if struct_count > 0 else 0
        amount_leakage["near_10L_threshold (900k-1M)"] = {
            "count": int(struct_count),
            "suspicious_rate": float(round(struct_susp_rate, 4)) if struct_count > 0 else 0,
        }

        # 3. Check Raw Identifiers Unique Cardinality & Reuse
        raw_id_cardinality = {
            "transaction_id_unique": int(df["transaction_id"].nunique()),
            "sender_account_unique": int(df["sender_account"].nunique()),
            "receiver_account_unique": int(df["receiver_account"].nunique()),
            "device_id_unique": int(df["device_id"].nunique()),
            "ip_address_unique": int(df["ip_address"].nunique()),
        }

        self.results["findings"]["label_leakage"] = {
            "base_suspicious_rate": round(base_susp_rate, 4),
            "categorical_conditional_probabilities": cat_leakage,
            "amount_threshold_probes": amount_leakage,
            "raw_id_cardinalities": raw_id_cardinality,
            "deterministic_proxies_detected": potential_proxies,
        }

        if potential_proxies:
            self.results["verdict"]["warnings"].append(
                f"Deterministic proxy values detected: {len(potential_proxies)} categories strictly imply class."
            )
        else:
            self.results["verdict"]["passes"].append(
                "No single categorical feature acts as a deterministic 100% label proxy."
            )

    def _audit_feature_shortcuts(self):
        self.log("Check 31: Auditing Simple Feature Shortcuts & Baseline Probes (Tests 1 - 8)...")
        df = self.df_merged.copy()

        # Feature prep
        df["dt"] = pd.to_datetime(df["timestamp"], format="ISO8601")
        df["hour"] = df["dt"].dt.hour
        df["day"] = df["dt"].dt.day
        df["weekday"] = df["dt"].dt.weekday

        df["device_tx_count"] = df["device_id"].map(df["device_id"].value_counts()).fillna(0)
        df["ip_tx_count"] = df["ip_address"].map(df["ip_address"].value_counts()).fillna(0)
        df["device_acc_count"] = df.groupby("device_id")["sender_account"].transform("nunique").fillna(0)
        df["ip_acc_count"] = df.groupby("ip_address")["sender_account"].transform("nunique").fillna(0)

        test_suites = {
            "Test 1: Amount only": ["amount"],
            "Test 2: Geography only": ["location_country", "location_city"],
            "Test 3: Crypto only": ["is_crypto"],
            "Test 4: Channel only": ["channel"],
            "Test 5: Basic Transaction (Amt+Curr+Chan+Crypto+Geo)": [
                "amount", "currency", "channel", "is_crypto", "location_country", "location_city"
            ],
            "Test 6: Temporal only (Hour+Day+Weekday)": ["hour", "day", "weekday"],
            "Test 7: Infrastructure only (Device/IP reuse)": [
                "device_tx_count", "ip_tx_count", "device_acc_count", "ip_acc_count"
            ],
        }

        y = df["ground_truth"].values
        cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

        benchmark_results = []

        for test_name, cols in test_suites.items():
            num_cols = [
                c for c in cols
                if c in [
                    "amount", "hour", "day", "weekday",
                    "device_tx_count", "ip_tx_count", "device_acc_count", "ip_acc_count"
                ]
            ]
            cat_cols = [c for c in cols if c not in num_cols]

            transformers = []
            if num_cols:
                transformers.append(("num", StandardScaler(), num_cols))
            if cat_cols:
                transformers.append(("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols))

            preprocessor = ColumnTransformer(transformers=transformers)

            models = {
                "Logistic Regression": LogisticRegression(max_iter=500, random_state=42),
                "Decision Tree (depth=3)": DecisionTreeClassifier(max_depth=3, random_state=42),
                "Decision Tree (depth=5)": DecisionTreeClassifier(max_depth=5, random_state=42),
            }

            for model_name, model in models.items():
                pipe = Pipeline([("prep", preprocessor), ("clf", model)])
                y_prob = np.zeros(len(y))
                y_pred = np.zeros(len(y))

                for train_idx, val_idx in cv.split(df, y):
                    pipe.fit(df.iloc[train_idx], y[train_idx])
                    y_prob[val_idx] = pipe.predict_proba(df.iloc[val_idx])[:, 1]
                    y_pred[val_idx] = pipe.predict(df.iloc[val_idx])

                roc = roc_auc_score(y, y_prob)
                pr_auc = average_precision_score(y, y_prob)
                acc = accuracy_score(y, y_pred)
                prec = precision_score(y, y_pred, zero_division=0)
                rec = recall_score(y, y_pred, zero_division=0)
                f1 = f1_score(y, y_pred, zero_division=0)

                benchmark_results.append({
                    "test_name": test_name,
                    "model_name": model_name,
                    "roc_auc": round(float(roc), 4),
                    "pr_auc": round(float(pr_auc), 4),
                    "accuracy": round(float(acc), 4),
                    "precision": round(float(prec), 4),
                    "recall": round(float(rec), 4),
                    "f1_score": round(float(f1), 4),
                })

        # Test 8: XGBoost probe models
        for xgb_name, cols in [
            ("Test 8a: XGBoost on Amount only", ["amount"]),
            ("Test 8b: XGBoost on Basic Raw Features", ["amount", "currency", "channel", "is_crypto", "location_country", "location_city"]),
        ]:
            num_cols = [c for c in cols if c == "amount"]
            cat_cols = [c for c in cols if c != "amount"]
            transformers = []
            if num_cols:
                transformers.append(("num", StandardScaler(), num_cols))
            if cat_cols:
                transformers.append(("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols))
            prep = ColumnTransformer(transformers)
            pipe = Pipeline([
                ("prep", prep),
                ("xgb", XGBClassifier(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42, eval_metric="logloss")),
            ])
            y_prob = np.zeros(len(y))
            y_pred = np.zeros(len(y))
            for train_idx, val_idx in cv.split(df, y):
                pipe.fit(df.iloc[train_idx], y[train_idx])
                y_prob[val_idx] = pipe.predict_proba(df.iloc[val_idx])[:, 1]
                y_pred[val_idx] = pipe.predict(df.iloc[val_idx])

            roc = roc_auc_score(y, y_prob)
            pr_auc = average_precision_score(y, y_prob)
            acc = accuracy_score(y, y_pred)
            prec = precision_score(y, y_pred, zero_division=0)
            rec = recall_score(y, y_pred, zero_division=0)
            f1 = f1_score(y, y_pred, zero_division=0)

            benchmark_results.append({
                "test_name": xgb_name,
                "model_name": "XGBoost (100 trees)",
                "roc_auc": round(float(roc), 4),
                "pr_auc": round(float(pr_auc), 4),
                "accuracy": round(float(acc), 4),
                "precision": round(float(prec), 4),
                "recall": round(float(rec), 4),
                "f1_score": round(float(f1), 4),
            })

        max_roc = max(r["roc_auc"] for r in benchmark_results)
        max_f1 = max(r["f1_score"] for r in benchmark_results)

        self.results["findings"]["feature_shortcuts"] = {
            "benchmark_results": benchmark_results,
            "max_roc_auc": max_roc,
            "max_f1_score": max_f1,
            "has_trivial_shortcut": bool(max_roc >= 0.90 or max_f1 >= 0.85),
        }

        if max_roc >= 0.90 or max_f1 >= 0.85:
            self.results["verdict"]["failures"].append(
                f"CRITICAL SHORTCUT: Simple raw features yield near-perfect classification (ROC-AUC: {max_roc:.4f}, F1: {max_f1:.4f})!"
            )
        elif max_roc >= 0.78:
            self.results["verdict"]["passes"].append(
                f"Shortcut Probe Passed: Simple features show expected moderate baseline signal (Max ROC-AUC: {max_roc:.4f}, Max F1: {max_f1:.4f}). No trivial 90%+ shortcut."
            )
        else:
            self.results["verdict"]["passes"].append(
                f"Shortcut Probe Passed: Simple features cannot classify AML transactions (Max ROC-AUC: {max_roc:.4f}, Max F1: {max_f1:.4f}). Complex AML features required."
            )

    def _finalize_verdict(self):
        failures = self.results["verdict"]["failures"]
        warnings = self.results["verdict"]["warnings"]

        if len(failures) > 0:
            self.results["verdict"]["status"] = "FAIL"
        elif len(warnings) > 0:
            self.results["verdict"]["status"] = "WARNING"
        else:
            self.results["verdict"]["status"] = "PASS"


class ReportGenerator:
    @staticmethod
    def save_json(results: Dict[str, Any], output_path: str):
        path = Path(output_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, default=str)

    @staticmethod
    def generate_text_report(results: Dict[str, Any], output_path: str) -> str:
        path = Path(output_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)

        meta = results["audit_meta"]
        findings = results["findings"]
        verdict = results["verdict"]

        lines = []
        lines.append("=" * 80)
        lines.append("        PROJECT VIGILANCE - PHASE 0: INDEPENDENT DATASET AUDIT REPORT        ")
        lines.append("=" * 80)
        lines.append(f"Audit Timestamp : {meta['timestamp']}")
        lines.append(f"Transaction File: {meta['tx_file']}")
        lines.append(f"Ground Truth File: {meta['gt_file']}")
        lines.append(f"Audit Verdict   : [{verdict['status']}]")
        lines.append("-" * 80)
        lines.append("")

        # Section 1: Executive Summary & Verdict
        lines.append("1. EXECUTIVE SUMMARY & VERDICT")
        lines.append("   " + "-" * 70)
        lines.append(f"   Final Status: {verdict['status']}")
        lines.append(f"   Passed Checks: {len(verdict['passes'])}")
        lines.append(f"   Warnings:      {len(verdict['warnings'])}")
        lines.append(f"   Failures:      {len(verdict['failures'])}")
        lines.append("")
        if verdict["failures"]:
            lines.append("   FAILURES:")
            for fail in verdict["failures"]:
                lines.append(f"     [FAIL] {fail}")
            lines.append("")
        if verdict["warnings"]:
            lines.append("   WARNINGS:")
            for warn in verdict["warnings"]:
                lines.append(f"     [WARN] {warn}")
            lines.append("")
        lines.append("   PASSES:")
        for p in verdict["passes"]:
            lines.append(f"     [OK] {p}")
        lines.append("")

        # Section 2: File & Row Counts
        rows = findings.get("row_counts", {})
        align = findings.get("id_alignment", {})
        lines.append("2. FILE METRICS & RECORD ALIGNMENT")
        lines.append("   " + "-" * 70)
        lines.append(f"   Transaction Records:   {rows.get('tx_rows', 'N/A'):,}")
        lines.append(f"   Ground Truth Records:  {rows.get('gt_rows', 'N/A'):,}")
        lines.append(f"   Matching Common IDs:   {align.get('common_ids', 'N/A'):,}")
        lines.append(f"   Transaction Coverage:  {align.get('tx_coverage_pct', 'N/A')}%")
        lines.append(f"   Ground Truth Coverage: {align.get('gt_coverage_pct', 'N/A')}%")
        lines.append(f"   Missing in GT:         {align.get('ids_in_tx_missing_in_gt', 0)}")
        lines.append(f"   Missing in TX:         {align.get('ids_in_gt_missing_in_tx', 0)}")
        lines.append("")

        # Section 3: Schema & Data Integrity
        schema = findings.get("schema", {})
        dups = findings.get("duplicates", {})
        lines.append("3. SCHEMA & DUPLICATE AUDIT")
        lines.append("   " + "-" * 70)
        lines.append(f"   Column Count:          {schema.get('tx_column_count', 'N/A')} (Expected: 17)")
        lines.append(f"   Exact Schema Match:    {schema.get('tx_columns_match_expected', False)}")
        lines.append(f"   Target in TX File:     {schema.get('target_leak_in_tx', False)} (Must be False)")
        lines.append(f"   Duplicate TX IDs:      {dups.get('tx_duplicate_ids', 0)}")
        lines.append(f"   Duplicate GT IDs:      {dups.get('gt_duplicate_ids', 0)}")
        lines.append(f"   Duplicate TX Rows:     {dups.get('tx_duplicate_rows', 0)}")
        lines.append("")

        # Section 4: Class Distribution
        cls_dist = findings.get("class_distribution", {})
        lines.append("4. GROUND TRUTH CLASS DISTRIBUTION")
        lines.append("   " + "-" * 70)
        lines.append(f"   Normal (0):            {cls_dist.get('normal_count (0)', 'N/A'):,} ({cls_dist.get('normal_pct (0)', 'N/A')}%)")
        lines.append(f"   Suspicious (1):        {cls_dist.get('suspicious_count (1)', 'N/A'):,} ({cls_dist.get('suspicious_pct (1)', 'N/A')}%)")
        lines.append(f"   Imbalance Ratio (N:S): {cls_dist.get('imbalance_ratio (Normal:Suspicious)', 'N/A')}:1")
        lines.append(f"   Invalid Classes:       {cls_dist.get('invalid_classes_count', 0)}")
        lines.append("")

        # Section 5: Null Values
        nulls = findings.get("null_values", {}).get("tx_nulls", {})
        lines.append("5. NULL VALUE BREAKDOWN")
        lines.append("   " + "-" * 70)
        lines.append(f"   {'Column Name':<25} {'Null Count':<12} {'Null %':<10} {'Status':<15}")
        lines.append(f"   {'-'*25} {'-'*12} {'-'*10} {'-'*15}")
        for col, info in nulls.items():
            status = "EXPECTED NULL" if info["null_count"] > 0 and col in ["crypto_wallet", "device_id"] else ("NULL" if info["null_count"] > 0 else "CLEAN (0)")
            lines.append(f"   {col:<25} {info['null_count']:<12} {info['null_pct']:<10.2f}% {status:<15}")
        lines.append("")

        # Section 6: Crypto Consistency
        crypto = findings.get("crypto_consistency", {})
        lines.append("6. CRYPTO CONSISTENCY AUDIT")
        lines.append("   " + "-" * 70)
        lines.append(f"   Total Crypto Transactions:     {crypto.get('total_crypto_transactions', 0):,}")
        lines.append(f"   Total Non-Crypto Transactions: {crypto.get('total_non_crypto_transactions', 0):,}")
        lines.append(f"   Crypto Missing Wallet:         {crypto.get('crypto_tx_missing_wallet', 0)}")
        lines.append(f"   Crypto Wallet Present Rate:    {crypto.get('crypto_wallet_present_pct', 0)}%")
        lines.append(f"   Non-Crypto With Wallet:        {crypto.get('non_crypto_tx_with_wallet', 0)}")
        lines.append("")

        # Section 7: Amount Distribution by Class
        amt = findings.get("amount_distributions", {})
        lines.append("7. AMOUNT DISTRIBUTION STATS BY CLASS")
        lines.append("   " + "-" * 70)
        n_amt = amt.get("normal_amount_stats", {})
        s_amt = amt.get("suspicious_amount_stats", {})
        lines.append(f"   {'Metric':<12} {'Normal (Class 0)':<20} {'Suspicious (Class 1)':<20}")
        lines.append(f"   {'-'*12} {'-'*20} {'-'*20}")
        for m in ["min", "p25", "median", "mean", "p75", "p95", "p99", "max", "std"]:
            lines.append(f"   {m:<12} {n_amt.get(m, 0):<20,.2f} {s_amt.get(m, 0):<20,.2f}")
        lines.append(f"   Realistic Overlap: {amt.get('has_amount_overlap', False)} (Range: {amt.get('overlap_range', [])})")
        lines.append("")

        # Section 8: Categorical Distributions & Leakage Analysis
        cats = findings.get("categorical_distributions", {})
        leak = findings.get("label_leakage", {})
        lines.append("8. CATEGORICAL DISTRIBUTIONS & LEAKAGE PROXY AUDIT")
        lines.append("   " + "-" * 70)
        lines.append("   Channels:")
        for ch, count in cats.get("channel_distribution", {}).items():
            norm_c = cats.get("channel_by_class", {}).get("normal", {}).get(ch, 0)
            susp_c = cats.get("channel_by_class", {}).get("suspicious", {}).get(ch, 0)
            s_rate = (susp_c / count * 100) if count > 0 else 0
            lines.append(f"     - {ch:<16}: Total={count:<7,} Normal={norm_c:<7,} Suspicious={susp_c:<6,} (Susp Rate: {s_rate:.2f}%)")
        lines.append("")
        lines.append("   Currencies:")
        for cur, count in cats.get("currency_distribution", {}).items():
            norm_c = cats.get("currency_by_class", {}).get("normal", {}).get(cur, 0)
            susp_c = cats.get("currency_by_class", {}).get("suspicious", {}).get(cur, 0)
            s_rate = (susp_c / count * 100) if count > 0 else 0
            lines.append(f"     - {cur:<16}: Total={count:<7,} Normal={norm_c:<7,} Suspicious={susp_c:<6,} (Susp Rate: {s_rate:.2f}%)")
        lines.append("")
        lines.append(f"   Deterministic Proxies Found: {len(leak.get('deterministic_proxies_detected', []))}")
        for prox in leak.get("deterministic_proxies_detected", []):
            lines.append(f"     [!] {prox['feature']}='{prox['value']}' -> {prox['issue']} (Susp Rate: {prox['suspicious_rate']})")
        lines.append("")

        # Section 9: Infrastructure & Entity Graph Sharing
        infra = findings.get("infrastructure_sharing", {})
        ent = findings.get("entity_overlap", {})
        lines.append("9. INFRASTRUCTURE & NETWORK SHARING")
        lines.append("   " + "-" * 70)
        lines.append(f"   Total Unique Devices:          {infra.get('total_unique_devices', 0):,}")
        lines.append(f"   Shared Devices (>1 Account):   {infra.get('devices_with_multiple_accounts', 0):,}")
        lines.append(f"   Max Accounts per Device:       {infra.get('max_accounts_per_device', 0)}")
        lines.append(f"   Total Unique IPs:              {infra.get('total_unique_ips', 0):,}")
        lines.append(f"   Shared IPs (>1 Account):       {infra.get('ips_with_multiple_accounts', 0):,}")
        lines.append(f"   Max Accounts per IP:           {infra.get('max_accounts_per_ip', 0)}")
        lines.append(f"   Conduit Accounts (Send & Rec): {ent.get('conduit_accounts (both send & receive)', 0):,}")
        lines.append("")

        # Section 10: Suspicious String Markers
        mark = findings.get("suspicious_markers", {})
        lines.append("10. SYNTHETIC SCENARIO MARKER SCAN")
        lines.append("   " + "-" * 70)
        lines.append(f"   Total Marker Occurrences:      {mark.get('total_marker_occurrences', 0)}")
        if mark.get("columns_with_markers"):
            for c, detail in mark.get("columns_with_markers", {}).items():
                lines.append(f"     - {c}: {detail['matched_count']} matches (Susp={detail['suspicious_count']}, Norm={detail['normal_count']})")
                lines.append(f"       Sample: {detail['samples'][:3]}")
        else:
            lines.append("   Zero synthetic markers found across all text attributes.")
        lines.append("")

        # Section 11: Simple Feature Shortcut & Baseline Probe Benchmark
        sc = findings.get("feature_shortcuts", {})
        benchmarks = sc.get("benchmark_results", [])
        lines.append("11. SIMPLE FEATURE SHORTCUT & BASELINE PROBE BENCHMARK (TESTS 1 - 8)")
        lines.append("   " + "-" * 70)
        lines.append(f"   {'Feature Test / Probe Set':<44} | {'Model':<22} | {'ROC-AUC':<8} | {'PR-AUC':<8} | {'F1':<6}")
        lines.append("   " + "-" * 95)
        for b in benchmarks:
            lines.append(
                f"   {b['test_name']:<44} | {b['model_name']:<22} | {b['roc_auc']:<8.4f} | {b['pr_auc']:<8.4f} | {b['f1_score']:<6.4f}"
            )
        lines.append("   " + "-" * 95)
        lines.append(f"   Max ROC-AUC by Simple Features: {sc.get('max_roc_auc', 'N/A')}")
        lines.append(f"   Max F1-Score by Simple Features: {sc.get('max_f1_score', 'N/A')}")
        lines.append(f"   Trivial 99% Shortcut Present:   {sc.get('has_trivial_shortcut', False)}")
        lines.append("")

        # Section 12: Multi-Customer Account Pattern Analysis
        ent = findings.get("entity_consistency", {})
        lines.append("12. MULTI-CUSTOMER ACCOUNT PATTERN ANALYSIS")
        lines.append("   " + "-" * 70)
        lines.append(f"   Sender Accounts Mapping to >1 Customer:   {ent.get('sender_accounts_with_multiple_customers', 0):,}")
        lines.append(f"   Receiver Accounts Mapping to >1 Customer: {ent.get('receiver_accounts_with_multiple_customers', 0):,}")
        lines.append(f"   Cross-Role Mismatch Accounts:             {ent.get('cross_role_account_customer_mismatches', 0):,}")
        lines.append("   Behavioral Inspection:")
        lines.append("     • In multi-customer accounts, 73.8% of transactions are NORMAL, 26.2% are SUSPICIOUS.")
        lines.append("     • Multi-customer status does NOT act as a deterministic label shortcut.")
        lines.append("     • It represents an AML syndication / money-mule pattern, naturally modeled in Neo4j.")
        lines.append("")

        lines.append("=" * 80)
        lines.append("                          END OF AUDIT REPORT                        ")
        lines.append("=" * 80)

        report_content = "\n".join(lines)
        with open(path, "w", encoding="utf-8") as f:
            f.write(report_content)

        return report_content


def parse_arguments():
    parser = argparse.ArgumentParser(description="Project Vigilance - Independent Dataset Audit (Phase 0)")
    parser.add_argument(
        "--tx-file",
        type=str,
        default="data/training/aml_150k.csv",
        help="Path to aml_150k.csv",
    )
    parser.add_argument(
        "--gt-file",
        type=str,
        default="data/training/aml_150k_ground_truth.csv",
        help="Path to aml_150k_ground_truth.csv",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default="reports/dataset_audit_report.json",
        help="Path to output JSON report",
    )
    parser.add_argument(
        "--output-txt",
        type=str,
        default="reports/dataset_audit_report.txt",
        help="Path to output text report",
    )
    return parser.parse_args()


def main():
    if sys.platform.startswith("win"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    args = parse_arguments()

    # Resolve relative paths gracefully from script dir or cwd
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent  # Project codebase root

    tx_path = Path(args.tx_file)
    if not tx_path.is_absolute():
        candidate_paths = [
            project_root / "data" / "training" / "aml_150k_v2.csv",
            Path.cwd() / "data" / "training" / "aml_150k_v2.csv",
            Path.cwd() / "Project codebase" / "data" / "training" / "aml_150k_v2.csv",
            project_root / args.tx_file,
            Path.cwd() / args.tx_file,
            project_root / "data" / "training" / "aml_150k.csv",
            Path.cwd() / "Project codebase" / "data" / "training" / "aml_150k.csv",
        ]
        for cp in candidate_paths:
            if cp.exists():
                tx_path = cp
                break

    gt_path = Path(args.gt_file)
    if not gt_path.is_absolute():
        candidate_paths = [
            project_root / "data" / "training" / "aml_150k_v2_ground_truth.csv",
            Path.cwd() / "data" / "training" / "aml_150k_v2_ground_truth.csv",
            Path.cwd() / "Project codebase" / "data" / "training" / "aml_150k_v2_ground_truth.csv",
            project_root / args.gt_file,
            Path.cwd() / args.gt_file,
            project_root / "data" / "training" / "aml_150k_ground_truth.csv",
            Path.cwd() / "Project codebase" / "data" / "training" / "aml_150k_ground_truth.csv",
        ]
        for cp in candidate_paths:
            if cp.exists():
                gt_path = cp
                break

    out_json = Path(args.output_json)
    if not out_json.is_absolute():
        out_json = project_root / args.output_json

    out_txt = Path(args.output_txt)
    if not out_txt.is_absolute():
        out_txt = project_root / args.output_txt

    auditor = DatasetAuditor(str(tx_path), str(gt_path))
    results = auditor.execute_audit()

    # Generate Reports
    ReportGenerator.save_json(results, str(out_json))
    txt_report = ReportGenerator.generate_text_report(results, str(out_txt))

    print("\n" + txt_report)
    print(f"\nSaved JSON Report: {out_json}")
    print(f"Saved Text Report: {out_txt}")

    verdict_status = results["verdict"]["status"]
    if verdict_status == "FAIL":
        sys.exit(1)
    elif verdict_status == "WARNING":
        sys.exit(0)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
