"""
Project Vigilance - End-to-End Preprocessing & Validation Pipeline
==================================================================
Module: ml-service/app/preprocessing/pipeline.py

Purpose:
Production pipeline unifying validation, deterministic cleaning, and basic temporal
feature derivation for both training datasets and future runtime inference/demo files.
"""

import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, Union
from dataclasses import dataclass, field

import pandas as pd
import numpy as np

from .schema import (
    REQUIRED_TRANSACTION_COLUMNS,
    GROUND_TRUTH_COLUMNS,
    PHASE1_DERIVED_TEMPORAL_COLUMNS,
    IDENTIFIER_COLUMNS,
)
from .validators import StrictSchemaValidator, ValidationResult, ValidationError
from .cleaning import DataCleaner
from .timestamp import extract_basic_temporal_features, parse_and_normalize_timestamps


@dataclass
class PreprocessingResult:
    """Holds comprehensive results and metrics of a pipeline execution."""
    success: bool
    input_records: int
    output_records: int
    input_columns: int
    output_columns: int
    input_hash: str
    output_hash: Optional[str]
    output_path: Optional[str]
    validation: ValidationResult
    cleaning_summary: Dict[str, Any]
    null_breakdown: Dict[str, Dict[str, Any]]
    execution_time_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "input_records": self.input_records,
            "output_records": self.output_records,
            "input_columns": self.input_columns,
            "output_columns": self.output_columns,
            "input_hash": self.input_hash,
            "output_hash": self.output_hash,
            "output_path": str(self.output_path) if self.output_path else None,
            "validation": self.validation.to_dict(),
            "cleaning_summary": self.cleaning_summary,
            "null_breakdown": self.null_breakdown,
            "execution_time_seconds": round(self.execution_time_seconds, 3),
        }


class PreprocessingPipeline:
    """
    Reusable, deterministic data preprocessing and validation pipeline.
    Suitable for both model training preparation and inference CSV/XLSX ingestion.
    """

    def __init__(self):
        self.validator = StrictSchemaValidator()
        self.cleaner = DataCleaner()

    @staticmethod
    def compute_file_hash(file_path: Union[str, Path]) -> str:
        """Computes SHA-256 hash of a file for immutability verification."""
        path = Path(file_path)
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    @staticmethod
    def load_file(file_path: Union[str, Path]) -> pd.DataFrame:
        """
        Loads CSV or Excel (.xlsx/.xls) file into DataFrame with strict extension check.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Input file does not exist: {path}")

        suffix = path.suffix.lower()
        if suffix == ".csv":
            df = pd.read_csv(path, low_memory=False)
        elif suffix in [".xlsx", ".xls"]:
            df = pd.read_excel(path, engine="openpyxl")
        else:
            raise ValueError(f"Unsupported file format '{suffix}'. Supported: .csv, .xlsx, .xls")

        return df

    def process_dataframe(
        self,
        tx_df: pd.DataFrame,
        gt_df: Optional[pd.DataFrame] = None,
    ) -> Tuple[pd.DataFrame, ValidationResult, Dict[str, Any]]:
        """
        Processes in-memory DataFrames:
          1. Strict schema & domain validation.
          2. Deterministic cleaning.
          3. Basic temporal feature extraction.
        """
        # Step 1: Validate
        val_result = self.validator.validate_all(tx_df, gt_df)
        if not val_result.is_valid:
            error_msg = "; ".join(val_result.errors)
            raise ValidationError(f"Dataset validation failed: {error_msg}", val_result.errors)

        # Step 2: Deterministic Cleaning
        cleaned_df, clean_summary = self.cleaner.clean(tx_df)

        # Step 3: Extract basic temporal features (date, hour, weekday)
        processed_df = extract_basic_temporal_features(cleaned_df)

        # Ensure ground truth is NOT inside the processed transaction features
        if "ground_truth" in processed_df.columns:
            raise ValidationError("CRITICAL LEAKAGE: 'ground_truth' detected in processed output features!")

        return processed_df, val_result, clean_summary

    def run(
        self,
        tx_file_path: Union[str, Path],
        gt_file_path: Optional[Union[str, Path]] = None,
        output_file_path: Optional[Union[str, Path]] = None,
    ) -> PreprocessingResult:
        """
        Runs the full pipeline from input files to processed output CSV.
        """
        import time
        start_time = time.time()

        tx_path = Path(tx_file_path).resolve()
        gt_path = Path(gt_file_path).resolve() if gt_file_path else None
        out_path = Path(output_file_path).resolve() if output_file_path else None

        # 1. Capture initial file hash (immutability check)
        input_hash = self.compute_file_hash(tx_path)

        # 2. Load data
        tx_df = self.load_file(tx_path)
        gt_df = self.load_file(gt_path) if gt_path else None

        initial_rows = len(tx_df)
        initial_cols = len(tx_df.columns)

        # 3. Process
        processed_df, val_result, clean_summary = self.process_dataframe(tx_df, gt_df)

        # 4. Null breakdown audit of output
        null_breakdown = {}
        for col in processed_df.columns:
            cnt = int(processed_df[col].isna().sum())
            null_breakdown[col] = {
                "null_count": cnt,
                "null_pct": round((cnt / len(processed_df)) * 100, 2),
            }

        # 5. Save output if requested
        output_hash = None
        if out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            # Save deterministically without index
            processed_df.to_csv(out_path, index=False)
            output_hash = self.compute_file_hash(out_path)

        # Verify source file was not modified
        post_run_input_hash = self.compute_file_hash(tx_path)
        if input_hash != post_run_input_hash:
            raise RuntimeError("CRITICAL INTEGRITY FAILURE: Input training dataset was modified during processing!")

        elapsed = time.time() - start_time

        return PreprocessingResult(
            success=True,
            input_records=initial_rows,
            output_records=len(processed_df),
            input_columns=initial_cols,
            output_columns=len(processed_df.columns),
            input_hash=input_hash,
            output_hash=output_hash,
            output_path=str(out_path) if out_path else None,
            validation=val_result,
            cleaning_summary=clean_summary,
            null_breakdown=null_breakdown,
            execution_time_seconds=elapsed,
        )
