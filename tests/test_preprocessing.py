"""
Project Vigilance - Phase 1 Automated Test Suite
================================================
Test Module: tests/test_preprocessing.py

Comprehensive tests verifying schema enforcement, domain validation,
deterministic cleaning, ground-truth separation, source immutability,
and organizational research separation.
"""

import sys
import copy
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

# Ensure ml-service is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.preprocessing import (
    REQUIRED_TRANSACTION_COLUMNS,
    APPROVED_CURRENCIES,
    APPROVED_CHANNELS,
    IDENTIFIER_COLUMNS,
    StrictSchemaValidator,
    ValidationError,
    DataCleaner,
    PreprocessingPipeline,
    extract_basic_temporal_features,
    parse_and_normalize_timestamps,
)


@pytest.fixture
def sample_valid_tx_data():
    """Generates a small valid DataFrame conforming exactly to canonical schema."""
    return pd.DataFrame([
        {
            "transaction_id": "TX-V2-000001",
            "timestamp": "2026-10-01T10:15:30.123Z",
            "sender_account": "ACC-V2-100001",
            "sender_name": "Arun Kumar",
            "sender_customer_id": "CUST-V2-10001",
            "receiver_account": "ACC-V2-100002",
            "receiver_name": "Priya Sharma",
            "receiver_customer_id": "CUST-V2-10002",
            "amount": 25000.50,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "192.168.1.100",
            "device_id": "DEV-V2-1001",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
        },
        {
            "transaction_id": "TX-V2-000002",
            "timestamp": "2026-10-01T11:20:45.000Z",
            "sender_account": "ACC-V2-100003",
            "sender_name": "Crypto Traders Ltd",
            "sender_customer_id": "CUST-V2-10003",
            "receiver_account": "ACC-V2-100004",
            "receiver_name": "Global Offramp Hub",
            "receiver_customer_id": "CUST-V2-10004",
            "amount": 5400.00,
            "currency": "USDT",
            "channel": "Crypto Gateway",
            "ip_address": "10.0.0.1",
            "device_id": np.nan,  # legitimately null device
            "location_country": "Singapore",
            "location_city": "Singapore",
            "is_crypto": True,
            "crypto_wallet": "WALLET-0x9876abc",
        },
    ])


@pytest.fixture
def sample_valid_gt_data():
    """Generates matching ground truth records."""
    return pd.DataFrame([
        {"transaction_id": "TX-V2-000001", "ground_truth": 0},
        {"transaction_id": "TX-V2-000002", "ground_truth": 1},
    ])


# 1. Schema Validation
def test_schema_validation_passes_on_valid_data(sample_valid_tx_data, sample_valid_gt_data):
    validator = StrictSchemaValidator()
    result = validator.validate_all(sample_valid_tx_data, sample_valid_gt_data)
    assert result.is_valid is True
    assert len(result.errors) == 0


# 2. Missing Columns
def test_schema_fails_on_missing_columns(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.drop(columns=["channel", "amount"])
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Missing required columns" in err for err in result.errors)


# 3. Unexpected Columns
def test_schema_fails_on_unexpected_columns(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df["extra_unapproved_column"] = "leak"
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Unexpected extra columns" in err for err in result.errors)


# 4. Duplicate Transaction IDs
def test_fails_on_duplicate_transaction_ids(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = pd.concat([sample_valid_tx_data, sample_valid_tx_data.iloc[[0]]], ignore_index=True)
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("duplicate transaction IDs" in err for err in result.errors)


# 5. Ground Truth Alignment
def test_fails_on_ground_truth_alignment_mismatch(sample_valid_tx_data, sample_valid_gt_data):
    validator = StrictSchemaValidator()
    # Missing 1 ID in ground truth
    mismatched_gt = sample_valid_gt_data.iloc[[0]].copy()
    result = validator.validate_all(sample_valid_tx_data, mismatched_gt)
    assert result.is_valid is False
    assert any("missing in ground truth" in err for err in result.errors)


# 6. Invalid / Non-numeric Amount
def test_fails_on_non_numeric_amount(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df["amount"] = invalid_df["amount"].astype(object)
    invalid_df.loc[0, "amount"] = "INVALID_STRING"
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Amount violation" in err for err in result.errors)


# 7. Negative Amount
def test_fails_on_negative_amount(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "amount"] = -500.00
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("non-positive amounts" in err for err in result.errors)


# 8. Zero Amount
def test_fails_on_zero_amount(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "amount"] = 0.0
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("non-positive amounts" in err for err in result.errors)


# 9. NaN / Infinite Amount
def test_fails_on_nan_or_infinite_amount(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "amount"] = np.nan
    invalid_df.loc[1, "amount"] = np.inf
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Amount violation" in err for err in result.errors)


# 10. Invalid Timestamp
def test_fails_on_invalid_timestamp(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "timestamp"] = "NOT_A_TIMESTAMP_STRING"
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Timestamp violation" in err for err in result.errors)


# 11. UTC Normalization
def test_utc_normalization_and_basic_temporal_features(sample_valid_tx_data):
    processed = extract_basic_temporal_features(sample_valid_tx_data)
    assert "transaction_date" in processed.columns
    assert "transaction_hour" in processed.columns
    assert "transaction_weekday" in processed.columns
    assert processed.loc[0, "transaction_date"] == "2026-10-01"
    assert processed.loc[0, "transaction_hour"] == 10
    assert processed.loc[0, "transaction_weekday"] == 3  # 2026-10-01 is a Thursday (3)


# 12. Currency Validation
def test_fails_on_unsupported_currency(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "currency"] = "BITCOIN_UNAPPROVED"
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Unsupported currencies" in err for err in result.errors)


# 13. Channel Validation
def test_fails_on_unsupported_channel(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "channel"] = "HAWALA_UNKNOWN"
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Unsupported payment channels" in err for err in result.errors)


# 14. IP Syntactic Validation
def test_fails_on_invalid_ip_syntax(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    invalid_df = sample_valid_tx_data.copy()
    invalid_df.loc[0, "ip_address"] = "999.999.999.999"
    result = validator.validate_all(invalid_df)
    assert result.is_valid is False
    assert any("Invalid syntactic IP" in err for err in result.errors)


# 15. Nullable device_id preservation
def test_nullable_device_id_preservation(sample_valid_tx_data):
    cleaner = DataCleaner()
    cleaned, _ = cleaner.clean(sample_valid_tx_data)
    # Row 1 has null device_id; verify it was NOT replaced with 0 or "UNKNOWN"
    assert pd.isna(cleaned.loc[1, "device_id"])


# 16. Crypto / Wallet Consistency Check
def test_crypto_wallet_consistency(sample_valid_tx_data):
    validator = StrictSchemaValidator()
    # When non-crypto has wallet
    inconsistent_df = sample_valid_tx_data.copy()
    inconsistent_df.loc[0, "crypto_wallet"] = "WALLET-0x12345"  # is_crypto is False
    result = validator.validate_all(inconsistent_df)
    assert any("non-crypto transactions contain a crypto_wallet" in w for w in result.warnings)


# 17. Ground Truth Exclusion from Features
def test_ground_truth_is_never_in_processed_features(sample_valid_tx_data, sample_valid_gt_data):
    pipeline = PreprocessingPipeline()
    processed, _, _ = pipeline.process_dataframe(sample_valid_tx_data, sample_valid_gt_data)
    assert "ground_truth" not in processed.columns
    assert "is_fraud" not in processed.columns


# 18. Identifier Exclusion from Numerical Features Policy
def test_identifier_policy_preservation():
    # Verify that all 10 canonical identifiers are tracked
    assert len(IDENTIFIER_COLUMNS) == 10
    for id_col in ["transaction_id", "sender_account", "receiver_account", "device_id", "ip_address"]:
        assert id_col in IDENTIFIER_COLUMNS


# 19. Location Preservation
def test_location_preservation(sample_valid_tx_data):
    cleaner = DataCleaner()
    cleaned, _ = cleaner.clean(sample_valid_tx_data)
    assert cleaned.loc[0, "location_country"] == "India"
    assert cleaned.loc[0, "location_city"] == "Mumbai"
    assert cleaned.loc[1, "location_country"] == "Singapore"
    assert cleaned.loc[1, "location_city"] == "Singapore"


# 20. Raw Amount Preservation (No clipping/capping)
def test_raw_amount_preservation(sample_valid_tx_data):
    cleaner = DataCleaner()
    cleaned, _ = cleaner.clean(sample_valid_tx_data)
    assert cleaned.loc[0, "amount"] == 25000.50
    assert cleaned.loc[1, "amount"] == 5400.00


# 21. Deterministic Preprocessing
def test_deterministic_preprocessing_repeatability(sample_valid_tx_data):
    pipeline = PreprocessingPipeline()
    p1, _, _ = pipeline.process_dataframe(sample_valid_tx_data)
    p2, _, _ = pipeline.process_dataframe(sample_valid_tx_data)
    pd.testing.assert_frame_equal(p1, p2)


# 22. Source Immutability
def test_source_immutability(tmp_path, sample_valid_tx_data):
    csv_file = tmp_path / "immutable_test.csv"
    sample_valid_tx_data.to_csv(csv_file, index=False)
    initial_hash = PreprocessingPipeline.compute_file_hash(csv_file)

    pipeline = PreprocessingPipeline()
    out_file = tmp_path / "processed_test.csv"
    res = pipeline.run(csv_file, output_file_path=out_file)

    post_hash = PreprocessingPipeline.compute_file_hash(csv_file)
    assert initial_hash == post_hash
    assert res.input_hash == post_hash


# 23. Phase 0 Research Separation Test
def test_phase0_research_separation():
    """Verifies production code does not import research modules."""
    import app.preprocessing
    import app.preprocessing.schema
    import app.preprocessing.validators
    import app.preprocessing.pipeline

    # Ensure no research module in sys.modules imported by app
    research_imports = [m for m in sys.modules if "research" in m or "dataset_audit" in m or "shortcut_audit" in m]
    assert len(research_imports) == 0, f"Found research modules in production scope: {research_imports}"

    # Verify research scripts exist in research/
    research_dir = PROJECT_ROOT / "research" / "dataset_validation"
    assert (research_dir / "dataset_audit.py").exists()
    assert (research_dir / "shortcut_audit.py").exists()
    assert (research_dir / "reports" / "dataset_audit_report.json").exists()
