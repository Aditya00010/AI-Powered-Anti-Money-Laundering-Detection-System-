"""
Project Vigilance - Python ML Service (FastAPI)
================================================
Module: app.main

Purpose:
Exposes internal REST endpoints for high-performance AML inference,
orchestrating validation and scoring via the approved AMLInferenceEngine.

Guarantees:
1. Strict Validation: Leverages AMLInferenceEngine's schema enforcement;
   rejects missing features, unexpected features, raw identifiers, NaNs, and Infs.
2. Zero Formula Duplication: Directly delegates all likelihood, anomaly, and
   tier calculations to AMLInferenceEngine.
3. Decoupled Service: Internal REST endpoints for Express backend integration.
4. Temporal Caveat: Graph features represent static 150k network topology.
"""

from contextlib import asynccontextmanager
from typing import Dict, Any, List, Optional
import math
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.inference import (
    AMLInferenceEngine,
    TransactionRiskResult,
    InferenceError,
    SchemaValidationError,
    MissingFeaturesError,
    UnexpectedFeaturesError,
    DuplicateFeaturesError,
    FeatureOrderError,
    InvalidFeatureValueError,
    ModelArtifactError,
    RAW_IDENTIFIER_COLUMNS,
)

# Global engine instance
inference_engine: Optional[AMLInferenceEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes the AMLInferenceEngine on startup."""
    global inference_engine
    try:
        inference_engine = AMLInferenceEngine()
    except Exception as e:
        # Fallback or error logging
        print(f"Warning: Failed to initialize inference engine during startup: {e}")
    yield


app = FastAPI(
    title="Project Vigilance - ML Inference Service",
    description="Internal machine learning service for AML risk scoring using XGBoost & Isolation Forest.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_engine() -> AMLInferenceEngine:
    """Helper to retrieve or initialize the inference engine."""
    global inference_engine
    if inference_engine is None:
        inference_engine = AMLInferenceEngine()
    return inference_engine


# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------

class InferenceResponse(BaseModel):
    """Standardized AML inference response."""
    transaction_id: Optional[str] = None
    xgb_probability: float
    xgb_score: float
    isolation_forest_raw_score: float
    isolation_forest_score: float
    final_risk_score: float
    risk_tier: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    version: str
    models_loaded: Dict[str, bool]


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Public health check endpoint.
    Verifies service liveness and model readiness without executing inference.
    """
    engine = get_engine()
    return HealthResponse(
        status="ok",
        service="project-vigilance-ml-service",
        version="1.0.0",
        models_loaded={
            "xgboost": engine.xgb_model is not None,
            "isolation_forest": engine.if_model is not None,
        },
    )


def _extract_and_validate_record(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts transaction_id and feature dictionary from either nested or flat payloads.
    Ensures no NaN or infinite values exist in payload.
    """
    # Case 1: Nested { "transaction_id": "...", "features": { ... } }
    if "features" in payload and isinstance(payload["features"], dict):
        tx_id = payload.get("transaction_id")
        raw_features = payload["features"]
    else:
        # Case 2: Flat payload { "transaction_id": "...", "amount": 50000.0, ... }
        raw_features = dict(payload)
        tx_id = raw_features.pop("transaction_id", None)

    # Validate numeric types and check for NaN/Inf before passing
    clean_record: Dict[str, Any] = {}
    if tx_id is not None:
        clean_record["transaction_id"] = str(tx_id)

    for k, v in raw_features.items():
        if k in RAW_IDENTIFIER_COLUMNS:
            raise UnexpectedFeaturesError(
                f"Raw identifier '{k}' detected in input. Raw identifiers must never be passed to model inference."
            )
        try:
            val = float(v)
            if math.isnan(val) or math.isinf(val):
                raise InvalidFeatureValueError(
                    f"Feature '{k}' contains invalid value: {v} (NaN or infinite values are not permitted)."
                )
            clean_record[k] = val
        except (ValueError, TypeError) as err:
            if isinstance(err, (InvalidFeatureValueError, UnexpectedFeaturesError)):
                raise
            raise InvalidFeatureValueError(
                f"Feature '{k}' has non-numeric value: {v}. All model features must be numeric."
            )

    return clean_record


@app.post("/internal/v1/inference", response_model=InferenceResponse)
async def run_inference(payload: Dict[str, Any]):
    """
    Internal single-transaction inference endpoint.
    Accepts the 84 approved features (optionally transaction_id)
    and returns standardized risk scores and operational tier.
    """
    engine = get_engine()
    try:
        clean_record = _extract_and_validate_record(payload)
        result: TransactionRiskResult = engine.predict_transaction(clean_record)
        return InferenceResponse(**result.to_dict())
    except (
        MissingFeaturesError,
        UnexpectedFeaturesError,
        DuplicateFeaturesError,
        FeatureOrderError,
        InvalidFeatureValueError,
    ) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except ModelArtifactError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model artifact error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference execution failed: {str(e)}",
        )


@app.post("/internal/v1/inference/batch", response_model=List[InferenceResponse])
async def run_batch_inference(payload: Dict[str, Any]):
    """
    Internal batch inference endpoint.
    Accepts a list of transactions under key 'transactions'.
    """
    engine = get_engine()
    txns = payload.get("transactions")
    if not isinstance(txns, list) or len(txns) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload must contain a non-empty list under 'transactions'.",
        )

    try:
        cleaned_records = [_extract_and_validate_record(t) for t in txns]
        df_batch = pd.DataFrame(cleaned_records)
        results_df = engine.predict_batch(df_batch)

        responses = []
        for _, row in results_df.iterrows():
            responses.append(
                InferenceResponse(
                    transaction_id=str(row["transaction_id"]) if pd.notna(row["transaction_id"]) else None,
                    xgb_probability=float(row["xgb_probability"]),
                    xgb_score=float(row["xgb_score"]),
                    isolation_forest_raw_score=float(row["isolation_forest_raw_score"]),
                    isolation_forest_score=float(row["isolation_forest_score"]),
                    final_risk_score=float(row["final_risk_score"]),
                    risk_tier=str(row["risk_tier"]),
                )
            )
        return responses
    except (
        MissingFeaturesError,
        UnexpectedFeaturesError,
        DuplicateFeaturesError,
        FeatureOrderError,
        InvalidFeatureValueError,
    ) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch inference failed: {str(e)}",
        )
