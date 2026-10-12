"""
Project Vigilance - Phase 5 Step 1: Isolated AML Risk Inference Engine
======================================================================
Module: app.inference.engine

Purpose:
Applies the approved Phase 4 risk-scoring design to generate standardized
AML risk scores and operational risk tiers from precomputed feature matrices.

Design Guarantees:
1. Strict Schema & Order Enforcement:
   - XGBoost requires exactly 84 engineered features in exact trained order.
   - Isolation Forest requires exactly 80 continuous/topological features in exact trained order.
   - Rejects missing, unexpected, duplicated, reordered, NaN, or infinite features.
   - Raw identifiers (except optional transaction_id) are strictly forbidden.
2. Normalization Anchoring:
   - XGB_SCORE = xgb_probability * 100.0.
   - IF_SCORE = piecewise linear mapping anchored at theoretical decision boundary (0.50 -> 50.0),
     inlier baseline (0.35 -> 0.0), and outlier ceiling (0.70 -> 100.0).
3. Approved Baseline Weighting:
   - FINAL_RISK_SCORE = 0.80 * XGB_SCORE + 0.20 * IF_SCORE (clipped to [0, 100]).
4. Operational Prioritization Tiers:
   - LOW (0–30), MEDIUM (>30–60), HIGH (>60–80), CRITICAL (>80–100).
   - Tiers represent operational prioritization queues, NOT guaranteed AML probabilities.
   - Final SAR disposition is subject to compliance investigator review.
5. Temporal Disclosure:
   - Topological graph features were generated over the complete static 150k-transaction network.
   - Valid for retrospective analysis, offline investigations, and batch audits.
   - Not claimed as point-in-time causal streaming backtesting.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd

from .exceptions import (
    ModelArtifactError,
    MissingFeaturesError,
    UnexpectedFeaturesError,
    DuplicateFeaturesError,
    FeatureOrderError,
    InvalidFeatureValueError,
)
from .schema import TransactionRiskResult


# Raw metadata and identifier columns that must NEVER be passed into models
RAW_IDENTIFIER_COLUMNS: List[str] = [
    "timestamp",
    "sender_account",
    "sender_name",
    "sender_customer_id",
    "receiver_account",
    "receiver_name",
    "receiver_customer_id",
    "ip_address",
    "device_id",
    "crypto_wallet",
    "location_country",
    "location_city",
    "transaction_date",
]


def normalize_isolation_forest_score(
    raw_score: Union[float, np.ndarray]
) -> Union[float, np.ndarray]:
    """
    Normalizes raw Isolation Forest anomaly score s(x) = -score_samples(x)
    to a standardized [0.0, 100.0] scale using the approved operational anchors:
    - 0.50: Theoretical/implementation boundary (offset_ = -0.50) -> mapped to 50.0.
    - 0.35: Fixed operational anchor (empirical inlier floor) -> mapped to 0.0.
    - 0.70: Fixed operational anchor (empirical outlier ceiling) -> mapped to 100.0.

    Args:
        raw_score: Scalar float or NumPy array of raw anomaly scores.

    Returns:
        Normalized score(s) bounded in [0.0, 100.0].
    """
    raw = np.asarray(raw_score, dtype=float)
    is_scalar = raw.ndim == 0
    raw_arr = np.atleast_1d(raw)

    res = np.zeros_like(raw_arr, dtype=float)
    mask_low = raw_arr < 0.50

    # Inliers (s < 0.50): linearly scaled into [0, 50]
    res[mask_low] = np.clip(
        ((raw_arr[mask_low] - 0.35) / (0.50 - 0.35)) * 50.0, 0.0, 50.0
    )
    # Outliers (s >= 0.50): linearly scaled into [50, 100]
    res[~mask_low] = np.clip(
        50.0 + ((raw_arr[~mask_low] - 0.50) / (0.70 - 0.50)) * 50.0, 50.0, 100.0
    )

    if is_scalar:
        return float(res[0])
    return res


def calculate_final_risk_score(
    xgb_score: Union[float, np.ndarray],
    if_score: Union[float, np.ndarray],
    w_xgb: float = 0.80,
    w_if: float = 0.20,
) -> Union[float, np.ndarray]:
    """
    Calculates final AML risk score from normalized component scores:
    FINAL_RISK_SCORE = w_xgb * XGB_SCORE + w_if * IF_SCORE (clipped to [0, 100]).

    Args:
        xgb_score: Supervised score in [0.0, 100.0].
        if_score: Normalized anomaly score in [0.0, 100.0].
        w_xgb: Supervised weight (default 0.80).
        w_if: Unsupervised anomaly weight (default 0.20).

    Returns:
        Final combined score in [0.0, 100.0].
    """
    xgb_arr = np.asarray(xgb_score, dtype=float)
    if_arr = np.asarray(if_score, dtype=float)
    is_scalar = xgb_arr.ndim == 0 and if_arr.ndim == 0

    score = np.clip(w_xgb * xgb_arr + w_if * if_arr, 0.0, 100.0)
    if is_scalar:
        return float(score)
    return score


def assign_risk_tier(score: Union[float, np.ndarray]) -> Union[str, np.ndarray]:
    """
    Assigns operational risk prioritization tier based on score:
    - LOW: [0.00, 30.00]
    - MEDIUM: (30.00, 60.00]
    - HIGH: (60.00, 80.00]
    - CRITICAL: (80.00, 100.00]

    Args:
        score: Single float or NumPy array of risk scores in [0.0, 100.0].

    Returns:
        Tier string or NumPy array of tier strings.
    """
    s = np.asarray(score, dtype=float)
    if s.ndim == 0:
        val = float(s)
        if val <= 30.0:
            return "LOW"
        elif val <= 60.0:
            return "MEDIUM"
        elif val <= 80.0:
            return "HIGH"
        else:
            return "CRITICAL"

    tiers = np.empty(s.shape, dtype=object)
    tiers[s <= 30.0] = "LOW"
    tiers[(s > 30.0) & (s <= 60.0)] = "MEDIUM"
    tiers[(s > 60.0) & (s <= 80.0)] = "HIGH"
    tiers[s > 80.0] = "CRITICAL"
    return tiers


class AMLInferenceEngine:
    """
    Isolated production inference engine for AML risk scoring.

    Loads the approved XGBoost supervised model and Isolation Forest anomaly detector,
    validates incoming transaction features strictly against trained metadata schemas,
    and produces deterministic risk scores, probabilities, and operational prioritization tiers.
    """

    def __init__(
        self,
        config_path: Optional[Union[Path, str]] = None,
        model_dir: Optional[Union[Path, str]] = None,
        verify_hashes: bool = True,
    ):
        """
        Initializes the inference engine, loads configuration and models.

        Args:
            config_path: Optional path to risk_scoring_v1.json.
            model_dir: Optional path to models directory.
            verify_hashes: Whether to verify SHA-256 hashes of model binaries.
        """
        # Resolve project root
        # File location: ml-service/app/inference/engine.py
        # Root is 4 parents up: Project codebase
        self.project_root = Path(__file__).resolve().parent.parent.parent.parent

        if config_path is not None:
            self.config_path = Path(config_path)
        else:
            self.config_path = self.project_root / "configs" / "risk_scoring_v1.json"

        if model_dir is not None:
            self.model_dir = Path(model_dir)
        else:
            self.model_dir = self.project_root / "models"

        self.verify_hashes = verify_hashes

        # State attributes
        self.config: Dict[str, Any] = {}
        self.xgb_model: Any = None
        self.if_model: Any = None
        self.xgb_features: List[str] = []
        self.if_features: List[str] = []
        self.w_xgb: float = 0.80
        self.w_if: float = 0.20

        self._load_artifacts()

    @staticmethod
    def _compute_sha256(filepath: Path) -> str:
        """Computes SHA-256 hash of a file."""
        sha = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha.update(chunk)
        return sha.hexdigest()

    def _load_artifacts(self) -> None:
        """Loads configuration, models, and feature metadata with security checks."""
        if not self.config_path.exists():
            raise ModelArtifactError(
                f"Risk scoring configuration file not found: {self.config_path}"
            )

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        except Exception as e:
            raise ModelArtifactError(
                f"Failed to parse risk scoring configuration: {e}"
            ) from e

        # Extract weights
        components = self.config.get("components", {})
        self.w_xgb = float(components.get("xgb_score", {}).get("weight", 0.80))
        self.w_if = float(components.get("if_score", {}).get("weight", 0.20))

        # Model file paths
        xgb_rel = components.get("xgb_score", {}).get("source_model", "models/xgboost_v3_graph.joblib")
        if_rel = components.get("if_score", {}).get("source_model", "models/isolation_forest_v3_graph.joblib")

        xgb_model_path = self.project_root / xgb_rel
        if_model_path = self.project_root / if_rel

        if not xgb_model_path.exists():
            raise ModelArtifactError(f"XGBoost model file not found: {xgb_model_path}")
        if not if_model_path.exists():
            raise ModelArtifactError(f"Isolation Forest model file not found: {if_model_path}")

        # Metadata file paths
        xgb_meta_path = self.model_dir / "xgboost_v3_graph_metadata.json"
        if_meta_path = self.model_dir / "isolation_forest_v3_graph_metadata.json"

        if not xgb_meta_path.exists():
            raise ModelArtifactError(f"XGBoost metadata file not found: {xgb_meta_path}")
        if not if_meta_path.exists():
            raise ModelArtifactError(f"Isolation Forest metadata file not found: {if_meta_path}")

        with open(xgb_meta_path, "r", encoding="utf-8") as f:
            xgb_meta = json.load(f)
        with open(if_meta_path, "r", encoding="utf-8") as f:
            if_meta = json.load(f)

        self.xgb_features = list(xgb_meta.get("features", []))
        self.if_features = list(if_meta.get("approved_features", []))

        if len(self.xgb_features) != 84:
            raise ModelArtifactError(
                f"Expected 84 features for XGBoost, got {len(self.xgb_features)}"
            )
        if len(self.if_features) != 80:
            raise ModelArtifactError(
                f"Expected 80 features for Isolation Forest, got {len(self.if_features)}"
            )

        # Hash verification
        if self.verify_hashes:
            expected_xgb_hash = components.get("xgb_score", {}).get(
                "model_sha256", xgb_meta.get("model_sha256")
            )
            expected_if_hash = components.get("if_score", {}).get(
                "model_sha256", if_meta.get("model_sha256")
            )

            actual_xgb_hash = self._compute_sha256(xgb_model_path)
            actual_if_hash = self._compute_sha256(if_model_path)

            if expected_xgb_hash and actual_xgb_hash != expected_xgb_hash:
                raise ModelArtifactError(
                    f"XGBoost model SHA-256 mismatch! Expected {expected_xgb_hash}, got {actual_xgb_hash}"
                )
            if expected_if_hash and actual_if_hash != expected_if_hash:
                raise ModelArtifactError(
                    f"Isolation Forest model SHA-256 mismatch! Expected {expected_if_hash}, got {actual_if_hash}"
                )

        # Load models
        try:
            self.xgb_model = joblib.load(xgb_model_path)
            self.if_model = joblib.load(if_model_path)
        except Exception as e:
            raise ModelArtifactError(f"Failed to deserialize model binaries: {e}") from e

    def validate_features(
        self,
        df: pd.DataFrame,
        expected_features: List[str],
        allow_transaction_id: bool = True,
    ) -> Tuple[pd.DataFrame, Optional[pd.Series]]:
        """
        Strictly validates input dataframe against expected feature schema and ordering.

        Checks performed:
        1. Duplicate column detection.
        2. Extraction of optional transaction_id.
        3. Prohibition of raw identifiers.
        4. Missing feature detection.
        5. Unexpected feature detection.
        6. Exact feature ordering match.
        7. NaN and infinite value detection.

        Args:
            df: Input pandas DataFrame.
            expected_features: Ordered list of approved feature names.
            allow_transaction_id: Whether transaction_id is allowed as metadata.

        Returns:
            Tuple of (clean_feature_df, transaction_ids_or_none).
        """
        # 1. Duplicate columns check
        if df.columns.duplicated().any():
            dup_cols = df.columns[df.columns.duplicated()].unique().tolist()
            raise DuplicateFeaturesError(
                f"Duplicate columns detected in input: {dup_cols}"
            )

        # 2. Extract transaction_id if present
        tx_ids = None
        cols_to_check = list(df.columns)
        if "transaction_id" in cols_to_check:
            if not allow_transaction_id:
                raise UnexpectedFeaturesError(
                    "transaction_id is not allowed in this validation context."
                )
            tx_ids = df["transaction_id"]
            cols_to_check = [c for c in cols_to_check if c != "transaction_id"]

        # 3. Check for raw identifiers
        raw_detected = [c for c in cols_to_check if c in RAW_IDENTIFIER_COLUMNS]
        if raw_detected:
            raise UnexpectedFeaturesError(
                f"Raw identifier(s) detected in input feature matrix: {raw_detected}. "
                "Raw identifiers must never be passed into model inference."
            )

        # 4. Check for missing features
        missing = [f for f in expected_features if f not in cols_to_check]
        if missing:
            raise MissingFeaturesError(
                f"Missing {len(missing)} required model feature(s): {missing}. "
                "Missing model features cannot be filled silently."
            )

        # 5. Check for unexpected features
        unexpected = [f for f in cols_to_check if f not in expected_features]
        if unexpected:
            raise UnexpectedFeaturesError(
                f"Unexpected feature(s) detected in input: {unexpected}. "
                "Only approved features are accepted."
            )

        # 6. Check feature ordering
        if cols_to_check != expected_features:
            # Report first misaligned index for clear debugging
            first_mismatch = next(
                (i for i, (a, b) in enumerate(zip(cols_to_check, expected_features)) if a != b),
                None,
            )
            raise FeatureOrderError(
                f"Feature ordering mismatch starting at column index {first_mismatch}: "
                f"expected '{expected_features[first_mismatch]}', got '{cols_to_check[first_mismatch]}'."
            )

        # 7. Extract clean feature matrix in expected order
        X = df[expected_features].copy()

        # 8. Check for NaN and infinite values
        if X.isna().any().any():
            nan_cols = X.columns[X.isna().any()].tolist()
            raise InvalidFeatureValueError(
                f"Input features contain NaN values in column(s): {nan_cols}."
            )

        values = X.to_numpy(dtype=float)
        if np.isneginf(values).any() or np.isposinf(values).any():
            inf_cols = X.columns[np.isinf(values).any(axis=0)].tolist()
            raise InvalidFeatureValueError(
                f"Input features contain infinite values in column(s): {inf_cols}."
            )

        return X, tx_ids

    def predict_xgboost_batch(
        self, df: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generates XGBoost supervised probabilities and calibrated scores.

        Args:
            df: DataFrame containing the 84 approved features (optionally transaction_id).

        Returns:
            Tuple of (xgb_probabilities, xgb_scores).
        """
        X_xgb, _ = self.validate_features(df, self.xgb_features)
        probs = self.xgb_model.predict_proba(X_xgb)[:, 1]
        scores = probs * 100.0
        return probs, scores

    def predict_isolation_forest_batch(
        self, df: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generates Isolation Forest raw anomaly scores and normalized scores.

        Accepts either:
        - 80 approved IF features, or
        - 84 approved XGB features (from which the 80 IF features are extracted).

        Args:
            df: DataFrame containing required features.

        Returns:
            Tuple of (raw_if_scores, normalized_if_scores).
        """
        # Check if input matches 80 IF features or 84 XGB features
        cols_wo_tx = [c for c in df.columns if c != "transaction_id"]
        if cols_wo_tx == self.if_features:
            X_if, _ = self.validate_features(df, self.if_features)
        elif cols_wo_tx == self.xgb_features:
            X_xgb, _ = self.validate_features(df, self.xgb_features)
            X_if = X_xgb[self.if_features]
        else:
            # Let validate_features raise appropriate error against if_features
            X_if, _ = self.validate_features(df, self.if_features)

        raw_scores = -self.if_model.score_samples(X_if)
        norm_scores = normalize_isolation_forest_score(raw_scores)
        return raw_scores, norm_scores

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Executes end-to-end inference on a batch of transactions.

        Args:
            df: Input DataFrame containing the 84 approved features,
                optionally with 'transaction_id'.

        Returns:
            DataFrame containing:
            - transaction_id (if available, else None)
            - xgb_probability
            - xgb_score
            - isolation_forest_raw_score
            - isolation_forest_score
            - final_risk_score
            - risk_tier
        """
        if df.empty:
            return pd.DataFrame(
                columns=[
                    "transaction_id",
                    "xgb_probability",
                    "xgb_score",
                    "isolation_forest_raw_score",
                    "isolation_forest_score",
                    "final_risk_score",
                    "risk_tier",
                ]
            )

        # Validate 84 features and extract transaction_id
        X_xgb, tx_ids = self.validate_features(df, self.xgb_features)

        # Subset exactly 80 continuous/topological features for Isolation Forest
        X_if = X_xgb[self.if_features]

        # 1. XGBoost inference
        xgb_probs = self.xgb_model.predict_proba(X_xgb)[:, 1]
        xgb_scores = xgb_probs * 100.0

        # 2. Isolation Forest inference
        if_raw_scores = -self.if_model.score_samples(X_if)
        if_scores = normalize_isolation_forest_score(if_raw_scores)

        # 3. Final risk score combination
        final_scores = calculate_final_risk_score(
            xgb_scores, if_scores, self.w_xgb, self.w_if
        )

        # 4. Operational risk tier assignment
        tiers = assign_risk_tier(final_scores)

        # 5. Build output DataFrame
        result_df = pd.DataFrame(
            {
                "transaction_id": tx_ids if tx_ids is not None else [None] * len(df),
                "xgb_probability": xgb_probs,
                "xgb_score": xgb_scores,
                "isolation_forest_raw_score": if_raw_scores,
                "isolation_forest_score": if_scores,
                "final_risk_score": final_scores,
                "risk_tier": tiers,
            }
        )
        return result_df

    def predict_transaction(
        self, record: Union[Dict[str, Any], pd.Series]
    ) -> TransactionRiskResult:
        """
        Executes inference for a single transaction record.

        Args:
            record: Dictionary or Series with transaction features.

        Returns:
            TransactionRiskResult instance.
        """
        if isinstance(record, pd.Series):
            df_single = pd.DataFrame([record.to_dict()])
        elif isinstance(record, dict):
            if "features" in record and isinstance(record["features"], dict):
                flattened = dict(record["features"])
                if "transaction_id" in record:
                    flattened["transaction_id"] = record["transaction_id"]
                df_single = pd.DataFrame([flattened])
            else:
                df_single = pd.DataFrame([record])
        else:
            raise TypeError(
                f"Expected dict or pd.Series for predict_transaction, got {type(record)}"
            )

        res_df = self.predict_batch(df_single)
        row = res_df.iloc[0]

        return TransactionRiskResult(
            transaction_id=row["transaction_id"] if pd.notna(row["transaction_id"]) else None,
            xgb_probability=float(row["xgb_probability"]),
            xgb_score=float(row["xgb_score"]),
            isolation_forest_raw_score=float(row["isolation_forest_raw_score"]),
            isolation_forest_score=float(row["isolation_forest_score"]),
            final_risk_score=float(row["final_risk_score"]),
            risk_tier=str(row["risk_tier"]),
        )

    def predict(
        self, data: Union[pd.DataFrame, Dict[str, Any], List[Dict[str, Any]]]
    ) -> Union[pd.DataFrame, TransactionRiskResult]:
        """
        Convenience polymorphic prediction method.

        - If single dict: returns TransactionRiskResult.
        - If list of dicts: converts to DataFrame and returns DataFrame.
        - If DataFrame: returns DataFrame.
        """
        if isinstance(data, dict):
            return self.predict_transaction(data)
        elif isinstance(data, list):
            df = pd.DataFrame(data)
            return self.predict_batch(df)
        elif isinstance(data, pd.DataFrame):
            return self.predict_batch(data)
        else:
            raise TypeError(
                f"Unsupported input type for predict: {type(data)}. "
                "Expected pd.DataFrame, dict, or list of dicts."
            )
