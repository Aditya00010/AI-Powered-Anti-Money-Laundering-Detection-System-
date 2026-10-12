# Project Vigilance — Phase 5 Step 2: MERN Backend + Python ML Service Integration Report

> [!IMPORTANT]
> **Phase 5 Step 2 Status**: **PASS**  
> Modern decoupled MERN-style architecture successfully integrated:
> - **Python ML Service** (`FastAPI`): Internal high-performance service hosting `AMLInferenceEngine`.
> - **Express Backend** (`Node.js`): Application and API orchestration layer with thin controllers and dedicated ML client.
> - **MongoDB Application Database**: Connected with schema persistence for transaction risk assessments (`AmlAnalysis`).
> - **End-to-End Validation**: Express $\rightarrow$ FastAPI $\rightarrow$ `AMLInferenceEngine` $\rightarrow$ MongoDB verified; reproduces approved model reference outputs with zero discrepancy.
> - **Automated Test Results**: **78/78 Python tests passing** + **20/20 Node.js tests passing** (**98/98 tests total**).

---

## 1. Existing Architecture Discovered
Before implementing Phase 5 Step 2, inspection of the codebase revealed:
- `ml-service/`: Python microservice containing data preprocessing, graph connectors, feature engineering, and the approved `AMLInferenceEngine` ([`ml-service/app/inference/engine.py`](file:///d:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/ml-service/app/inference/engine.py)).
- `backend/`: Empty directory reserved for the Node.js/Express application layer.
- `frontend/`: Empty directory reserved for the future React UI layer.
- `configs/`: Approved baseline scoring configuration ([`configs/risk_scoring_v1.json`](file:///d:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/configs/risk_scoring_v1.json)).
- `models/`: Trained model binaries ([`models/xgboost_v3_graph.joblib`](file:///d:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/models/xgboost_v3_graph.joblib) and [`models/isolation_forest_v3_graph.joblib`](file:///d:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/models/isolation_forest_v3_graph.joblib)).
- Environment: Local MongoDB running on port 27017 (`tcpTestSucceeded: True`); Node.js v24.15.0; Python 3.11 with FastAPI 0.111.1 and Uvicorn 0.30.6.

---

## 2. Express Backend Architecture
The Express backend is implemented in JavaScript (Node.js) following standard clean-architecture patterns:
```
backend/
├── src/
│   ├── config/
│   │   ├── env.js           # Centralized environment variable loader
│   │   └── db.js            # Mongoose connection lifecycle manager
│   ├── utils/
│   │   └── errors.js        # Standardized AppError, ValidationError, MLService errors
│   ├── services/
│   │   └── mlClient.js      # Dedicated HTTP client with timeout & response validation
│   ├── models/
│   │   └── AmlAnalysis.js   # Mongoose model for evaluated transaction risk persistence
│   ├── middleware/
│   │   └── errorHandler.js  # Centralized error handler shielding tracebacks
│   ├── controllers/
│   │   ├── healthController.js    # Public & internal health checks
│   │   └── analysisController.js  # Thin controller handling request sanitize & dispatch
│   ├── routes/
│   │   ├── healthRoutes.js        # GET /health, GET /health/ml
│   │   └── analysisRoutes.js      # POST /api/v1/analysis/evaluate, GET /:transactionId
│   └── app.js               # Express application initialization & middleware
├── tests/
│   ├── fixtures/            # Real OOT transaction fixtures for testing
│   ├── mlClient.test.js     # Unit tests for ML client error handling & validation
│   ├── api.test.js          # Express route and security middleware tests
│   └── integration.test.js  # Live end-to-end Express -> FastAPI -> MongoDB test suite
├── server.js                # Server entrypoint with graceful shutdown
└── package.json             # Express, Mongoose, Axios, Cors, Dotenv dependencies
```

---

## 3. FastAPI ML Architecture
The Python ML service resides in [`ml-service/app/main.py`](file:///d:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/ml-service/app/main.py) and exposes dedicated internal inference endpoints:
- **Lifespan Manager**: Loads `AMLInferenceEngine` once on service startup, preventing runtime reload overhead.
- **Direct Delegation**: Does **not** duplicate scoring formulas or tier rules; delegates 100% of calculation to the approved `AMLInferenceEngine`.
- **Validation Propagation**: Maps `MissingFeaturesError`, `UnexpectedFeaturesError`, `FeatureOrderError`, and `InvalidFeatureValueError` directly to HTTP 400 Bad Request with precise diagnostic detail.

---

## 4. Express $\rightarrow$ FastAPI Communication Flow
```
Client / React UI
       │
       │ HTTP POST /api/v1/analysis/evaluate
       ▼
Express Controller (analysisController.js)
  - Validates request presence
  - Strips/ignores client-forged risk scores
       │
       ▼
ML Service Client (mlClient.js)
  - Configured with ML_SERVICE_URL (default http://localhost:8000)
  - Configurable timeout (default 5000ms)
       │
       │ HTTP POST /internal/v1/inference
       ▼
Python ML Service (FastAPI / app/main.py)
  - Sanitizes feature dictionary
  - Verifies no raw identifiers, NaNs, or Infs
       │
       ▼
AMLInferenceEngine (app/inference/engine.py)
  - Evaluates XGBoost likelihood (84 features)
  - Evaluates Isolation Forest anomaly score (80 features)
  - Standardizes to 0-100 scale (anchors: 0.35, 0.50, 0.70)
  - Combines with approved 80/20 weights
  - Assigns operational tier (LOW / MEDIUM / HIGH / CRITICAL)
       │
       │ JSON Response (7 contract fields)
       ▼
ML Service Client (mlClient.js)
  - Validates response schema and bounds
       │
       ▼
Express Controller
  - Persists record in MongoDB (AmlAnalysis model)
  - Returns sanitized result to caller
```

---

## 5. API Endpoints

### Express Backend Endpoints
| Method | Route | Description | Auth / Scope |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public operational health check (database state, uptime) | Public |
| `GET` | `/health/ml` | Internal check probing Python ML service connectivity | Internal / Admin |
| `POST` | `/api/v1/analysis/evaluate` | Evaluates AML risk for transaction features, persists in DB | Public / Client |
| `GET` | `/api/v1/analysis/:transactionId` | Retrieves persisted AML risk evaluation from MongoDB | Public / Client |

### Python ML Service Endpoints (Internal)
| Method | Route | Description | Scope |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Liveness check reporting model readiness | Internal |
| `POST` | `/internal/v1/inference` | Evaluates single transaction (nested or flat format) | Internal |
| `POST` | `/internal/v1/inference/batch` | Evaluates batch of transactions in DataFrame format | Internal |

---

## 6. Request & Response Schemas

### Request Payload (`POST /api/v1/analysis/evaluate` & `POST /internal/v1/inference`)
Supports either nested `features` or top-level flat format:
```json
{
  "transaction_id": "TX-V2-242571",
  "features": {
    "amount": 490000.0,
    "log_amount": 13.10216,
    "is_crypto": 0.0,
    "...": "all 84 approved numeric features"
  }
}
```

### Response Contract (7 Standardized Fields)
```json
{
  "transaction_id": "TX-V2-242571",
  "xgb_probability": 0.9634503722190857,
  "xgb_score": 96.34503722190857,
  "isolation_forest_raw_score": 0.550000011920929,
  "isolation_forest_score": 62.50000298023224,
  "final_risk_score": 89.5760296201665,
  "risk_tier": "CRITICAL"
}
```

---

## 7. MongoDB Integration
- **Model**: [`backend/src/models/AmlAnalysis.js`](file:///d:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/backend/src/models/AmlAnalysis.js)
- **Database**: `aml_detection`
- **Fields**: `transaction_id`, `xgb_probability`, `xgb_score`, `isolation_forest_raw_score`, `isolation_forest_score`, `final_risk_score`, `risk_tier`, `features_snapshot`, timestamps.
- **Indexes**: Indexed on `transaction_id`, `final_risk_score`, and compound `{ risk_tier: 1, created_at: -1 }`.
- **Fault-Tolerance**: If MongoDB is temporarily offline, inference completes and returns results while gracefully logging DB connection warnings without crashing the service.

---

## 8. Environment Configuration
Environment variables are strictly loaded from root `.env` / `backend/.env` without hard-coded secrets:
| Variable | Value / Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Express backend listening port |
| `NODE_ENV` | `development` | Runtime environment |
| `MONGODB_URI` | `mongodb://localhost:27017/aml_detection` | MongoDB connection string |
| `ML_SERVICE_URL` | `http://localhost:8000` | Internal FastAPI service URL |
| `ML_SERVICE_TIMEOUT_MS` | `5000` | HTTP request timeout for ML calls |

---

## 9. Error Handling
Specialized error classes map service-to-service failures to meaningful HTTP status codes:
- **ML Service Offline / Connection Refused** $\rightarrow$ `MLServiceUnavailableError` (**HTTP 503**)
- **ML Service Timeout** ($>5000\text{ms}$) $\rightarrow$ `MLServiceTimeoutError` (**HTTP 504**)
- **Invalid Features / Schema Validation Failure** $\rightarrow$ `MLServiceValidationError` (**HTTP 400**)
- **Malformed ML Response** $\rightarrow$ `MLServiceBadResponseError` (**HTTP 502**)
- **Client Route Not Found** $\rightarrow$ `NotFoundError` (**HTTP 404**)
- **Security Guard**: Python tracebacks, internal file paths, and environment secrets are never leaked in API error responses.

---

## 10. Security Considerations
1. **Client Score Tampering Prevention**: The controller strictly ignores and deletes any client-supplied `final_risk_score`, `risk_tier`, or probability fields. Scores must originate from the Python ML service.
2. **Raw Identifier Prohibition**: Client requests containing raw identifiers (`sender_account`, `ip_address`, `device_id`, etc.) in the feature payload are rejected with HTTP 400.
3. **Internal Endpoint Isolation**: `/internal/v1/inference` is intended for backend-to-backend communication and not directly exposed to external public clients.

---

## 11. Automated Test Execution Results

### Node.js Backend Tests (`backend/tests/`) — 20 Passed
- **`mlClient.test.js`** (7 tests): Validates contract enforcement, required fields, tier verification, timeout mapping (`ECONNABORTED` $\rightarrow$ 504), connection refused (`ECONNREFUSED` $\rightarrow$ 503), validation error mapping ($\rightarrow$ 400).
- **`api.test.js`** (6 tests): Validates `GET /health`, `GET /unknown-endpoint` (404), empty body rejection (400), client-score tamper rejection, 503 propagation, and 504 timeout propagation.
- **`integration.test.js`** (7 tests):
  1. `GET /health` checks Express backend and MongoDB status.
  2. `GET /health/ml` tests Express $\rightarrow$ FastAPI health.
  3. `POST /api/v1/analysis/evaluate` with real OOT `sample_transaction.json` reproduces LOW-tier score ($6.31$) within $10^{-4}$ tolerance.
  4. `GET /api/v1/analysis/:transactionId` retrieves persisted record from MongoDB.
  5. `POST /api/v1/analysis/evaluate` with real OOT `critical_transaction.json` reproduces CRITICAL-tier score ($89.58$) and verifies MongoDB persistence.
  6. Rejection of missing features with HTTP 400.
  7. Rejection of raw identifiers with HTTP 400.

### Python ML Service Tests (`tests/`) — 78 Passed
- **`test_fastapi_ml_service.py`** (9 tests): Validates FastAPI health, nested payload, flat payload, missing feature rejection, unexpected feature rejection, raw identifier rejection, NaN rejection, Inf rejection, and batch endpoint.
- **`test_inference.py`** (18 tests): Comprehensive Phase 5 Step 1 tests (boundary anchors, 80/20 weights, 30k OOT reference reproduction).
- **Existing Phase 2 / Phase 3 regression tests** (51 tests): All continue passing.

**Grand Total**: **98 passed out of 98 tests (100% pass rate)**.

---

## 12. Temporal Graph Caveat
> [!WARNING]
> The topological graph features ingested by the ML inference engine (`sender_pagerank_score`, `receiver_in_degree`, cycle flags, etc.) were computed over the complete static 150,000-transaction network topology.
> - **Appropriate Scope**: Retrospective compliance reviews, batch forensic audits, and historical transaction risk scoring.
> - **Caveat**: Not claimed as strict point-in-time causal streaming backtesting.

---

## 13. Conclusion
The MERN backend and Python FastAPI ML service integration is complete, robustly tested end-to-end, and verified against all architectural and security constraints.

**Recommendation**: **READY FOR PHASE 5 STEP 3**
