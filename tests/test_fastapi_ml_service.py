"""
Project Vigilance - FastAPI ML Service Test Suite
=================================================
Test Module: tests/test_fastapi_ml_service.py

Verifies:
1. GET /health: Liveness and model readiness.
2. POST /internal/v1/inference: Successful inference on valid 84-feature payload.
3. POST /internal/v1/inference: Flat vs nested payload handling.
4. Error handling: Missing features (400).
5. Error handling: Unexpected features (400).
6. Error handling: Raw identifiers rejection (400).
7. Error handling: NaN and Infinite value rejection (400).
8. POST /internal/v1/inference/batch: Batch prediction endpoint.
"""

import sys
import json
from pathlib import Path
import pytest
import numpy as np
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.main import app, get_engine
from app.inference import AMLInferenceEngine


@pytest.fixture(scope="module")
def client():
    """Initializes FastAPI TestClient."""
    return TestClient(app)


@pytest.fixture(scope="module")
def engine():
    """Retrieves the global AMLInferenceEngine instance."""
    return get_engine()


@pytest.fixture
def valid_payload(engine):
    """Generates a valid single transaction payload with all 84 approved features."""
    rng = np.random.RandomState(42)
    features = {feat: float(rng.uniform(0.0, 10.0)) for feat in engine.xgb_features}
    return {
        "transaction_id": "TXN_FASTAPI_TEST_001",
        "features": features,
    }


def test_health_check(client):
    """Verifies that GET /health returns 200 and indicates models are loaded."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "project-vigilance-ml-service"
    assert data["models_loaded"]["xgboost"] is True
    assert data["models_loaded"]["isolation_forest"] is True


def test_inference_nested_payload(client, valid_payload):
    """Verifies successful inference with nested {transaction_id, features} payload."""
    response = client.post("/internal/v1/inference", json=valid_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["transaction_id"] == "TXN_FASTAPI_TEST_001"
    assert "xgb_probability" in data
    assert "xgb_score" in data
    assert "isolation_forest_raw_score" in data
    assert "isolation_forest_score" in data
    assert "final_risk_score" in data
    assert data["risk_tier"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def test_inference_flat_payload(client, valid_payload):
    """Verifies successful inference when features are sent at top level."""
    flat_payload = dict(valid_payload["features"])
    flat_payload["transaction_id"] = "TXN_FLAT_001"

    response = client.post("/internal/v1/inference", json=flat_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["transaction_id"] == "TXN_FLAT_001"
    assert "final_risk_score" in data


def test_inference_missing_feature(client, valid_payload):
    """Verifies HTTP 400 when required features are omitted."""
    corrupted = dict(valid_payload)
    corrupted_features = dict(valid_payload["features"])
    del corrupted_features["amount"]
    corrupted["features"] = corrupted_features

    response = client.post("/internal/v1/inference", json=corrupted)
    assert response.status_code == 400
    assert "amount" in response.json()["detail"]


def test_inference_unexpected_feature(client, valid_payload):
    """Verifies HTTP 400 when unknown features are supplied."""
    corrupted = dict(valid_payload)
    corrupted_features = dict(valid_payload["features"])
    corrupted_features["unknown_arbitrary_feature"] = 123.45
    corrupted["features"] = corrupted_features

    response = client.post("/internal/v1/inference", json=corrupted)
    assert response.status_code == 400
    assert "unknown_arbitrary_feature" in response.json()["detail"]


def test_inference_raw_identifier_rejected(client, valid_payload):
    """Verifies HTTP 400 when raw identifiers (e.g. sender_account) are passed."""
    corrupted = dict(valid_payload)
    corrupted_features = dict(valid_payload["features"])
    corrupted_features["sender_account"] = "ACC_12345"
    corrupted["features"] = corrupted_features

    response = client.post("/internal/v1/inference", json=corrupted)
    assert response.status_code == 400
    assert "sender_account" in response.json()["detail"]


def test_inference_nan_rejected(client, valid_payload):
    """Verifies HTTP 400 when NaN values are passed."""
    corrupted = dict(valid_payload)
    corrupted_features = dict(valid_payload["features"])
    corrupted_features["amount"] = "NaN"
    corrupted["features"] = corrupted_features

    response = client.post("/internal/v1/inference", json=corrupted)
    assert response.status_code == 400
    assert "NaN" in response.json()["detail"]


def test_inference_inf_rejected(client, valid_payload):
    """Verifies HTTP 400 when infinite values are passed."""
    corrupted = dict(valid_payload)
    corrupted_features = dict(valid_payload["features"])
    corrupted_features["amount"] = "Infinity"
    corrupted["features"] = corrupted_features

    response = client.post("/internal/v1/inference", json=corrupted)
    assert response.status_code == 400
    assert "infinite" in response.json()["detail"].lower()


def test_batch_inference(client, valid_payload):
    """Verifies batch inference endpoint POST /internal/v1/inference/batch."""
    tx2 = dict(valid_payload)
    tx2 = {"transaction_id": "TXN_BATCH_002", "features": dict(valid_payload["features"])}

    batch_payload = {"transactions": [valid_payload, tx2]}
    response = client.post("/internal/v1/inference/batch", json=batch_payload)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["transaction_id"] == "TXN_FASTAPI_TEST_001"
    assert data[1]["transaction_id"] == "TXN_BATCH_002"
