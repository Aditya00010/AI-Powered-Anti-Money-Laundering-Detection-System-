"""
Project Vigilance - Leakage-Safe Feature Engineering Pipeline
=============================================================
Module: ml-service/app/features/pipeline.py

Purpose:
Production feature engineering pipeline transforming cleaned transactions into
a model-ready feature matrix while strictly guaranteeing:
  - Deterministic execution
  - Pure chronological past-looking calculations (strictly no future data)
  - Complete independence from ground-truth labels
  - Preservation of raw entity identifiers for Neo4j and investigation UI
  - Export of machine-readable feature definitions JSON
"""

import os
import json
import hashlib
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .transaction_features import extract_transaction_features
from .temporal_features import extract_temporal_features
from .velocity_features import extract_velocity_features
from .behavioral_features import extract_behavioral_features
from .infrastructure_features import extract_infrastructure_features
from .relationship_features import extract_relationship_features


RAW_IDENTIFIER_METADATA_COLUMNS: List[str] = [
    "transaction_id",
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


@dataclass
class FeaturePipelineResult:
    """Encapsulates execution metrics of the feature engineering pipeline."""
    success: bool
    input_records: int
    output_records: int
    total_columns: int
    engineered_feature_count: int
    input_hash: str
    output_hash: Optional[str]
    output_path: Optional[str]
    feature_names: List[str]
    feature_statistics: Dict[str, Dict[str, Any]]
    execution_time_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "input_records": self.input_records,
            "output_records": self.output_records,
            "total_columns": self.total_columns,
            "engineered_feature_count": self.engineered_feature_count,
            "input_hash": self.input_hash,
            "output_hash": self.output_hash,
            "output_path": str(self.output_path) if self.output_path else None,
            "feature_names": self.feature_names,
            "feature_statistics": self.feature_statistics,
            "execution_time_seconds": round(self.execution_time_seconds, 3),
        }


class FeatureEngineeringPipeline:
    """
    Coordinates end-to-end, deterministic feature extraction.
    """

    def __init__(self):
        pass

    @staticmethod
    def compute_file_hash(file_path: Union[str, Path]) -> str:
        """Computes SHA-256 hash of a file for immutability verification."""
        path = Path(file_path)
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def transform(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], Dict[str, Dict[str, Any]]]:
        """
        Transforms clean transactions DataFrame into engineered features dataset.
        Guarantees strict sorting by [timestamp, transaction_id] for deterministic tie-breaking.
        """
        # Step 1: Deterministic Chronological Sorting & Tie-Breaking
        # We sort by timestamp ascending; if identical, transaction_id breaks ties deterministically.
        sorted_df = df.sort_values(by=["timestamp", "transaction_id"], ascending=[True, True]).reset_index(drop=True)

        # Step 2: Extract all feature groups sequentially
        feat_tx = extract_transaction_features(sorted_df)
        feat_temp = extract_temporal_features(sorted_df)
        feat_vel = extract_velocity_features(sorted_df)
        feat_beh = extract_behavioral_features(sorted_df)
        feat_infra = extract_infrastructure_features(sorted_df)
        feat_rel = extract_relationship_features(sorted_df)

        # Concatenate all engineered feature sets
        engineered_df = pd.concat(
            [feat_tx, feat_temp, feat_vel, feat_beh, feat_infra, feat_rel],
            axis=1,
        )

        engineered_feature_names = list(engineered_df.columns)

        # Quality check: Ensure no NaN or Inf in engineered features
        nan_cols = engineered_df.columns[engineered_df.isna().any()].tolist()
        if nan_cols:
            raise ValueError(f"Feature engineering generated unexpected NaNs in columns: {nan_cols}")

        inf_cols = engineered_df.columns[np.isinf(engineered_df.values).any(axis=0)].tolist()
        if inf_cols:
            raise ValueError(f"Feature engineering generated unexpected infinite values in columns: {inf_cols}")

        # Compute summary statistics for quality reporting
        stats = {}
        for col in engineered_feature_names:
            series = engineered_df[col]
            stats[col] = {
                "dtype": str(series.dtype),
                "min": float(round(series.min(), 4)),
                "max": float(round(series.max(), 4)),
                "mean": float(round(series.mean(), 4)),
                "median": float(round(series.median(), 4)),
                "null_count": int(series.isna().sum()),
            }

        # Step 3: Combine with raw identifier metadata columns
        # Keep raw metadata for investigation and Phase 3 graph construction
        metadata_cols = [c for c in RAW_IDENTIFIER_METADATA_COLUMNS if c in sorted_df.columns]
        final_df = pd.concat([sorted_df[metadata_cols], engineered_df], axis=1)

        return final_df, engineered_feature_names, stats

    def generate_feature_definitions(
        self, feature_names: List[str], output_json_path: Path
    ) -> List[Dict[str, Any]]:
        """
        Generates comprehensive machine-readable feature definitions JSON.
        """
        definitions = []
        for name in feature_names:
            # Determine category and description
            if name == "sender_near_regulatory_threshold_txns_prev_24h":
                cat = "Behavioral Historical Aggregations"
                tw = "24h"
                desc = (
                    "Count of sender transactions in the previous 24 hours within the near-regulatory-threshold bracket "
                    "(0.90 * 1,000,000 <= amount < 1,000,000 INR). Configured via REGULATORY_CTR_THRESHOLD_INR=1,000,000 "
                    "and NEAR_THRESHOLD_LOWER_RATIO=0.90 to capture structuring (smurfing) behavior attempting to evade "
                    "the statutory ₹10 Lakh CTR reporting threshold under PMLA / FIU-IND context. Excludes current transaction. "
                    "Domain Disclaimer: Represents an objective behavioral indicator for downstream ML scoring, "
                    "not a legal determination or fraud label."
                )
            elif name.startswith("sender_") and ("prev_1h" in name or "prev_24h" in name):
                cat = "Velocity (Sender)"
                tw = "1h" if "1h" in name else "24h"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            elif name.startswith("receiver_") and ("prev_1h" in name or "prev_24h" in name):
                cat = "Velocity (Receiver)"
                tw = "1h" if "1h" in name else "24h"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            elif name.startswith("sender_"):
                cat = "Sender Historical Behavior"
                tw = "All Prior History"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            elif name.startswith("receiver_"):
                cat = "Receiver Historical Behavior"
                tw = "All Prior History"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            elif name.startswith("device_") or name.startswith("ip_"):
                cat = "Infrastructure Reuse"
                tw = "1h / 24h / Prior" if ("1h" in name or "24h" in name) else "All Prior History"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            elif "customer" in name:
                cat = "Entity Relationships"
                tw = "All Prior History"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            elif name.startswith("transaction_") or name.startswith("hour_") or name == "is_weekend":
                cat = "Temporal"
                tw = "Instantaneous"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."
            else:
                cat = "Transaction Core"
                tw = "Instantaneous"
                desc = f"Engineered feature {name} capturing {cat.lower()} patterns."

            definitions.append({
                "feature_name": name,
                "category": cat,
                "description": desc,
                "temporal_window": tw,
                "is_strictly_past_looking": True,
                "leakage_safe": True,
                "data_type": "float64" if "ratio" in name or "amount" in name or "sin" in name or "cos" in name or "std" in name or "avg" in name or "zscore" in name else "int64",
            })

        output_json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump({"total_features": len(definitions), "features": definitions}, f, indent=2)

        return definitions

    def run(
        self,
        input_csv_path: Union[str, Path],
        output_csv_path: Union[str, Path],
        feature_defs_json_path: Optional[Union[str, Path]] = None,
    ) -> FeaturePipelineResult:
        """
        Runs the feature pipeline end-to-end.
        """
        start_time = time.time()
        in_path = Path(input_csv_path).resolve()
        out_path = Path(output_csv_path).resolve()
        defs_path = (
            Path(feature_defs_json_path).resolve()
            if feature_defs_json_path
            else out_path.parent / "feature_definitions.json"
        )

        # 1. Capture initial hash to ensure source immutability
        initial_hash = self.compute_file_hash(in_path)

        # 2. Load cleaned data
        df = pd.read_csv(in_path, low_memory=False)
        in_rows = len(df)

        # 3. Transform
        final_df, feat_names, stats = self.transform(df)

        # 4. Save processed features dataset
        out_path.parent.mkdir(parents=True, exist_ok=True)
        final_df.to_csv(out_path, index=False)
        out_hash = self.compute_file_hash(out_path)

        # 5. Generate feature definitions
        self.generate_feature_definitions(feat_names, defs_path)

        # 6. Verify source immutability
        post_run_hash = self.compute_file_hash(in_path)
        if initial_hash != post_run_hash:
            raise RuntimeError("CRITICAL INTEGRITY FAILURE: Input dataset was modified during feature engineering!")

        elapsed = time.time() - start_time

        return FeaturePipelineResult(
            success=True,
            input_records=in_rows,
            output_records=len(final_df),
            total_columns=len(final_df.columns),
            engineered_feature_count=len(feat_names),
            input_hash=initial_hash,
            output_hash=out_hash,
            output_path=str(out_path),
            feature_names=feat_names,
            feature_statistics=stats,
            execution_time_seconds=elapsed,
        )
