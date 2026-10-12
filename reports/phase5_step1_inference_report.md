# Project Vigilance — Phase 5 Step 1: Isolated AML Inference Engine Report

> [!IMPORTANT]
> **Phase 5 Step 1 Status**: **PASS**  
> An isolated, production-ready inference engine (`AMLInferenceEngine`) has been implemented and validated against the approved Phase 4 risk-scoring design. **No models were retrained**, **no datasets were modified**, **no API or frontend connections were made**, and **the engine exactly reproduces the reference 30,000-transaction out-of-time evaluation metrics within floating-point tolerance**.

---

## 1. Overview & Architecture

The `AMLInferenceEngine` provides an isolated, deterministic execution pipeline for evaluating transaction AML risk using the approved dual-model architecture:
1. **Supervised XGBoost Likelihood** (`XGB_SCORE`): Evaluates alignment with known money laundering typologies.
2. **Unsupervised Isolation Forest Anomaly Detection** (`IF_SCORE`): Detects structural, behavioral, and topological outliers independent of training labels.
3. **Linear Risk Combination**: Evaluates operational risk scores on a standardized $0–100$ scale.
4. **Operational Risk Tiers**: Prioritizes alerts into four investigation tiers (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).

```
                   Input Transaction Features
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       XGBoost Features (84)         Isolation Forest Features (80)
               │                               │
               ▼                               ▼
    XGBoost predict_proba             IF score_samples
               │                               │
       xgb_probability                 raw_if_score
               │                               │
         x 100.0 (Scale)               Piecewise Linear Normalization
               │                       (Anchors: 0.35, 0.50, 0.70)
               ▼                               ▼
           XGB_SCORE                        IF_SCORE
               │                               │
               └───────────────┬───────────────┘
                               │
                     0.80 * XGB + 0.20 * IF
                               │
                               ▼
                        FINAL_RISK_SCORE
                               │
                               ▼
                        Operational Tier
                   (LOW / MED / HIGH / CRIT)
```

---

## 2. Files Created & Modified

### Created Files:
1. **`ml-service/app/inference/exceptions.py`**:
   - `InferenceError`: Base exception.
   - `ModelArtifactError`: Raised on missing or corrupted model binaries or configuration files.
   - `SchemaValidationError`: Base exception for feature schema violations.
   - `MissingFeaturesError`: Raised when required features are omitted (no silent imputation).
   - `UnexpectedFeaturesError`: Raised when unapproved features or raw identifiers are passed.
   - `DuplicateFeaturesError`: Raised when duplicate column names exist.
   - `FeatureOrderError`: Raised when columns are permuted out of trained order.
   - `InvalidFeatureValueError`: Raised on NaN, positive infinite, or negative infinite feature values.
2. **`ml-service/app/inference/schema.py`**:
   - `TransactionRiskResult`: Standardized frozen dataclass container for single-transaction inference output (`transaction_id`, `xgb_probability`, `xgb_score`, `isolation_forest_raw_score`, `isolation_forest_score`, `final_risk_score`, `risk_tier`).
3. **`ml-service/app/inference/engine.py`**:
   - `AMLInferenceEngine`: Production inference engine with artifact loading, hash verification, strict feature validation, batch prediction (`predict_batch`), single-record prediction (`predict_transaction`), and polymorphic dispatch (`predict`).
   - `normalize_isolation_forest_score()`: Pure mathematical piecewise linear normalizer.
   - `calculate_final_risk_score()`: Standardized linear combination function.
   - `assign_risk_tier()`: Boundary-checked tier assignment function.
4. **`ml-service/app/inference/__init__.py`**:
   - Public package exports.
5. **`tests/test_inference.py`**:
   - Comprehensive test suite containing 18 focused tests.
6. **`reports/phase5_step1_inference_report.md`**:
   - This documentation artifact.

---

## 3. Model Artifacts Used

| Model Component | Artifact File Path | SHA-256 Hash | Feature Count | Trained Type |
| :--- | :--- | :--- | :---: | :--- |
| **XGBoost Classifier** | `models/xgboost_v3_graph.joblib` | `cb93e63eb59bd230d086620c1773a829c33970776757e798e66172aec6732f08` | 84 | Supervised Gradient Boosted Trees |
| **Isolation Forest** | `models/isolation_forest_v3_graph.joblib` | `e3a7faa12829e44bf85192e6bc208c8de70807309097d747558bf1f108e3e0b9` | 80 | Unsupervised Random Isolation Ensembles |
| **Configuration** | `configs/risk_scoring_v1.json` | — | — | Approved Phase 4 Baseline Configuration |

---

## 4. Feature Sets & Validation Policy

- **XGBoost Model (84 Features)**:
  - 62 engineered features from Phase 2 (amounts, temporal, velocity, counterparty diversity, infrastructure reuse).
  - 22 graph intelligence features from Phase 3 (PageRank, in/out degrees, cycle participation and lengths).
- **Isolation Forest Model (80 Features)**:
  - Strict subset of the 84 XGBoost features in identical relative order, excluding nominal Louvain IDs (`sender_louvain_community_id`, `receiver_louvain_community_id`) and high-correlation customer counters (`device_unique_customers_historical`, `ip_unique_customers_historical`).
- **Feature Validation Enforcements**:
  - **No Silent Imputation**: If any required feature is absent, `MissingFeaturesError` is raised immediately.
  - **No Raw Identifiers**: Raw metadata columns (`timestamp`, `sender_account`, `sender_name`, `sender_customer_id`, `receiver_account`, `receiver_name`, `receiver_customer_id`, `ip_address`, `device_id`, `crypto_wallet`, `location_country`, `location_city`, `transaction_date`) are strictly rejected.
  - **Metadata Isolation**: `transaction_id` is extracted for tracking if provided, but never passed into model matrices.
  - **Strict Ordering**: Features must match the exact trained order; any column swap triggers `FeatureOrderError`.
  - **Value Integrity**: Features containing `NaN`, `+inf`, or `-inf` trigger `InvalidFeatureValueError`.

---

## 5. Risk-Scoring Formula & Normalization

### Supervised Rescaling
$$\text{XGB\_SCORE} = \text{xgb\_probability} \times 100.0$$

### Unsupervised Piecewise Linear Normalization
Raw anomaly score $s(x) = -\text{score\_samples}(x)$ spans approximately $[0.35, 0.73]$:
$$\text{IF\_SCORE} = \begin{cases} \text{clip}\left(\frac{s(x) - 0.35}{0.50 - 0.35} \times 50.0, 0.0, 50.0\right) & \text{if } s(x) < 0.50 \\[8pt] \text{clip}\left(50.0 + \frac{s(x) - 0.50}{0.70 - 0.50} \times 50.0, 50.0, 100.0\right) & \text{if } s(x) \ge 0.50 \end{cases}$$

- **Anchor 0.50**: Theoretical/implementation decision boundary from Liu et al. (2008) and scikit-learn (`offset_ = -0.50`), where path length equals average binary search tree depth $c(n)$ ($s(x) = 2^{-1} = 0.50$). Mapped to $50.0$.
- **Anchors 0.35 & 0.70**: Fixed operational normalization anchors representing the empirical background inlier floor ($\sim 0.354$) and extreme outlier ceiling ($\sim 0.728$) observed in training. NOT theoretical constants; NOT tuned using test labels.

### Final Risk Score
$$\mathbf{FINAL\_RISK\_SCORE} = 0.80 \times \mathbf{XGB\_SCORE} + 0.20 \times \mathbf{IF\_SCORE}$$
Bounded strictly in $[0.00, 100.00]$.

---

## 6. Operational Risk Tiers & Compliance Protocols

> [!IMPORTANT]
> **Operational Risk-Prioritization Tiers**: Tiers represent operational prioritization queues, NOT guaranteed future probabilities. Prevalences reflect historical validation on the out-of-time evaluation set.
>
> **Compliance Mandate**: **Final SAR filing and compliance disposition remain subject to appropriate investigator/compliance review. The scoring system prioritizes transactions for investigation; it does NOT autonomously determine that a SAR must be filed.**

| Risk Tier | Score Range | Operational Meaning | Recommended Action |
| :--- | :---: | :--- | :--- |
| **LOW** | $0.00 - 30.00$ | Operational risk-prioritization tier | Automated clearing or passive monitoring |
| **MEDIUM** | $30.01 - 60.00$ | Operational risk-prioritization tier | Secondary compliance review / anomaly watchlist |
| **HIGH** | $60.01 - 80.00$ | Operational risk-prioritization tier | Priority investigation / enhanced review |
| **CRITICAL** | $80.01 - 100.00$ | Operational risk-prioritization tier | Highest-priority compliance investigation |

---

## 7. 30K Out-of-Time Reference vs. Actual Comparison

Validation was conducted on the untouched 30,000-row chronological evaluation set (`data/processed/aml_150k_graph_features.csv`, rows 120,000 to 150,000) using `AMLInferenceEngine.predict_batch`.

### A. Score Distribution Metrics
| Statistic | Approved Reference | Inference Engine Actual | Difference | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Minimum Score** | 1.47 | 1.47 | 0.0000 | **MATCH** |
| **Mean Score** | 15.05 | 15.05 | 0.0000 | **MATCH** |
| **Median Score** | 9.68 | 9.68 | 0.0000 | **MATCH** |
| **Maximum Score** | 99.92 | 99.92 | 0.0000 | **MATCH** |
| **Standard Deviation** | 19.06 | 19.06 | 0.0000 | **MATCH** |

### B. Risk Tier Populations
| Risk Tier | Approved Reference Count | % Population | Actual Engine Count | % Population | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **LOW** | 27,666 | 92.22% | 27,666 | 92.22% | **EXACT MATCH** |
| **MEDIUM** | 682 | 2.27% | 682 | 2.27% | **EXACT MATCH** |
| **HIGH** | 198 | 0.66% | 198 | 0.66% | **EXACT MATCH** |
| **CRITICAL** | 1,454 | 4.85% | 1,454 | 4.85% | **EXACT MATCH** |
| **HIGH + CRITICAL** | 1,652 | 5.51% | 1,652 | 5.51% | **EXACT MATCH** |

### C. Retrospective AML Prevalence & Precision
| Tier / Queue | Reference AML Count | Reference Precision | Actual AML Count | Actual Precision | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **LOW** | 1,170 | 4.23% prev | 1,170 | 4.23% prev | **EXACT MATCH** |
| **MEDIUM** | 287 | 42.08% prev | 287 | 42.08% prev | **EXACT MATCH** |
| **HIGH** | 180 | 90.91% prev | 180 | 90.91% prev | **EXACT MATCH** |
| **CRITICAL** | 1,452 | 99.86% (2 FP) | 1,452 | 99.86% (2 FP) | **EXACT MATCH** |
| **HIGH + CRITICAL** | 1,632 | 98.79% (20 FP) | 1,632 | 98.79% (20 FP) | **EXACT MATCH** |

### D. Consensus Subgroups
| Subgroup | Reference Count | Reference Mean Score | Actual Count | Actual Mean Score | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Both Flagged** | 1,133 | ~91.90 | 1,133 | 91.90 | **MATCH** |
| **XGB-only** | 657 | ~75.83 | 657 | 75.83 | **MATCH** |
| **IF-only** | 2,171 | ~16.96 | 2,171 | 16.96 | **MATCH** |
| **Neither Flagged** | 26,039 | ~10.01 | 26,039 | 10.01 | **MATCH** |

### E. Numerical Tolerance
All numerical scores match within machine floating-point precision ($< 10^{-12}$). Category tiers and count metrics match with **0 tolerance (exact integer identity)**.

---

## 8. Test Execution Results

- **Existing Tests**: 51 passed.
- **New Inference Engine Tests** (`tests/test_inference.py`): 18 passed.
  1. `test_model_loading`: Verifies artifact deserialization and metadata.
  2. `test_model_loading_missing_config_fails`: Rejects missing configs safely.
  3. `test_feature_schema_validation`: Validates presence/absence of `transaction_id`.
  4. `test_missing_single_feature_rejection`: Rejects missing feature without imputation.
  5. `test_missing_multiple_features_rejection`: Reports all missing features clearly.
  6. `test_extra_unexpected_feature_rejection`: Rejects extraneous features.
  7. `test_raw_identifier_rejection`: Enforces raw identifier prohibition.
  8. `test_duplicate_feature_rejection`: Rejects duplicated column names.
  9. `test_feature_order_mismatch_rejection`: Rejects reordered columns.
  10. `test_nan_value_rejection`: Rejects NaN inputs.
  11. `test_infinite_value_rejection`: Rejects $\pm \infty$ inputs.
  12. `test_xgb_probability_generation`: Validates probability scaling.
  13. `test_isolation_forest_raw_score_generation`: Validates raw anomaly scores.
  14. `test_if_normalization_boundaries`: Validates all piecewise anchors ($<0.35, 0.35, 0.50, 0.70, >0.70$).
  15. `test_final_risk_score_calculation`: Validates 80/20 weighted combination and bounds.
  16. `test_risk_tier_boundaries`: Validates exact thresholds ($30, >30, 60, >60, 80, >80$).
  17. `test_deterministic_repeated_inference`: Proves reproducibility across calls.
  18. `test_oot_30k_evaluation_reproduction`: End-to-end OOT validation reproducing all Phase 4 reference values.
- **Total Suite**: **69 passed in 24.14s (100% pass rate)**.

---

## 9. Temporal Graph Feature Disclosure

> [!WARNING]
> **Static Full-Graph Network Representation Caveat**
> The topological graph features ingested by the models (`sender_pagerank_score`, `receiver_in_degree`, cycle flags, etc.) were computed over the complete static 150,000-transaction network topology $(:Account)-[:TRANSACTED_TO]->(:Account)$.
> - **Valid Operational Scope**: Fully sound for retrospective batch investigations, historical forensic audits, and offline compliance evaluations.
> - **Streaming Backtest Limitation**: These results are **not claimed as strict point-in-time causal streaming inference** without dynamic sliding temporal graph snapshots.

---

## 10. Conclusion & Recommendation

The isolated AML inference engine is complete, robustly tested, strictly validated against all reference benchmarks, and ready for future integration.

**Recommendation**: **READY FOR PHASE 5 STEP 2**
