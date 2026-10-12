"""
Project Vigilance - Strict Schema & Domain Validators
====================================================
Module: ml-service/app/preprocessing/validators.py

Purpose:
Production-grade, zero-tolerance validation engine ensuring incoming CSV/XLSX
datasets strictly comply with the canonical 17-column specification, valid domain
constraints, syntactic formats, and ground-truth alignment.
"""

import ipaddress
import re
from typing import Dict, Any, List, Set, Optional, Tuple
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .schema import (
    REQUIRED_TRANSACTION_COLUMNS,
    MANDATORY_NON_NULL_COLUMNS,
    NULLABLE_COLUMNS,
    APPROVED_CURRENCIES,
    APPROVED_CHANNELS,
    GROUND_TRUTH_COLUMNS,
)


class ValidationError(Exception):
    """Exception raised when a strict validation rule is violated."""
    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.errors = errors or [message]


@dataclass
class ValidationResult:
    """Encapsulates the structured report of a dataset validation run."""
    is_valid: bool
    total_records: int
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    stats: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "total_records": self.total_records,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "errors": self.errors,
            "warnings": self.warnings,
            "stats": self.stats,
        }


class StrictSchemaValidator:
    """
    Validates transactional DataFrames and Ground Truth DataFrames against
    canonical Project Vigilance specifications.
    """

    def __init__(self):
        pass

    def validate_columns(self, df: pd.DataFrame) -> List[str]:
        """
        Ensures exact match with canonical 17 columns.
        Rejects missing columns, extra columns, or incorrect ordering.
        """
        errors = []
        actual_cols = list(df.columns)

        missing = [c for c in REQUIRED_TRANSACTION_COLUMNS if c not in actual_cols]
        extra = [c for c in actual_cols if c not in REQUIRED_TRANSACTION_COLUMNS]

        if missing:
            errors.append(f"Schema violation: Missing required columns: {missing}")
        if extra:
            errors.append(f"Schema violation: Unexpected extra columns: {extra}")

        if not missing and not extra and actual_cols != REQUIRED_TRANSACTION_COLUMNS:
            errors.append(
                f"Schema violation: Column order mismatch. "
                f"Expected {REQUIRED_TRANSACTION_COLUMNS}, got {actual_cols}"
            )

        # Explicit check: target column must NEVER be inside transaction data
        if "ground_truth" in actual_cols or "is_fraud" in actual_cols:
            errors.append("CRITICAL LEAKAGE: Target column found directly inside transaction dataset!")

        return errors

    def validate_null_constraints(self, df: pd.DataFrame) -> Tuple[List[str], Dict[str, int]]:
        """
        Ensures mandatory non-null columns have zero missing values.
        Audits nullable columns for reporting.
        """
        errors = []
        null_counts = {}

        for col in df.columns:
            cnt = int(df[col].isna().sum())
            null_counts[col] = cnt
            if col in MANDATORY_NON_NULL_COLUMNS and cnt > 0:
                pct = (cnt / len(df)) * 100
                errors.append(
                    f"Null constraint violation: Mandatory column '{col}' has {cnt} ({pct:.2f}%) nulls."
                )

        return errors, null_counts

    def validate_transaction_ids(
        self, df: pd.DataFrame, gt_df: Optional[pd.DataFrame] = None
    ) -> List[str]:
        """
        Ensures transaction_id is non-null, unique, and bijectively aligns with GT.
        """
        errors = []
        if "transaction_id" not in df.columns:
            return ["Missing 'transaction_id' column."]

        null_ids = int(df["transaction_id"].isna().sum())
        if null_ids > 0:
            errors.append(f"Transaction ID violation: Found {null_ids} null transaction IDs.")

        dup_ids = int(df["transaction_id"].duplicated().sum())
        if dup_ids > 0:
            errors.append(f"Transaction ID violation: Found {dup_ids} duplicate transaction IDs in transaction data.")

        if gt_df is not None:
            if "transaction_id" not in gt_df.columns:
                errors.append("Ground Truth violation: Missing 'transaction_id' in ground truth file.")
            else:
                gt_null_ids = int(gt_df["transaction_id"].isna().sum())
                if gt_null_ids > 0:
                    errors.append(f"Ground Truth violation: Found {gt_null_ids} null IDs in ground truth.")

                gt_dup_ids = int(gt_df["transaction_id"].duplicated().sum())
                if gt_dup_ids > 0:
                    errors.append(f"Ground Truth violation: Found {gt_dup_ids} duplicate IDs in ground truth.")

                tx_set = set(df["transaction_id"].dropna())
                gt_set = set(gt_df["transaction_id"].dropna())

                missing_in_gt = tx_set - gt_set
                extra_in_gt = gt_set - tx_set

                if missing_in_gt:
                    errors.append(
                        f"Ground Truth alignment violation: {len(missing_in_gt)} transaction IDs are missing in ground truth."
                    )
                if extra_in_gt:
                    errors.append(
                        f"Ground Truth alignment violation: {len(extra_in_gt)} extra transaction IDs found in ground truth."
                    )

        return errors

    def validate_amounts(self, df: pd.DataFrame) -> List[str]:
        """
        Ensures amount is strictly numeric, finite, positive (> 0), no NaN, no inf.
        """
        errors = []
        if "amount" not in df.columns:
            return ["Missing 'amount' column."]

        amount_series = df["amount"]
        if not np.issubdtype(amount_series.dtype, np.number):
            # Check if strings can be cleanly parsed
            try:
                coerced = pd.to_numeric(amount_series, errors="coerce")
                if coerced.isna().sum() > amount_series.isna().sum():
                    errors.append("Amount violation: Column contains non-numeric strings.")
            except Exception:
                errors.append("Amount violation: Column is non-numeric.")
                return errors
        else:
            coerced = amount_series

        nan_cnt = int(coerced.isna().sum())
        inf_cnt = int(np.isinf(coerced).sum())
        non_positive_cnt = int((coerced <= 0).sum())

        if nan_cnt > 0:
            errors.append(f"Amount violation: Found {nan_cnt} NaN amounts.")
        if inf_cnt > 0:
            errors.append(f"Amount violation: Found {inf_cnt} infinite amounts.")
        if non_positive_cnt > 0:
            errors.append(f"Amount violation: Found {non_positive_cnt} non-positive amounts (<= 0).")

        return errors

    def validate_timestamps(self, df: pd.DataFrame) -> List[str]:
        """
        Ensures timestamps conform to ISO-8601 UTC.
        """
        errors = []
        if "timestamp" not in df.columns:
            return ["Missing 'timestamp' column."]

        ts_series = df["timestamp"].dropna()
        try:
            parsed = pd.to_datetime(ts_series, format="ISO8601")
            invalid_cnt = int(parsed.isna().sum())
            if invalid_cnt > 0:
                errors.append(f"Timestamp violation: Found {invalid_cnt} invalid date strings.")
        except Exception as e:
            errors.append(f"Timestamp violation: ISO-8601 parsing failed: {str(e)}")

        return errors

    def validate_currencies(self, df: pd.DataFrame) -> List[str]:
        """
        Ensures currency is among approved currencies (INR, USDT).
        """
        errors = []
        if "currency" not in df.columns:
            return ["Missing 'currency' column."]

        currencies = set(df["currency"].dropna().astype(str).str.strip().str.upper())
        unsupported = currencies - APPROVED_CURRENCIES
        if unsupported:
            errors.append(f"Currency violation: Unsupported currencies detected: {unsupported}")

        return errors

    def validate_channels(self, df: pd.DataFrame) -> List[str]:
        """
        Ensures channel is among approved channels.
        """
        errors = []
        if "channel" not in df.columns:
            return ["Missing 'channel' column."]

        channels = set(df["channel"].dropna().astype(str).str.strip())
        unsupported = channels - APPROVED_CHANNELS
        if unsupported:
            errors.append(f"Channel violation: Unsupported payment channels detected: {unsupported}")

        return errors

    def validate_ip_addresses(self, df: pd.DataFrame) -> Tuple[List[str], int]:
        """
        Ensures IP addresses are syntactically valid IPv4 or IPv6 addresses.
        """
        errors = []
        if "ip_address" not in df.columns:
            return ["Missing 'ip_address' column."], 0

        unique_ips = df["ip_address"].dropna().unique()
        invalid_ips = []

        for ip_str in unique_ips:
            try:
                ipaddress.ip_address(str(ip_str).strip())
            except ValueError:
                invalid_ips.append(str(ip_str))
                if len(invalid_ips) >= 10:  # limit reporting samples
                    break

        if invalid_ips:
            errors.append(
                f"IP address violation: Invalid syntactic IP addresses found (sample: {invalid_ips[:5]})"
            )

        return errors, len(unique_ips)

    def validate_crypto_consistency(self, df: pd.DataFrame) -> Tuple[List[str], List[str]]:
        """
        Validates is_crypto and crypto_wallet consistency:
        - When is_crypto is True: crypto_wallet should be present
        - When is_crypto is False: crypto_wallet should be null or empty
        """
        errors = []
        warnings = []

        if "is_crypto" not in df.columns or "crypto_wallet" not in df.columns:
            return ["Missing 'is_crypto' or 'crypto_wallet' column."], []

        is_crypto_bool = df["is_crypto"].astype(str).str.lower().isin(["true", "1"])
        has_wallet = df["crypto_wallet"].notna() & (df["crypto_wallet"].astype(str).str.strip() != "")

        crypto_missing_wallet = int((is_crypto_bool & ~has_wallet).sum())
        non_crypto_with_wallet = int((~is_crypto_bool & has_wallet).sum())

        if crypto_missing_wallet > 0:
            warnings.append(
                f"Crypto consistency warning: {crypto_missing_wallet} crypto transactions missing crypto_wallet."
            )
        if non_crypto_with_wallet > 0:
            warnings.append(
                f"Crypto consistency warning: {non_crypto_with_wallet} non-crypto transactions contain a crypto_wallet."
            )

        return errors, warnings

    def validate_ground_truth(self, gt_df: pd.DataFrame) -> List[str]:
        """
        Validates ground truth structure: exactly 2 columns, binary {0, 1}, no nulls.
        """
        errors = []
        actual_cols = list(gt_df.columns)
        if actual_cols != GROUND_TRUTH_COLUMNS:
            errors.append(f"Ground Truth schema violation: Expected {GROUND_TRUTH_COLUMNS}, got {actual_cols}")

        if "ground_truth" in gt_df.columns:
            null_gt = int(gt_df["ground_truth"].isna().sum())
            if null_gt > 0:
                errors.append(f"Ground Truth violation: {null_gt} null values in 'ground_truth'.")

            unique_vals = set(gt_df["ground_truth"].dropna().unique())
            invalid_vals = unique_vals - {0, 1}
            if invalid_vals:
                errors.append(f"Ground Truth violation: Non-binary target values detected: {invalid_vals}")

        return errors

    def validate_all(
        self, df: pd.DataFrame, gt_df: Optional[pd.DataFrame] = None
    ) -> ValidationResult:
        """
        Runs comprehensive validation suite.
        """
        all_errors = []
        all_warnings = []
        stats = {}

        # 1. Column structure
        col_errs = self.validate_columns(df)
        all_errors.extend(col_errs)

        # 2. Null constraints
        null_errs, null_counts = self.validate_null_constraints(df)
        all_errors.extend(null_errs)
        stats["null_counts"] = null_counts

        # 3. Transaction ID and GT alignment
        id_errs = self.validate_transaction_ids(df, gt_df)
        all_errors.extend(id_errs)

        # 4. Amounts
        amt_errs = self.validate_amounts(df)
        all_errors.extend(amt_errs)

        # 5. Timestamps
        ts_errs = self.validate_timestamps(df)
        all_errors.extend(ts_errs)

        # 6. Currencies
        curr_errs = self.validate_currencies(df)
        all_errors.extend(curr_errs)

        # 7. Channels
        chan_errs = self.validate_channels(df)
        all_errors.extend(chan_errs)

        # 8. IP addresses
        ip_errs, unique_ips = self.validate_ip_addresses(df)
        all_errors.extend(ip_errs)
        stats["unique_ips"] = unique_ips

        # 9. Crypto consistency
        crypto_errs, crypto_warns = self.validate_crypto_consistency(df)
        all_errors.extend(crypto_errs)
        all_warnings.extend(crypto_warns)

        # 10. Ground truth
        if gt_df is not None:
            gt_errs = self.validate_ground_truth(gt_df)
            all_errors.extend(gt_errs)
            stats["ground_truth_records"] = len(gt_df)
            stats["ground_truth_class_counts"] = gt_df["ground_truth"].value_counts().to_dict()

        is_valid = len(all_errors) == 0
        return ValidationResult(
            is_valid=is_valid,
            total_records=len(df),
            errors=all_errors,
            warnings=all_warnings,
            stats=stats,
        )
