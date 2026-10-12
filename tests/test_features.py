"""
Project Vigilance - Phase 2 Automated Feature Engineering Test Suite
====================================================================
Test Module: tests/test_features.py

Comprehensive tests verifying leakage-safety, deterministic ordering,
rolling window calculations, counterparty diversities, infrastructure reuse,
source immutability, and feature definitions completeness.
"""

import sys
import json
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

# Ensure ml-service is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.features import (
    FeatureEngineeringPipeline,
    RAW_IDENTIFIER_METADATA_COLUMNS,
    extract_transaction_features,
    extract_temporal_features,
    extract_velocity_features,
    extract_behavioral_features,
    compute_near_regulatory_threshold_indicators,
    REGULATORY_CTR_THRESHOLD_INR,
    NEAR_THRESHOLD_LOWER_RATIO,
    extract_infrastructure_features,
    extract_relationship_features,
)


@pytest.fixture
def sample_cleaned_data():
    """
    Generates a controlled, chronologically ordered sample dataset with known transactions,
    senders, receivers, devices, IPs, and timestamps designed for exact assertion verification.
    """
    return pd.DataFrame([
        # Tx 0: Sender A -> Receiver B, Time: 10:00:00
        {
            "transaction_id": "TX-V2-000001",
            "timestamp": "2026-10-01T10:00:00.000Z",
            "sender_account": "ACC-A",
            "sender_name": "Alice Smith",
            "sender_customer_id": "CUST-A1",
            "receiver_account": "ACC-B",
            "receiver_name": "Bob Jones",
            "receiver_customer_id": "CUST-B",
            "amount": 10000.0,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "192.168.1.1",
            "device_id": "DEV-1",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 10,
            "transaction_weekday": 3,
        },
        # Tx 1: Sender A -> Receiver C, Time: 10:30:00 (within 1h of Tx 0)
        {
            "transaction_id": "TX-V2-000002",
            "timestamp": "2026-10-01T10:30:00.000Z",
            "sender_account": "ACC-A",
            "sender_name": "Alice Smith",
            "sender_customer_id": "CUST-A1",
            "receiver_account": "ACC-C",
            "receiver_name": "Charlie Brown",
            "receiver_customer_id": "CUST-C",
            "amount": 20000.0,
            "currency": "INR",
            "channel": "IMPS",
            "ip_address": "192.168.1.1",
            "device_id": "DEV-1",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 10,
            "transaction_weekday": 3,
        },
        # Tx 2: Sender A -> Receiver B, Time: 11:30:00 (>1h from Tx 0, within 24h)
        {
            "transaction_id": "TX-V2-000003",
            "timestamp": "2026-10-01T11:30:00.000Z",
            "sender_account": "ACC-A",
            "sender_name": "Alice Smith",
            "sender_customer_id": "CUST-A2",  # Second customer on same account!
            "receiver_account": "ACC-B",
            "receiver_name": "Bob Jones",
            "receiver_customer_id": "CUST-B",
            "amount": 30000.0,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "192.168.1.2",
            "device_id": np.nan,  # Null device
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 11,
            "transaction_weekday": 3,
        },
        # Tx 3: Sender B -> Receiver D, Time: 12:00:00 (Crypto offramp)
        {
            "transaction_id": "TX-V2-000004",
            "timestamp": "2026-10-01T12:00:00.000Z",
            "sender_account": "ACC-B",
            "sender_name": "Bob Jones",
            "sender_customer_id": "CUST-B",
            "receiver_account": "ACC-D",
            "receiver_name": "Crypto Gateway Corp",
            "receiver_customer_id": "CUST-D",
            "amount": 5000.0,
            "currency": "USDT",
            "channel": "Crypto Gateway",
            "ip_address": "10.0.0.1",
            "device_id": "DEV-2",
            "location_country": "Singapore",
            "location_city": "Singapore",
            "is_crypto": True,
            "crypto_wallet": "WALLET-0xabc123",
            "transaction_date": "2026-10-01",
            "transaction_hour": 12,
            "transaction_weekday": 3,
        },
    ])


# 1. Feature Pipeline Runs Successfully
def test_pipeline_runs_successfully(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, feat_names, stats = pipeline.transform(sample_cleaned_data)
    assert len(final_df) == len(sample_cleaned_data)
    assert len(feat_names) > 30


# 2. Output Row Count Equals Input Row Count
def test_output_row_count_equals_input(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)
    assert len(final_df) == 4


# 3. Transaction IDs Remain Aligned
def test_transaction_ids_remain_aligned(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)
    assert list(final_df["transaction_id"]) == list(sample_cleaned_data["transaction_id"])


# 4. No Ground Truth Dependency
def test_no_ground_truth_dependency(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    # Confirm pipeline runs cleanly without ground_truth column present
    assert "ground_truth" not in sample_cleaned_data.columns
    final_df, feat_names, _ = pipeline.transform(sample_cleaned_data)
    assert "ground_truth" not in final_df.columns
    assert "ground_truth" not in feat_names


# 5. No Future-Data Leakage (CRITICAL LEAKAGE TEST)
def test_no_future_data_leakage(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    # Baseline transform
    final_df1, _, _ = pipeline.transform(sample_cleaned_data)

    # Modify Tx 3 (a future transaction occurring at 12:00:00)
    modified_data = sample_cleaned_data.copy()
    modified_data.loc[3, "amount"] = 99999999.0
    modified_data.loc[3, "channel"] = "RTGS"

    final_df2, _, _ = pipeline.transform(modified_data)

    # Invariant: Features for Tx 0, Tx 1, Tx 2 MUST BE 100% BIT-FOR-BIT IDENTICAL!
    # Because future changes at Tx 3 must not leak into Tx 0, 1, 2.
    pd.testing.assert_frame_equal(final_df1.iloc[:3], final_df2.iloc[:3])


# 6. Previous 1-Hour Features
def test_previous_1_hour_velocity(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 0: Sender A first txn -> count 1h must be 0
    assert final_df.loc[0, "sender_txn_count_prev_1h"] == 0
    assert final_df.loc[0, "sender_amount_sum_prev_1h"] == 0.0

    # Tx 1: Sender A at 10:30 (30m after Tx 0) -> count 1h must be 1, sum = 10000.0
    assert final_df.loc[1, "sender_txn_count_prev_1h"] == 1
    assert final_df.loc[1, "sender_amount_sum_prev_1h"] == 10000.0

    # Tx 2: Sender A at 11:30 (1h after Tx 1, 1.5h after Tx 0) -> only Tx 1 is within 1h!
    # Interval [10:30, 11:30): Tx 0 is at 10:00 (outside). Tx 1 is at 10:30 (exactly 3600s).
    # Since j is searchsorted side='left', 11:30 - 3600s = 10:30, so Tx 1 is included.
    assert final_df.loc[2, "sender_txn_count_prev_1h"] == 1
    assert final_df.loc[2, "sender_amount_sum_prev_1h"] == 20000.0


# 7. Previous 24-Hour Features
def test_previous_24_hour_velocity(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 2: Sender A at 11:30 -> both Tx 0 and Tx 1 are within 24h!
    assert final_df.loc[2, "sender_txn_count_prev_24h"] == 2
    assert final_df.loc[2, "sender_amount_sum_prev_24h"] == 30000.0  # 10000 + 20000


# 8. Sender Historical Cumulative Features
def test_sender_historical_features(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 0: Sender A prior count = 0
    assert final_df.loc[0, "sender_txn_count_historical"] == 0
    assert final_df.loc[0, "sender_amount_sum_historical"] == 0.0

    # Tx 1: Sender A prior count = 1, sum = 10000, avg = 10000
    assert final_df.loc[1, "sender_txn_count_historical"] == 1
    assert final_df.loc[1, "sender_amount_sum_historical"] == 10000.0
    assert final_df.loc[1, "sender_amount_avg_historical"] == 10000.0

    # Tx 2: Sender A prior count = 2, sum = 30000, avg = 15000
    assert final_df.loc[2, "sender_txn_count_historical"] == 2
    assert final_df.loc[2, "sender_amount_sum_historical"] == 30000.0
    assert final_df.loc[2, "sender_amount_avg_historical"] == 15000.0


# 9. Receiver Historical Cumulative Features
def test_receiver_historical_features(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Receiver B received Tx 0 (10000.0). At Tx 2, Receiver B receives again:
    assert final_df.loc[0, "receiver_txn_count_historical"] == 0
    assert final_df.loc[2, "receiver_txn_count_historical"] == 1
    assert final_df.loc[2, "receiver_amount_sum_historical"] == 10000.0


# 10. Counterparty Diversity Features
def test_counterparty_diversity(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # At Tx 2, Sender A has previously sent to 2 unique receivers (ACC-B at Tx 0, ACC-C at Tx 1)
    assert final_df.loc[2, "sender_unique_receivers_historical"] == 2


# 11. Device Historical & Velocity Features
def test_device_features(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 0: DEV-1 first seen -> hist = 0
    assert final_df.loc[0, "device_txn_count_historical"] == 0

    # Tx 1: DEV-1 second txn -> hist = 1
    assert final_df.loc[1, "device_txn_count_historical"] == 1

    # Tx 2: Device is null -> all device counts must be 0!
    assert final_df.loc[2, "device_txn_count_historical"] == 0
    assert final_df.loc[2, "device_unique_accounts_historical"] == 0


# 12. IP Historical & Velocity Features
def test_ip_features(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 0: IP 192.168.1.1 first seen -> hist = 0
    assert final_df.loc[0, "ip_txn_count_historical"] == 0

    # Tx 1: IP 192.168.1.1 second txn -> hist = 1
    assert final_df.loc[1, "ip_txn_count_historical"] == 1


# 13. Multi-Customer Relationship Preservation
def test_multi_customer_relationships(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # At Tx 0 and Tx 1, ACC-A was operated only by CUST-A1 (distinct customers seen = 1)
    # At Tx 2, prior distinct customers for ACC-A is 1 (CUST-A1)
    assert final_df.loc[2, "sender_customers_count_historical"] == 1


# 14. Crypto Historical Features
def test_crypto_historical_features(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 0, 1, 2 are fiat (is_crypto=0)
    assert final_df.loc[0, "sender_crypto_txn_count_historical"] == 0
    assert final_df.loc[3, "is_crypto"] == 1


# 15. Amount Ratio to Average
def test_amount_ratio_to_average(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # Tx 0: first txn -> default ratio is 1.0
    assert final_df.loc[0, "amount_to_sender_avg_ratio"] == 1.0

    # Tx 1: amount=20000, prior avg=10000 -> ratio = 2.0
    assert abs(final_df.loc[1, "amount_to_sender_avg_ratio"] - 2.0) < 1e-4

    # Tx 2: amount=30000, prior avg=15000 -> ratio = 2.0
    assert abs(final_df.loc[2, "amount_to_sender_avg_ratio"] - 2.0) < 1e-4


# 16. Current Transaction Exclusion
def test_current_transaction_is_excluded(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(sample_cleaned_data)

    # For Tx 0, its own amount (10000) must NOT be counted in sender_amount_sum_historical or prev_1h
    assert final_df.loc[0, "sender_amount_sum_historical"] == 0.0
    assert final_df.loc[0, "sender_amount_sum_prev_1h"] == 0.0


# 17. Timestamp Tie-Breaking
def test_timestamp_tie_breaking():
    # Two transactions with identical timestamp
    tie_data = pd.DataFrame([
        {
            "transaction_id": "TX-V2-000002",
            "timestamp": "2026-10-01T10:00:00.000Z",
            "sender_account": "ACC-X",
            "sender_name": "User X",
            "sender_customer_id": "CUST-X",
            "receiver_account": "ACC-Y",
            "receiver_name": "User Y",
            "receiver_customer_id": "CUST-Y",
            "amount": 200.0,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "192.168.1.1",
            "device_id": "DEV-X",
            "location_country": "India",
            "location_city": "Delhi",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 10,
            "transaction_weekday": 3,
        },
        {
            "transaction_id": "TX-V2-000001",  # Alphabetically earlier ID
            "timestamp": "2026-10-01T10:00:00.000Z",
            "sender_account": "ACC-X",
            "sender_name": "User X",
            "sender_customer_id": "CUST-X",
            "receiver_account": "ACC-Y",
            "receiver_name": "User Y",
            "receiver_customer_id": "CUST-Y",
            "amount": 100.0,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "192.168.1.1",
            "device_id": "DEV-X",
            "location_country": "India",
            "location_city": "Delhi",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 10,
            "transaction_weekday": 3,
        },
    ])
    pipeline = FeatureEngineeringPipeline()
    final_df, _, _ = pipeline.transform(tie_data)

    # TX-V2-000001 must come first because of deterministic tie-breaking on transaction_id
    assert final_df.loc[0, "transaction_id"] == "TX-V2-000001"
    assert final_df.loc[1, "transaction_id"] == "TX-V2-000002"
    # Second transaction sees prior transaction 1
    assert final_df.loc[1, "sender_txn_count_historical"] == 1


# 18. Deterministic Execution
def test_deterministic_execution_repeatability(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    df1, _, _ = pipeline.transform(sample_cleaned_data)
    df2, _, _ = pipeline.transform(sample_cleaned_data)
    pd.testing.assert_frame_equal(df1, df2)


# 19. No Infinite or Unexpected NaN Values
def test_no_infinite_or_nan_values(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    final_df, feat_names, _ = pipeline.transform(sample_cleaned_data)

    for col in feat_names:
        assert not final_df[col].isna().any(), f"NaN found in feature {col}"
        assert not np.isinf(final_df[col]).any(), f"Inf found in feature {col}"


# 20. Feature Definition Completeness
def test_feature_definition_completeness(tmp_path, sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    _, feat_names, _ = pipeline.transform(sample_cleaned_data)

    defs_path = tmp_path / "defs.json"
    defs = pipeline.generate_feature_definitions(feat_names, defs_path)

    assert len(defs) == len(feat_names)
    def_names = {d["feature_name"] for d in defs}
    assert def_names == set(feat_names)


# 21. Raw Identifier Exclusion from Model Feature Names
def test_raw_identifiers_not_in_engineered_features(sample_cleaned_data):
    pipeline = FeatureEngineeringPipeline()
    _, feat_names, _ = pipeline.transform(sample_cleaned_data)

    # Identifiers like raw account, customer, name, device, IP strings must NOT be in feat_names
    forbidden_features = [
        "transaction_id",
        "sender_account",
        "receiver_account",
        "sender_name",
        "receiver_name",
        "sender_customer_id",
        "receiver_customer_id",
        "ip_address",
        "device_id",
        "crypto_wallet",
    ]
    for forbidden in forbidden_features:
        assert forbidden not in feat_names


# 22. Source Dataset Immutability
def test_source_dataset_immutability(tmp_path, sample_cleaned_data):
    in_csv = tmp_path / "clean_source.csv"
    sample_cleaned_data.to_csv(in_csv, index=False)
    initial_hash = FeatureEngineeringPipeline.compute_file_hash(in_csv)

    pipeline = FeatureEngineeringPipeline()
    out_csv = tmp_path / "features_out.csv"
    res = pipeline.run(in_csv, out_csv)

    post_hash = FeatureEngineeringPipeline.compute_file_hash(in_csv)
    assert initial_hash == post_hash
    assert res.input_hash == post_hash


# 23. Near Regulatory Threshold Structuring Feature & Old Name Deprecation
def test_near_regulatory_threshold_feature(tmp_path):
    # Verify configuration constants
    assert REGULATORY_CTR_THRESHOLD_INR == 1_000_000.0
    assert NEAR_THRESHOLD_LOWER_RATIO == 0.90
    lower_bound = REGULATORY_CTR_THRESHOLD_INR * NEAR_THRESHOLD_LOWER_RATIO
    assert lower_bound == 900_000.0

    # Build controlled dataset to test:
    # - Exclusive upper bound (< 1,000,000)
    # - Inclusive lower bound (>= 900,000)
    # - 24-hour window limit
    # - Current transaction exclusion
    test_data = pd.DataFrame([
        # Tx 0: 10:00:00 - Amount 950,000 (IN range). 1st txn -> count must be 0
        {
            "transaction_id": "TX-CTR-01",
            "timestamp": "2026-10-01T10:00:00.000Z",
            "sender_account": "ACC-STRUCT",
            "sender_name": "Test Struct",
            "sender_customer_id": "CUST-S1",
            "receiver_account": "ACC-R1",
            "receiver_name": "Receiver 1",
            "receiver_customer_id": "CUST-R1",
            "amount": 950_000.0,
            "currency": "INR",
            "channel": "IMPS",
            "ip_address": "10.0.0.1",
            "device_id": "DEV-S",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 10,
            "transaction_weekday": 3,
        },
        # Tx 1: 12:00:00 (2h later) - Amount 1,000,000 (EXACT threshold -> NOT in range because upper bound is exclusive).
        # Sees Tx 0 (1 prior near-threshold txn in 24h)
        {
            "transaction_id": "TX-CTR-02",
            "timestamp": "2026-10-01T12:00:00.000Z",
            "sender_account": "ACC-STRUCT",
            "sender_name": "Test Struct",
            "sender_customer_id": "CUST-S1",
            "receiver_account": "ACC-R2",
            "receiver_name": "Receiver 2",
            "receiver_customer_id": "CUST-R2",
            "amount": 1_000_000.0,
            "currency": "INR",
            "channel": "RTGS",
            "ip_address": "10.0.0.1",
            "device_id": "DEV-S",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 12,
            "transaction_weekday": 3,
        },
        # Tx 2: 14:00:00 (4h later) - Amount 899,999 (Below lower ratio -> NOT in range).
        # Sees Tx 0 (in range) and Tx 1 (at 1M, out of range) -> count = 1
        {
            "transaction_id": "TX-CTR-03",
            "timestamp": "2026-10-01T14:00:00.000Z",
            "sender_account": "ACC-STRUCT",
            "sender_name": "Test Struct",
            "sender_customer_id": "CUST-S1",
            "receiver_account": "ACC-R3",
            "receiver_name": "Receiver 3",
            "receiver_customer_id": "CUST-R3",
            "amount": 899_999.0,
            "currency": "INR",
            "channel": "NEFT",
            "ip_address": "10.0.0.1",
            "device_id": "DEV-S",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 14,
            "transaction_weekday": 3,
        },
        # Tx 3: 16:00:00 (6h later) - Amount 900,000 (EXACT lower bound -> IN range).
        # Sees Tx 0 (in range), Tx 1 (out), Tx 2 (out) -> count = 1
        {
            "transaction_id": "TX-CTR-04",
            "timestamp": "2026-10-01T16:00:00.000Z",
            "sender_account": "ACC-STRUCT",
            "sender_name": "Test Struct",
            "sender_customer_id": "CUST-S1",
            "receiver_account": "ACC-R4",
            "receiver_name": "Receiver 4",
            "receiver_customer_id": "CUST-R4",
            "amount": 900_000.0,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "10.0.0.1",
            "device_id": "DEV-S",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-01",
            "transaction_hour": 16,
            "transaction_weekday": 3,
        },
        # Tx 4: 2026-10-02T11:00:00 (25h after Tx 0) - Amount 10,000.
        # Tx 0 occurred 25h ago (> 24h) -> EXCLUDED by rolling window!
        # Tx 3 occurred 19h ago (<= 24h) -> INCLUDED (count = 1 from Tx 3).
        {
            "transaction_id": "TX-CTR-05",
            "timestamp": "2026-10-02T11:00:00.000Z",
            "sender_account": "ACC-STRUCT",
            "sender_name": "Test Struct",
            "sender_customer_id": "CUST-S1",
            "receiver_account": "ACC-R5",
            "receiver_name": "Receiver 5",
            "receiver_customer_id": "CUST-R5",
            "amount": 10_000.0,
            "currency": "INR",
            "channel": "UPI",
            "ip_address": "10.0.0.1",
            "device_id": "DEV-S",
            "location_country": "India",
            "location_city": "Mumbai",
            "is_crypto": False,
            "crypto_wallet": np.nan,
            "transaction_date": "2026-10-02",
            "transaction_hour": 11,
            "transaction_weekday": 4,
        },
    ])

    pipeline = FeatureEngineeringPipeline()
    final_df, feat_names, _ = pipeline.transform(test_data)

    # 1. Feature exists under new name
    assert "sender_near_regulatory_threshold_txns_prev_24h" in feat_names
    # 2. Old feature name no longer appears
    assert "sender_structuring_range_txns_prev_24h" not in feat_names

    # Feature definitions check
    defs_path = tmp_path / "test_defs.json"
    defs = pipeline.generate_feature_definitions(feat_names, defs_path)
    def_map = {d["feature_name"]: d for d in defs}
    assert "sender_near_regulatory_threshold_txns_prev_24h" in def_map
    assert "sender_structuring_range_txns_prev_24h" not in def_map
    assert "REGULATORY_CTR_THRESHOLD_INR" in def_map["sender_near_regulatory_threshold_txns_prev_24h"]["description"]

    # 3. Tx 0: Current transaction is excluded -> count is 0
    assert final_df.loc[0, "sender_near_regulatory_threshold_txns_prev_24h"] == 0
    # 4. Tx 1: Sees Tx 0 (950k in range) -> count is 1
    assert final_df.loc[1, "sender_near_regulatory_threshold_txns_prev_24h"] == 1
    # 5. Tx 2: Sees Tx 0 (in) and Tx 1 (1M is exclusive -> out) -> count is 1
    assert final_df.loc[2, "sender_near_regulatory_threshold_txns_prev_24h"] == 1
    # 6. Tx 3: Sees Tx 0 (in), Tx 1 (out), Tx 2 (899k is out) -> count is 1
    assert final_df.loc[3, "sender_near_regulatory_threshold_txns_prev_24h"] == 1
    # 7. Tx 4: Tx 0 fell out of 24h window; Tx 3 (900k) is within 24h -> count is 1
    assert final_df.loc[4, "sender_near_regulatory_threshold_txns_prev_24h"] == 1

