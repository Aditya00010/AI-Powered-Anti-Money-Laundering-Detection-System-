# PROJECT VIGILANCE — PHASE 5 STEP 3 REPORT
## React Frontend Foundation + Backend API Integration

**Status:** APPROVED & VALIDATED  
**Date:** October 6, 2026  
**System Version:** Project Vigilance v1.0.0 (Phase 5 Step 3)  
**Test Suite Summary:**
- Python ML & Pipeline Tests: **78 / 78 PASS**
- Node / Express Backend Tests: **20 / 20 PASS**
- React / Vitest Frontend Tests: **26 / 26 PASS**
- **Total Project Tests:** **124 / 124 PASS** (0 regressions, 0 failures)

---

## 1. Architectural Overview & Request Topology

Project Vigilance implements an enterprise-grade multi-tier architecture designed to maintain strict separation of concerns, defense-in-depth security, and reproducible model evaluation.

### Strict Tier Communication Flow
```
Browser / React Frontend
         │
         │  HTTP / JSON (REST)
         ▼
Express API Gateway (Port 5000)
    ├── CORS validation & rate-limiting
    ├── Request validation & schema check
    ├── Session context & audit logging
    │
    ├── HTTP POST /v1/infer/aml-risk (Port 8000)
    │   ▼
    │ FastAPI Python ML Service
    │   └── AMLInferenceEngine (In-memory XGBoost + Isolation Forest)
    │
    ├── Persists Evaluation Dossier (Port 27017)
    │   ▼
    │ MongoDB (Collection: aml_evaluations)
    │
    └── Returns Unified Assessment Response (JSON)
         ▼
Browser / React Frontend (Renders Operational Risk Score & Dossier)
```

### Architectural Invariants Maintained:
1. **Zero Direct Frontend-to-FastAPI Connectivity:** The React client communicates strictly with the Express API gateway (`http://localhost:5000`). Direct HTTP calls from the browser to port 8000 are forbidden by architecture and network topology.
2. **Immutable Machine Learning Pipeline:** No machine learning weights, hyperparameters, or training data were altered. All Phase 4 artifacts (`xgboost_v3_graph.joblib`, `isolation_forest_v3_graph.joblib`, `configs/risk_scoring_v1.json`) remain bit-for-bit identical.
3. **No Ground Truth Leakage:** Neither ground-truth flags nor raw identifier strings (`sender_account`, `receiver_account`, `ip_address`, `device_id`) are ingested into ML inference.

---

## 2. Technology Selection & Framework Decisions

1. **Core UI Framework:**
   - **React 18** (functional components with Hooks: `useState`, `useEffect`, `useContext`, `useMemo`).
   - **Vite 6**: High-speed build tool and development server providing near-instant HMR and production bundle optimization.
   - **React Router v6**: Declarative client-side routing hierarchy with protected routes and nested layouts.
   - **Axios**: HTTP client equipped with centralized interceptors, 10-second timeout enforcement, and standardized error normalization.
2. **Zero Bulky Component Libraries:**
   - In accordance with enterprise specifications, heavy component frameworks (Material UI, Ant Design, Bootstrap JS) were **not** introduced.
   - Styling is implemented using pure semantic CSS custom properties in `src/styles/index.css`.
3. **TypeScript Exclusion:**
   - Standard JavaScript (ES2022 + JSX) was used throughout, satisfying the requirement to avoid TypeScript complexity while maintaining strict runtime input validation.
4. **Testing Infrastructure:**
   - **Vitest 2.1**: Native Vite test runner with Jest-compatible API.
   - **@testing-library/react** and **@testing-library/jest-dom**: User-centric DOM testing.
   - **JSDOM**: Headless browser environment for fast, deterministic unit and integration tests.

---

## 3. Component Architecture & Modular Directory Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── .env
├── src/
│   ├── main.jsx                       # Application entry point
│   ├── App.jsx                        # Root provider wrap (Router + Auth)
│   ├── styles/
│   │   └── index.css                  # Dark-theme enterprise AML styling
│   ├── api/
│   │   ├── client.js                  # Central Axios instance with error interceptors
│   │   ├── healthApi.js               # Express + ML health endpoints
│   │   └── analysisApi.js             # Evaluate transaction + query history
│   ├── context/
│   │   └── AuthContext.jsx            # RBAC session state foundation
│   ├── routes/
│   │   ├── AppRoutes.jsx              # Application route map
│   │   ├── ProtectedRoute.jsx         # UX session guard
│   │   └── RoleGuard.jsx              # UX role guard (e.g., ADMIN only)
│   ├── components/
│   │   ├── common/
│   │   │   ├── Badge.jsx              # Status badges
│   │   │   ├── Button.jsx             # Action button with double-click lock
│   │   │   ├── Card.jsx               # Surface container card
│   │   │   ├── ErrorAlert.jsx         # Dismissible error banners
│   │   │   └── LoadingSpinner.jsx     # Pulse/spinner loading state
│   │   ├── layout/
│   │   │   ├── Navbar.jsx             # Top bar with user role & identity
│   │   │   ├── Sidebar.jsx            # Navigation links & Phase 6 indicators
│   │   │   └── AppLayout.jsx          # Shell layout wrapper
│   │   └── risk/
│   │       ├── RiskTierBadge.jsx      # Accessible tier indicator (Color + Icon + Text)
│   │       ├── RiskScoreCard.jsx      # Hero card with Operational Risk Score
│   │       └── ComponentBreakdown.jsx # 80/20 dual-model contribution breakdown
│   └── pages/
│       ├── Dashboard.jsx              # Real-time health & architecture status
│       ├── AnalyzeTransaction.jsx     # Transaction payload submission & presets
│       ├── AnalysisResult.jsx         # Historical investigation dossier view
│       ├── ConfigurationPlaceholder.jsx # Role-guarded threshold config placeholder
│       └── NotFound.jsx               # 404 error page
└── tests/
    ├── setup.js                       # Jest-dom matcher configuration
    ├── api.test.js                    # API service & error interceptor tests
    ├── App.test.jsx                   # Routing, layout, and guard tests
    ├── Dashboard.test.jsx             # Health telemetry & service state tests
    ├── AnalyzeTransaction.test.jsx    # Form validation & error handling tests
    └── RiskScoreCard.test.jsx         # Risk visualization & accessibility tests
```

---

## 4. Risk Visualization & Terminology Guardrails

### Exact Labeling: Operational Risk Score
In compliance with model governance and supervisory audit standards:
- The risk metric is explicitly labeled **"Operational Risk Score"** (0–100 scale).
- It is **never** presented as an uncalibrated "Probability of Money Laundering".
- A prominent governance disclaimer is rendered beneath the hero score:
  > *"Operational Risk Score reflects a heuristic triage prioritization combining supervised typologies (80%) with unsupervised eccentricity (20%). It is not a calibrated statistical probability."*

### Dual-Model Component Breakdown
The contribution of each underlying engine is clearly displayed:
1. **XGBoost Typology Engine (80% Weight):**
   - Displays raw model output: `P(AML) = 0.9635`
   - Rescaled score: `96.35 / 100`
   - Effective weighted contribution: `+77.08` points
2. **Isolation Forest Eccentricity Engine (20% Weight):**
   - Displays raw decision score: `-0.1500`
   - Normalized score: `62.50 / 100`
   - Effective weighted contribution: `+12.50` points
3. **Composite Operational Score:** `89.58 / 100` $\rightarrow$ **CRITICAL**

### Accessible Tier Visualization
To ensure accessibility for all users (including color-blind compliance personnel), each tier incorporates distinct colors, shapes/icons, and textual labels:
- **LOW (< 30.0):** 🟢 `#10b981` (Emerald) — Safe / Inlier
- **MEDIUM (30.0 – 69.9):** 🟡 `#f59e0b` (Amber) — Moderate Eccentricity
- **HIGH (70.0 – 84.9):** 🟠 `#f97316` (Orange) — High Suspicion / Priority Triage
- **CRITICAL (≥ 85.0):** 🔴 `#ef4444` (Rose/Red) — Immediate Escalation Required

---

## 5. Role-Based Access Control (RBAC) Architecture Foundation

`src/context/AuthContext.jsx` and `src/routes/RoleGuard.jsx` establish the state management and routing foundation for role-based authorization without introducing mock logins:
- **Supported Roles:** `INVESTIGATOR`, `COMPLIANCE_OFFICER`, `ADMIN`.
- **Active Profile:** Set to default `INVESTIGATOR` role.
- **Client Route Guarding:** `RoleGuard` prevents non-admin users from viewing system administration sections.
- **Security Boundary Disclaimer:** The application clearly displays that client-side route guards represent user experience boundaries, while true enforcement resides in Express backend middleware.

---

## 6. Configurable Risk Threshold Management Foundation

The `/configuration` route is guarded with `RoleGuard` requiring the `ADMIN` role:
- When accessed by an `INVESTIGATOR`, it cleanly displays an **Access Restricted** card with role requirement details.
- When accessed by an `ADMIN`, it presents the current baseline thresholds:
  - Low Tier: `< 30.0`
  - Medium Tier: `30.0 – 69.9`
  - High Tier: `70.0 – 84.9`
  - Critical Tier: `≥ 85.0`
  - XGBoost Weight: `0.80` (80%)
  - Isolation Forest Weight: `0.20` (20%)
- Explanatory documentation specifies that dynamic threshold modifications will require backend persistence, change logs, and regulatory audit approvals.

---

## 7. Fault Recovery, Resilience & Error States

The frontend Axios client (`src/api/client.js`) and error banner (`src/components/common/ErrorAlert.jsx`) handle all operational failure modes:
1. **Backend Unavailable (Network Down / Port 5000 Inaccessible):**
   - Intercepted cleanly: displays `"Unable to connect to the backend server. Please verify backend is running."`
2. **FastAPI ML Service Unavailable (HTTP 503):**
   - Intercepted cleanly: displays `"AML analysis service is temporarily unavailable. Please try again."`
3. **Gateway Timeout (HTTP 504 / Request Timeout > 10,000ms):**
   - Intercepted cleanly: displays `"AML analysis service request timed out. Please try again."`
4. **Invalid Request / Validation Error (HTTP 400):**
   - Extracts specific validation errors from the backend response (e.g., missing features, malformed JSON, raw identifiers) and displays actionable feedback to the investigator.
5. **Duplicate Submit Prevention:**
   - `Button.jsx` automatically enforces single-submission locking. When an evaluation request is in flight, the button renders an animated spinner and disables user interaction.

---

## 8. Real-Time Telemetry & Pre-Packaged Demo Fixtures

### Live Operational Telemetry
`Dashboard.jsx` polls the Express backend (`GET /health` and `GET /health/ml`), rendering real operational statuses:
- **Express Backend:** Health status, uptime, service version.
- **FastAPI ML Service:** Model readiness (`XGBoost: Loaded`, `Isolation Forest: Loaded`).
- **MongoDB Database:** Local connection state and persistence readiness.

### One-Click Demonstration Fixtures
`AnalyzeTransaction.jsx` includes pre-packaged, validated transaction fixtures derived from the Phase 4 30,000 Out-of-Time test set:
- **Clean LOW-Risk Fixture (`TX-V2-200586`):**
  - UPI payment of ₹4,500 with zero cycle activity and normal historical velocity.
  - Generates Operational Risk Score of `13.52` (LOW tier).
- **Laundering CRITICAL-Risk Fixture (`TX-V2-242571`):**
  - High-value RTGS rapid movement of ₹4,90,000 with cycle participation (3-hop cycle) and multi-account velocity.
  - Generates Operational Risk Score of `89.58` (CRITICAL tier).

---

## 9. Test Suite Verification & Results

### Frontend Vitest Suite (`npm test` in `frontend/`)
```
 RUN  v2.1.9 D:/Projects/AI Powered AML detection system/Project codebase/frontend

 ✓ tests/api.test.js (8 tests)
 ✓ tests/RiskScoreCard.test.jsx (2 tests)
 ✓ tests/Dashboard.test.jsx (2 tests)
 ✓ tests/App.test.jsx (6 tests)
 ✓ tests/AnalyzeTransaction.test.jsx (8 tests)

 Test Files  5 passed (5)
      Tests  26 passed (26)
   Duration  5.84s
```

### Express Backend Suite (`npm test` in `backend/`)
```
▶ Express API Tests
  ✔ GET /health returns 200 with status ok and service identifier
  ✔ GET /non-existent-route returns 404
  ✔ POST /api/v1/analysis/evaluate rejects empty request body with 400
  ✔ POST /api/v1/analysis/evaluate does NOT trust client risk scores
  ✔ POST /api/v1/analysis/evaluate returns 503 when ML service is unavailable
  ✔ POST /api/v1/analysis/evaluate returns 504 when ML service times out
✔ Express API Tests (160.94ms)

▶ End-to-End MERN + Python ML Integration Tests
  ✔ 1. GET /health checks Express backend operational status
  ✔ 2. GET /health/ml tests Express -> FastAPI connectivity
  ✔ 3. POST /api/v1/analysis/evaluate correctly evaluates and reproduces LOW-tier transaction
  ✔ 4. GET /api/v1/analysis/:transactionId retrieves persisted MongoDB record
  ✔ 5. POST /api/v1/analysis/evaluate correctly evaluates and persists CRITICAL-tier transaction
  ✔ 6. POST /api/v1/analysis/evaluate propagates 400 when missing features are submitted
  ✔ 7. POST /api/v1/analysis/evaluate propagates 400 when raw identifiers are submitted
✔ End-to-End MERN + Python ML Integration Tests (9670.86ms)

▶ MLClient Unit Tests
  ✔ validates response contract successfully when all 6 required fields are valid
  ✔ rejects response when required field is missing
  ✔ rejects response when risk_tier is invalid
  ✔ rejects response when final_risk_score is out of bounds
  ✔ correctly maps ECONNABORTED to MLServiceTimeoutError (504)
  ✔ correctly maps ECONNREFUSED to MLServiceUnavailableError (503)
  ✔ correctly maps 400 Bad Request to MLServiceValidationError (400)
✔ MLClient Unit Tests (12.28ms)

ℹ tests 20 | suites 3 | pass 20 | fail 0
```

### Python ML Service & Pipeline Suite (`python -m pytest tests/ -v`)
```
tests/test_fastapi_ml_service.py: 9 passed
tests/test_features.py: 23 passed
tests/test_graph_merge.py: 5 passed
tests/test_inference.py: 18 passed
tests/test_preprocessing.py: 23 passed

======================= 78 passed, 1 warning in 25.97s =======================
```

### Production Build Verification (`npm run build` in `frontend/`)
```
> vite build
✓ 109 modules transformed.
dist/index.html                   0.73 kB │ gzip:  0.42 kB
dist/assets/index-BUIWDiUA.css    5.70 kB │ gzip:  1.75 kB
dist/assets/index-DMI4Vig2.js   253.98 kB │ gzip: 82.43 kB
✓ built in 17.98s
```

---

## 10. Conclusion & Project Vigilance Status

Phase 5 Step 3 has successfully delivered a robust, secure, and clean React frontend foundation for Project Vigilance. The frontend communicates exclusively through the Express backend, visualizes operational risk scores accurately with accessible risk tiers and dual-model attribution, enforces resilient error handling for service interruptions, and integrates client-side RBAC and configurable threshold foundations.

All 124 regression, backend, and frontend tests pass cleanly with zero failures. Phase 5 Step 3 is **COMPLETE and READY FOR REVIEW**.
