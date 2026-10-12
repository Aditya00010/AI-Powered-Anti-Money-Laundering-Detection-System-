"""
Project Vigilance - Phase 5 Step 1: Isolated AML Inference Engine Test Suite
============================================================================
Test Module: tests/test_inference.py

Comprehensive tests verifying:
1. Model and metadata loading with SHA-256 verification.
2. Feature schema and ordering enforcement.
3. Missing feature rejection (no silent imputation).
4. Extra/unexpected feature and raw identifier rejection.
5. Duplicate column rejection.
6. NaN and infinite value rejection.
7. XGBoost probability and score generation.
8. Isolation Forest raw score generation.
9. Piecewise linear IF normalization boundaries (<0.35, 0.35, 0.50, 0.70, >0.70).
10. Final risk-score calculation with 80/20 baseline weights.
11. Operational risk tier boundaries (30, >30, 60, >60, 80, >80).
12. Deterministic repeated inference.
13. Complete end-to-end reproduction of the approved 30k OOT evaluation reference results.
"""

import sys
import json
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

# Add ml-service to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.inference import (
    AMLInferenceEngine,
    TransactionRiskResult,
    normalize_isolation_forest_score,
    calculate_final_risk_score,
    assign_risk_tier,
    RAW_IDENTIFIER_COLUMNS,
    InferenceError,
    ModelArtifactError,
    SchemaValidationError,
    MissingFeaturesError,
    UnexpectedFeaturesError,
    DuplicateFeaturesError,
    FeatureOrderError,
    InvalidFeatureValueError,
)

FEATURES_CSV = PROJECT_ROOT / "data" / "processed" / "aml_150k_graph_features.csv"
GROUND_TRUTH_CSV = PROJECT_ROOT / "data" / "training" / "aml_150k_v2_ground_truth.csv"
CONFIG_FILE = PROJECT_ROOT / "configs" / "risk_scoring_v1.json"


@pytest.fixture(scope="module")
def inference_engine():
    """Initializes and caches the AMLInferenceEngine instance."""
    return AMLInferenceEngine(config_path=CONFIG_FILE)


@pytest.fixture(scope="module")
def oot_30k_data(inference_engine):
    """Loads the untouched 30k out-of-time evaluation slice."""
    df_features = pd.read_csv(FEATURES_CSV)
    df_gt = pd.read_csv(GROUND_TRUTH_CSV)
    assert len(df_features) == 150000
    assert len(df_gt) == 150000

    df_eval = df_features.iloc[120000:].copy()
    assert len(df_eval) == 30000

    eval_aligned = df_eval[["transaction_id"]].merge(df_gt, on="transaction_id", how="left")
    y_eval = eval_aligned["ground_truth"].values.astype(int)

    # Prepare DataFrame with transaction_id followed by 84 features
    eval_input = df_eval[["transaction_id"] + inference_engine.xgb_features].copy()
    return eval_input, y_eval


@pytest.fixture
def sample_valid_features(inference_engine):
    """Provides a small synthetic valid DataFrame with all 84 features."""
    rng = np.random.RandomState(42)
    data = {feat: rng.uniform(0.0, 10.0, size=5) for feat in inference_engine.xgb_features}
    df = pd.DataFrame(data)
    df["transaction_id"] = [f"TX_TEST_{i:04d}" for i in range(5)]
    # Put transaction_id first
    cols = ["transaction_id"] + inference_engine.xgb_features
    return df[cols]


# ============================================================================
# 1. MODEL LOADING TESTS
# ============================================================================

def test_model_loading(inference_engine):
    """Verifies safe loading of approved XGBoost and Isolation Forest artifacts."""
    assert inference_engine.xgb_model is not None
    assert inference_engine.if_model is not None
    assert len(inference_engine.xgb_features) == 84
    assert len(inference_engine.if_features) == 80
    assert inference_engine.w_xgb == 0.80
    assert inference_engine.w_if == 0.20

    # Ensure all 80 IF features are a subset of the 84 XGB features
    assert set(inference_engine.if_features).issubset(set(inference_engine.xgb_features))


def test_model_loading_missing_config_fails():
    """Verifies that ModelArtifactError is raised when the configuration file is missing."""
    with pytest.raises(ModelArtifactError):
        AMLInferenceEngine(config_path=Path("non_existent_config.json"))


# ============================================================================
# 2. FEATURE SCHEMA VALIDATION TESTS
# ============================================================================

def test_feature_schema_validation(inference_engine, sample_valid_features):
    """Verifies schema validation succeeds with and without transaction_id."""
    # With transaction_id
    X, tx_ids = inference_engine.validate_features(
        sample_valid_features, inference_engine.xgb_features
    )
    assert X.shape == (5, 84)
    assert tx_ids is not None
    assert len(tx_ids) == 5
    assert list(X.columns) == inference_engine.xgb_features

    # Without transaction_id
    sample_no_id = sample_valid_features[inference_engine.xgb_features]
    X_no_id, tx_ids_none = inference_engine.validate_features(
        sample_no_id, inference_engine.xgb_features
    )
    assert X_no_id.shape == (5, 84)
    assert tx_ids_none is None
    assert list(X_no_id.columns) == inference_engine.xgb_features


# ============================================================================
# 3. MISSING FEATURE REJECTION TESTS
# ============================================================================

def test_missing_single_feature_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when a single feature is missing."""
    corrupted_df = sample_valid_features.drop(columns=["amount"])
    with pytest.raises(MissingFeaturesError) as exc_info:
        inference_engine.validate_features(corrupted_df, inference_engine.xgb_features)
    assert "amount" in str(exc_info.value)


def test_missing_multiple_features_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when multiple features are missing, naming all missing."""
    corrupted_df = sample_valid_features.drop(
        columns=["amount", "log_amount", "sender_pagerank_score"]
    )
    with pytest.raises(MissingFeaturesError) as exc_info:
        inference_engine.validate_features(corrupted_df, inference_engine.xgb_features)
    assert "amount" in str(exc_info.value)
    assert "log_amount" in str(exc_info.value)
    assert "sender_pagerank_score" in str(exc_info.value)


# ============================================================================
# 4. EXTRA / UNEXPECTED FEATURE & RAW IDENTIFIER REJECTION TESTS
# ============================================================================

def test_extra_unexpected_feature_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when arbitrary unexpected columns are present."""
    corrupted_df = sample_valid_features.copy()
    corrupted_df["unexpected_feature_column"] = 1.23
    with pytest.raises(UnexpectedFeaturesError) as exc_info:
        inference_engine.validate_features(corrupted_df, inference_engine.xgb_features)
    assert "unexpected_feature_column" in str(exc_info.value)


def test_raw_identifier_rejection(inference_engine, sample_valid_features):
    """Verifies strict rejection of raw identifiers in the feature matrix."""
    for raw_id in ["sender_account", "ip_address", "device_id", "timestamp"]:
        corrupted_df = sample_valid_features.copy()
        corrupted_df[raw_id] = "dummy_identifier_value"
        with pytest.raises(UnexpectedFeaturesError) as exc_info:
            inference_engine.validate_features(corrupted_df, inference_engine.xgb_features)
        assert raw_id in str(exc_info.value)


def test_duplicate_feature_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when duplicate column names exist."""
    # Create DataFrame with duplicated 'amount' column
    df_dup = pd.concat([sample_valid_features, sample_valid_features[["amount"]]], axis=1)
    with pytest.raises(DuplicateFeaturesError):
        inference_engine.validate_features(df_dup, inference_engine.xgb_features)


def test_feature_order_mismatch_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when features are valid but out of order."""
    cols = list(sample_valid_features.columns)
    # Swap amount and log_amount
    idx1 = cols.index("amount")
    idx2 = cols.index("log_amount")
    cols[idx1], cols[idx2] = cols[idx2], cols[idx1]
    reordered_df = sample_valid_features[cols]

    with pytest.raises(FeatureOrderError) as exc_info:
        inference_engine.validate_features(reordered_df, inference_engine.xgb_features)
    assert "ordering mismatch" in str(exc_info.value).lower()


# ============================================================================
# 5. NAN / INF REJECTION TESTS
# ============================================================================

def test_nan_value_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when NaN values are present."""
    nan_df = sample_valid_features.copy()
    nan_df.loc[0, "amount"] = np.nan
    with pytest.raises(InvalidFeatureValueError) as exc_info:
        inference_engine.validate_features(nan_df, inference_engine.xgb_features)
    assert "NaN values" in str(exc_info.value)
    assert "amount" in str(exc_info.value)


def test_infinite_value_rejection(inference_engine, sample_valid_features):
    """Verifies rejection when positive or negative infinite values are present."""
    pos_inf_df = sample_valid_features.copy()
    pos_inf_df.loc[1, "log_amount"] = np.inf
    with pytest.raises(InvalidFeatureValueError) as exc_info:
        inference_engine.validate_features(pos_inf_df, inference_engine.xgb_features)
    assert "infinite values" in str(exc_info.value)

    neg_inf_df = sample_valid_features.copy()
    neg_inf_df.loc[2, "amount"] = -np.inf
    with pytest.raises(InvalidFeatureValueError) as exc_info:
        inference_engine.validate_features(neg_inf_df, inference_engine.xgb_features)
    assert "infinite values" in str(exc_info.value)


# ============================================================================
# 6. XGBOOST PROBABILITY GENERATION TESTS
# ============================================================================

def test_xgb_probability_generation(inference_engine, sample_valid_features):
    """Verifies XGBoost probability and calibrated score generation."""
    probs, scores = inference_engine.predict_xgboost_batch(sample_valid_features)
    assert isinstance(probs, np.ndarray)
    assert isinstance(scores, np.ndarray)
    assert len(probs) == len(sample_valid_features)
    assert np.all(probs >= 0.0) and np.all(probs <= 1.0)
    np.testing.assert_allclose(scores, probs * 100.0)


# ============================================================================
# 7. ISOLATION FOREST RAW SCORE GENERATION TESTS
# ============================================================================

def test_isolation_forest_raw_score_generation(inference_engine, sample_valid_features):
    """Verifies Isolation Forest raw score and normalized score generation."""
    raw_scores, norm_scores = inference_engine.predict_isolation_forest_batch(
        sample_valid_features
    )
    assert isinstance(raw_scores, np.ndarray)
    assert isinstance(norm_scores, np.ndarray)
    assert len(raw_scores) == len(sample_valid_features)
    assert np.all(norm_scores >= 0.0) and np.all(norm_scores <= 100.0)


# ============================================================================
# 8. IF NORMALIZATION BOUNDARY TESTS
# ============================================================================

def test_if_normalization_boundaries():
    """
    Verifies Isolation Forest piecewise linear normalization against all boundary conditions:
    - below 0.35: clipped to 0.0
    - exactly 0.35: 0.0
    - between 0.35 and 0.50: linear scaling into [0, 50]
    - exactly 0.50: 50.0
    - between 0.50 and 0.70: linear scaling into [50, 100]
    - exactly 0.70: 100.0
    - above 0.70: clipped to 100.0
    """
    # 1. Below 0.35
    assert normalize_isolation_forest_score(0.20) == 0.0
    assert normalize_isolation_forest_score(0.3499) == 0.0

    # 2. Exactly 0.35
    assert normalize_isolation_forest_score(0.35) == 0.0

    # 3. Between 0.35 and 0.50
    # midpoint = 0.425 -> ((0.425 - 0.35) / 0.15) * 50 = (0.075 / 0.15) * 50 = 25.0
    assert normalize_isolation_forest_score(0.425) == pytest.approx(25.0)

    # 4. Exactly 0.50
    assert normalize_isolation_forest_score(0.50) == 50.0

    # 5. Between 0.50 and 0.70
    # midpoint = 0.60 -> 50 + ((0.60 - 0.50) / 0.20) * 50 = 50 + (0.10 / 0.20) * 50 = 75.0
    assert normalize_isolation_forest_score(0.60) == pytest.approx(75.0)

    # 6. Exactly 0.70
    assert normalize_isolation_forest_score(0.70) == 100.0

    # 7. Above 0.70
    assert normalize_isolation_forest_score(0.7001) == 100.0
    assert normalize_isolation_forest_score(0.85) == 100.0

    # 8. Array vectorized inputs
    raw_inputs = np.array([0.20, 0.35, 0.425, 0.50, 0.60, 0.70, 0.85])
    expected = np.array([0.0, 0.0, 25.0, 50.0, 75.0, 100.0, 100.0])
    np.testing.assert_allclose(normalize_isolation_forest_score(raw_inputs), expected)


# ============================================================================
# 9. FINAL RISK SCORE CALCULATION TESTS
# ============================================================================

def test_final_risk_score_calculation():
    """Verifies linear weighted combination with clipping to [0, 100]."""
    # Equal extremes
    assert calculate_final_risk_score(100.0, 100.0) == 100.0
    assert calculate_final_risk_score(0.0, 0.0) == 0.0

    # Midpoints
    assert calculate_final_risk_score(50.0, 50.0) == 50.0

    # 80/20 weighted calculation
    # 0.80 * 80.0 + 0.20 * 20.0 = 64.0 + 4.0 = 68.0
    assert calculate_final_risk_score(80.0, 20.0) == pytest.approx(68.0)

    # Clipping guards
    assert calculate_final_risk_score(120.0, 100.0) == 100.0
    assert calculate_final_risk_score(-10.0, 0.0) == 0.0

    # Array vectorized
    xgb_arr = np.array([0.0, 50.0, 80.0, 100.0])
    if_arr = np.array([0.0, 50.0, 20.0, 100.0])
    expected = np.array([0.0, 50.0, 68.0, 100.0])
    np.testing.assert_allclose(calculate_final_risk_score(xgb_arr, if_arr), expected)


# ============================================================================
# 10. RISK TIER BOUNDARY TESTS
# ============================================================================

def test_risk_tier_boundaries():
    """
    Verifies operational risk tier assignment at exact boundary thresholds:
    - 0.0 -> LOW
    - 30.0 -> LOW
    - >30.0 (30.0001, 30.01) -> MEDIUM
    - 60.0 -> MEDIUM
    - >60.0 (60.0001, 60.01) -> HIGH
    - 80.0 -> HIGH
    - >80.0 (80.0001, 80.01) -> CRITICAL
    - 100.0 -> CRITICAL
    """
    # Scalar tests
    assert assign_risk_tier(0.0) == "LOW"
    assert assign_risk_tier(30.0) == "LOW"
    assert assign_risk_tier(30.0001) == "MEDIUM"
    assert assign_risk_tier(30.01) == "MEDIUM"
    assert assign_risk_tier(60.0) == "MEDIUM"
    assert assign_risk_tier(60.0001) == "HIGH"
    assert assign_risk_tier(60.01) == "HIGH"
    assert assign_risk_tier(80.0) == "HIGH"
    assert assign_risk_tier(80.0001) == "CRITICAL"
    assert assign_risk_tier(80.01) == "CRITICAL"
    assert assign_risk_tier(100.0) == "CRITICAL"

    # Array vectorized tests
    scores = np.array([30.0, 30.0001, 60.0, 60.0001, 80.0, 80.0001])
    expected = np.array(["LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "CRITICAL"])
    np.testing.assert_array_equal(assign_risk_tier(scores), expected)


# ============================================================================
# 11. DETERMINISTIC REPEATED INFERENCE TESTS
# ============================================================================

def test_deterministic_repeated_inference(inference_engine, sample_valid_features):
    """Verifies that running inference multiple times on the same input produces identical results."""
    res1 = inference_engine.predict_batch(sample_valid_features)
    res2 = inference_engine.predict_batch(sample_valid_features)

    # Strict numerical identity
    np.testing.assert_allclose(res1["xgb_probability"], res2["xgb_probability"], atol=0.0)
    np.testing.assert_allclose(res1["xgb_score"], res2["xgb_score"], atol=0.0)
    np.testing.assert_allclose(
        res1["isolation_forest_raw_score"], res2["isolation_forest_raw_score"], atol=0.0
    )
    np.testing.assert_allclose(
        res1["isolation_forest_score"], res2["isolation_forest_score"], atol=0.0
    )
    np.testing.assert_allclose(res1["final_risk_score"], res2["final_risk_score"], atol=0.0)
    assert (res1["risk_tier"] == res2["risk_tier"]).all()
    assert (res1["transaction_id"] == res2["transaction_id"]).all()

    # Single-transaction deterministic test
    rec = sample_valid_features.iloc[0].to_dict()
    tx_res1 = inference_engine.predict_transaction(rec)
    tx_res2 = inference_engine.predict_transaction(rec)
    assert tx_res1.to_dict() == tx_res2.to_dict()


# ============================================================================
# 12. END-TO-END VALIDATION AGAINST APPROVED 30K OOT REFERENCE RESULTS
# ============================================================================

def test_oot_30k_evaluation_reproduction(inference_engine, oot_30k_data):
    """
    End-to-end validation: Runs the isolated inference engine over the complete 30,000-row
    chronological OOT evaluation set and asserts exact reproduction of all approved Phase 4 reference values.
    """
    eval_input, y_eval = oot_30k_data
    total_txns = len(eval_input)
    assert total_txns == 30000

    results = inference_engine.predict_batch(eval_input)
    assert len(results) == 30000

    # 1. Score Distribution Reference Values
    # Min: 1.47, Mean: 15.05, Median: 9.68, Max: 99.92, Std: 19.06
    final_scores = results["final_risk_score"].values
    assert final_scores.min() == pytest.approx(1.47, abs=0.01)
    assert final_scores.mean() == pytest.approx(15.05, abs=0.01)
    assert np.median(final_scores) == pytest.approx(9.68, abs=0.01)
    assert final_scores.max() == pytest.approx(99.92, abs=0.01)
    assert final_scores.std() == pytest.approx(19.06, abs=0.01)

    # 2. Operational Risk Tier Counts & Percentages
    # LOW: 27,666 (92.22%)
    # MEDIUM: 682 (2.27%)
    # HIGH: 198 (0.66%)
    # CRITICAL: 1,454 (4.85%)
    # HIGH + CRITICAL: 1,652 (5.51%)
    tier_counts = results["risk_tier"].value_counts().to_dict()
    assert tier_counts.get("LOW", 0) == 27666
    assert tier_counts.get("MEDIUM", 0) == 682
    assert tier_counts.get("HIGH", 0) == 198
    assert tier_counts.get("CRITICAL", 0) == 1454
    assert tier_counts["HIGH"] + tier_counts["CRITICAL"] == 1652

    # 3. Ground-Truth AML Alignment & Historical Prevalences
    # CRITICAL: 1,452 AML, 2 false positives (99.86% precision, 47.01% recall)
    # HIGH + CRITICAL: 1,632 AML, 20 false positives (98.79% precision, 52.83% recall)
    crit_mask = results["risk_tier"] == "CRITICAL"
    crit_aml = int(y_eval[crit_mask].sum())
    crit_fp = int((y_eval[crit_mask] == 0).sum())
    assert crit_aml == 1452
    assert crit_fp == 2

    high_crit_mask = results["risk_tier"].isin(["HIGH", "CRITICAL"])
    high_crit_aml = int(y_eval[high_crit_mask].sum())
    high_crit_fp = int((y_eval[high_crit_mask] == 0).sum())
    assert high_crit_aml == 1632
    assert high_crit_fp == 20

    # Prevalences: LOW=4.23%, MEDIUM=42.08%, HIGH=90.91%, CRITICAL=99.86%
    low_prev = (y_eval[results["risk_tier"] == "LOW"].sum() / 27666) * 100.0
    med_prev = (y_eval[results["risk_tier"] == "MEDIUM"].sum() / 682) * 100.0
    high_prev = (y_eval[results["risk_tier"] == "HIGH"].sum() / 198) * 100.0
    crit_prev = (crit_aml / 1454) * 100.0

    assert low_prev == pytest.approx(4.23, abs=0.01)
    assert med_prev == pytest.approx(42.08, abs=0.01)
    assert high_prev == pytest.approx(90.91, abs=0.01)
    assert crit_prev == pytest.approx(99.86, abs=0.01)

    # Monotonicity check
    assert low_prev < med_prev < high_prev < crit_prev

    # 4. Consensus Behavior Reference Values
    # Both: 1,133, mean ≈ 91.90
    # XGB-only: 657, mean ≈ 75.83
    # IF-only: 2,171, mean ≈ 16.96
    # Neither: 26,039, mean ≈ 10.01
    xgb_flags = results["xgb_probability"].values >= 0.50
    if_flags = results["isolation_forest_raw_score"].values >= 0.50

    both_mask = xgb_flags & if_flags
    xgb_only_mask = xgb_flags & (~if_flags)
    if_only_mask = (~xgb_flags) & if_flags
    neither_mask = (~xgb_flags) & (~if_flags)

    assert int(both_mask.sum()) == 1133
    assert results.loc[both_mask, "final_risk_score"].mean() == pytest.approx(91.90, abs=0.05)

    assert int(xgb_only_mask.sum()) == 657
    assert results.loc[xgb_only_mask, "final_risk_score"].mean() == pytest.approx(75.83, abs=0.05)

    assert int(if_only_mask.sum()) == 2171
    assert results.loc[if_only_mask, "final_risk_score"].mean() == pytest.approx(16.96, abs=0.05)

    assert int(neither_mask.sum()) == 26039
    assert results.loc[neither_mask, "final_risk_score"].mean() == pytest.approx(10.01, abs=0.05)
