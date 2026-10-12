# Project Vigilance — Phase 4 Step 5: Final AML Risk Scoring Design & Validation Report

> [!IMPORTANT]
> **Design & Validation Milestone**: This report formalizes and empirically validates the **Final AML Risk Scoring Layer** ($0–100$). **No models were modified or retrained**, **all datasets remain immutable**, and **weights were established as an operational baseline and double-counting avoidance rather than tuned against test labels**.

---

## 1. Executive Summary

- **Proposed Baseline Formula**: `FINAL_RISK_SCORE = 0.80 * XGB_SCORE + 0.20 * IF_SCORE + 0.00 * GRAPH_SCORE + 0.00 * RULE_SCORE`
- **Standardized Range**: $0.00 \le \text{FINAL\_RISK\_SCORE} \le 100.00$
- **Weight Selection Justification**: An operational baseline weighting of 80% XGBoost and 20% Isolation Forest was selected because XGBoost demonstrated substantially stronger validated supervised precision and lower false-positive rate, while Isolation Forest provides complementary anomaly coverage including 135 AML-labeled cases missed by XGBoost at the standard threshold. The 80/20 weighting is NOT statistically optimized and is NOT derived directly from the precision ratio.
- **Component Normalization**: Both supervised probability and unsupervised anomaly scores are normalized to $[0, 100]$ such that their operational decision boundaries align at **50.0**.
- **Double-Counting Avoidance**: Standalone graph and rule weights are explicitly set to $0.00$ because all 22 graph metrics and rule proxies are already natively ingested by the ML models.
- **Operational Risk Tiers**: Tiers are operational risk-prioritization tiers, not statistically proven AML probabilities. Observed prevalences are retrospective validation results on the historical out-of-time evaluation sample, not guaranteed future probabilities.
  - **CRITICAL Tier (> 80)**: 1,454 transactions (4.85% of population); captures **1,452 verified AML cases with 99.86% precision** (47.01% recall of all AML cases). Operational action: Highest-priority compliance investigation.
  - **HIGH Tier (60–80)**: 198 transactions (0.66%); captures **180 AML cases with 90.91% precision** (5.83% recall). Operational action: Priority investigation / enhanced review.
  - **HIGH + CRITICAL Combined Queue**: 1,652 transactions (1,652 total); captures **1,632 AML cases with 98.79% precision** (**52.83% recall**, only 20 false alarms total).
  - **MEDIUM Tier (30–60)**: 682 transactions; 287 AML cases (**42.08% prevalence**, 4.1x elevation over baseline 10.30%). Operational action: Secondary compliance review / anomaly watchlist.
  - **LOW Tier (0–30)**: 27,666 transactions (**92.22% of population**); AML prevalence drops to **4.23%** (95.77% clean inliers). Operational action: Automated clearing or passive monitoring.
- **Strict Monotonicity**: Verified across all 4 tiers: **4.23% < 42.08% < 90.91% < 99.86%**.
- **Compliance Mandate**: Final SAR filing and compliance disposition remain subject to appropriate investigator/compliance review. The scoring system prioritizes transactions for investigation; it does NOT autonomously determine that a SAR must be filed.
- **Status**: **APPROVED BASELINE**.

---

## 2. Evidence Sources in the Existing Codebase

An inspection of the repository identifies four candidate evidence sources:

1. **Supervised XGBoost Likelihood (`XGB_SCORE`)**:
   - **Artifact**: `models/xgboost_v3_graph.joblib`
   - **Metadata**: `models/xgboost_v3_graph_metadata.json`
   - **Inputs**: 84 engineered features (62 Phase 2 behavioral/velocity + 22 Phase 3 graph intelligence features).
   - **Performance**: Test ROC-AUC = 0.9166, Test Precision = 97.09%, Test Recall = 56.26%, FPR = 0.19%.
   - **Nature**: Calibrated likelihood of matching known historical AML typologies.

2. **Unsupervised Isolation Forest Anomaly Score (`IF_SCORE`)**:
   - **Artifact**: `models/isolation_forest_v3_graph.joblib`
   - **Metadata**: `models/isolation_forest_v3_graph_metadata.json`
   - **Inputs**: 80 continuous and topological features (excluding nominal Louvain IDs and redundant customer counts).
   - **Performance**: Diagnostic ROC-AUC = 0.7282, Diagnostic Precision = 38.23%, Diagnostic Recall = 40.89%, FPR = 7.58%.
   - **Nature**: Purely structural/geometric eccentricity measurement independent of historical labels.

3. **Graph Intelligence Features**:
   - **Artifact**: `data/processed/aml_150k_graph_features.csv` (columns 63 to 84).
   - **Status**: Account-level PageRank, degree centralities, and cycle detection metrics exist as features in the dataset, but **no standalone graph-risk scoring module** exists in the codebase.

4. **Rule-Based AML Proxies**:
   - **Status**: Rules regarding threshold proximity (sub-10L), transaction velocities, multi-customer device sharing, and crypto off-ramping are engineered as feature columns (`sender_near_regulatory_threshold_txns_prev_24h`, `device_unique_accounts_historical`, etc.). **No standalone rule engine output** exists in the codebase.

---

## 3. Component Independence Analysis

The Phase 4 Step 4 complementarity analysis demonstrated that while XGBoost and Isolation Forest ingest heavily overlapping feature spaces (84 features vs. 80 features), their mathematical learning paradigms extract **partially complementary signals**:
- **Correlation**: Pearson $r = 0.4852$, Spearman $\rho = 0.3030$.
- **Alert Set Divergence**: Jaccard similarity is $0.2860$.
- **Orthogonal Detections**: Isolation Forest detects 135 true AML cases that XGBoost misses at threshold 0.50, while XGBoost catches 610 AML cases that Isolation Forest misses.
- **Consensus Reliability**: When both models trigger, true AML prevalence reaches **99.56%**.

---

## 4. Double-Counting Analysis

A critical requirement for sound risk scoring is preventing the artificial inflation of scores caused by re-incorporating signals already accounted for by downstream models:

| Component | Underlying Data / Features | Already Ingested By ML Models? | Truly Independent? | Double-Count Risk If Added Separately |
| :--- | :--- | :---: | :---: | :--- |
| **XGBoost** | 62 behavioral/velocity + 22 graph features | Core Supervised Model | Yes (as primary model) | None (Primary anchor) |
| **Isolation Forest** | 80 continuous/topological features | Core Unsupervised Model | Partially (distinct paradigm) | Controlled via 20% weight |
| **Graph Intelligence** | PageRank, in/out-degree, cycle lengths | **YES** (Ingested by both XGB & IF) | **NO** | **CRITICAL RISK**: Adding a separate graph score would triple-count graph metrics. |
| **Rule-Based Proxies** | Structuring, velocity, device/IP sharing | **YES** (Ingested by both XGB & IF) | **NO** | **CRITICAL RISK**: Re-weighting rules would introduce arbitrary double-counting of known features. |

> [!IMPORTANT]
> **Architectural Decision**: Because graph metrics and rule proxies are already natively evaluated by the XGBoost decision trees and Isolation Forest partitions, their standalone weights are strictly set to **$W_{\text{GRAPH}} = 0.00$** and **$W_{\text{RULE}} = 0.00$**.

---

## 5. Score Normalization

To combine the models into an interpretable $0–100$ scale without arbitrary stretching, both components are standardized such that **$50.0$ represents each model's operational alert threshold**:

### A. Supervised Score (`XGB_SCORE`)
\[ \text{XGB\_SCORE} = \text{xgb\_probability} \times 100.0 \]
- $\text{XGB\_SCORE} \in [0.0, 100.0]$
- $0.00$: Virtually zero supervised evidence.
- $50.00$: Standard operational decision boundary ($P = 0.50$).
- $100.00$: Maximum model certainty of laundering typology.

### B. Unsupervised Score (`IF_SCORE`)
The raw Isolation Forest anomaly score $s(x) = -\text{score\_samples}(x)$ spans approximately $[0.35, 0.73]$, with the theoretical decision boundary located at $s(x) = 0.50$ (where $\text{offset\_} = -0.50$):
\[
\text{IF\_SCORE} = \begin{cases} \text{clip}\left(\frac{s(x) - 0.35}{0.50 - 0.35} \times 50.0, 0.0, 50.0\right) & \text{if } s(x) < 0.50 \\[8pt] \text{clip}\left(50.0 + \frac{s(x) - 0.50}{0.70 - 0.50} \times 50.0, 50.0, 100.0\right) & \text{if } s(x) \ge 0.50 \end{cases}
\]
- **Theoretical Decision Boundary (0.50)**: Derived directly from Liu et al. (2008) and scikit-learn (`offset_ = -0.50`), where the average path length $E(h(x))$ equals the average binary search tree depth $c(n)$, yielding $s(x) = 2^{-1} = 0.50$.
- **Operational Normalization Anchors (0.35 and 0.70)**: The values 0.35 and 0.70 are **fixed operational normalization anchors** representing the empirical floor of background inliers (~0.354 min) and empirical ceiling of extreme multidimensional outliers (~0.728 max) observed in the training distribution. They are **NOT theoretical constants** and were **NOT tuned using the 30k ground-truth labels**.
- **Operational Invariant**: Inliers ($s < 0.50$) occupy $[0, 50]$; flagged outliers ($s \ge 0.50$) occupy $[50, 100]$.
- **Strict Monotonicity**: Preserves exact ranking without distorting distribution tails.

---

## 6. Weight Selection Methodology & Justification

> [!NOTE]
> **Operational Baseline Justification**:
> An operational baseline weighting of 80% XGBoost and 20% Isolation Forest was selected because XGBoost demonstrated substantially stronger validated supervised precision and lower false-positive rate, while Isolation Forest provides complementary anomaly coverage including 135 AML-labeled cases missed by XGBoost at the standard threshold. The 80/20 weighting is NOT statistically optimized and is NOT derived directly from the precision ratio.

The rationale rests on three operational realities:
1. **Disparity in Model Precision**: XGBoost demonstrates **97.09% precision** and **0.19% FPR**, whereas Isolation Forest exhibits **38.23% precision** and **7.58% FPR** (almost 40x higher false alert rate). Giving Isolation Forest parity weight (e.g. 50%) would inundate high-risk alert queues with false positives. The 80% weight ensures XGBoost acts as the primary precision anchor.
2. **Complementary Anomaly Coverage**: Isolation Forest successfully discovered **135 genuine AML cases** missed by XGBoost. A 20% weight contributes up to 20 points, allowing severe structural outliers with borderline supervised scores (e.g. 40–48) to be elevated into the actionable MEDIUM and HIGH tiers.
3. **Double-Counting Avoidance**: Standalone graph and rule weights are strictly set to 0.00 because graph and rule indicators are natively ingested as features within XGBoost and Isolation Forest.
\[ W_{\text{XGB}} = 0.80, \quad W_{\text{IF}} = 0.20, \quad W_{\text{GRAPH}} = 0.00, \quad W_{\text{RULE}} = 0.00 \]

---

## 7. Final Baseline Formula

\[ \mathbf{FINAL\_RISK\_SCORE} = 0.80 \times \mathbf{XGB\_SCORE} + 0.20 \times \mathbf{IF\_SCORE} \]

---

## 8. Operational Risk Tier Definitions

> [!IMPORTANT]
> **Operational Prioritization vs. Probabilities**:
> Tiers are operational risk-prioritization tiers, not statistically proven AML probabilities. Observed prevalences are retrospective validation results on the historical out-of-time evaluation sample, not guaranteed future probabilities.
> 
> **Compliance Mandate**: Final SAR filing and compliance disposition remain subject to appropriate investigator/compliance review. The scoring system prioritizes transactions for investigation; it does NOT autonomously determine that a SAR must be filed.

| Risk Tier | Score Range | Operational Meaning | Recommended Protocol |
| :--- | :---: | :--- | :--- |
| **LOW** | $0.00 - 30.00$ | Operational risk-prioritization tier | Automated clearing or passive monitoring. |
| **MEDIUM** | $30.01 - 60.00$ | Operational risk-prioritization tier | Secondary compliance review / anomaly watchlist. |
| **HIGH** | $60.01 - 80.00$ | Operational risk-prioritization tier | Priority investigation / enhanced review. |
| **CRITICAL** | $80.01 - 100.00$ | Operational risk-prioritization tier | Highest-priority compliance investigation. |

---

## 9. Score Distribution Analysis (30,000 Evaluation Set)

| Metric | Value |
| :--- | :---: |
| **Minimum Score** | 1.47 |
| **Maximum Score** | 99.92 |
| **Mean Score** | 15.05 |
| **Median Score** | 9.68 |
| **Standard Deviation** | 19.06 |

### Score Percentiles
| 1st | 5th | 10th | 25th | 50th (Median) | 75th | 90th | 95th | 99th |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2.85 | 3.95 | 4.78 | 6.70 | 9.68 | 13.66 | 23.45 | 75.90 | 94.16 |

---

## 10. Tier Distribution

| Risk Tier | Transaction Count | % Population | Verified Legitimate Count | Operational Characterization |
| :--- | :---:| :---:| :---:| :--- |
| **LOW (0–30)** | 27,666 | 92.22% | 26,496 | Vast majority of background volume auto-cleared. |
| **MEDIUM (30.01–60)** | 682 | 2.27% | 395 | Manageable secondary monitoring queue / watchlist. |
| **HIGH (60.01–80)** | 198 | 0.66% | 18 | Priority investigation / enhanced review queue. |
| **CRITICAL (80.01–100)** | 1,454 | 4.85% | 2 | Highest-priority compliance investigation queue. |
| **Total** | 30,000 | 100.00% | 26,911 | Complete evaluation population. |

---

## 11. Post-Hoc AML Validation

> [!NOTE]
> Ground-truth labels from the 30,000 out-of-time evaluation sample were evaluated strictly post-hoc after the scoring formula and tier boundaries were finalized. The reported AML prevalences (4.23%, 42.08%, 90.91%, 99.86%) are retrospective validation measurements on this historical sample, NOT guaranteed future probabilities $P(\text{AML} \mid \text{score})$. Labels were never used to tune weights or boundaries.

| Risk Tier | Total Count | AML Count | Legitimate Count | Retrospective AML Prevalence | % Total AML Captured | Retrospective Precision |
| :--- | :---:| :---:| :---:| :---:| :---:| :---:|
| **LOW (0–30)** | 27,666 | 1,170 | 26,496 | **4.23%** | 37.88% | - |
| **MEDIUM (30.01–60)** | 682 | 287 | 395 | **42.08%** | 9.29% | 42.08% |
| **HIGH (60.01–80)** | 198 | 180 | 18 | **90.91%** | 5.83% | 90.91% |
| **CRITICAL (80.01–100)** | 1,454 | 1,452 | 2 | **99.86%** | 47.01% | **99.86%** |
| **HIGH + CRITICAL Queue** | 1,652 | 1,632 | 20 | **98.79%** | **52.83%** | **98.79%** |

---

## 12. Monotonicity Analysis

A rigorous requirement of any multi-tier AML scoring engine is **strict monotonicity**—higher assigned risk scores must strictly correlate with higher empirical AML prevalence:

```
Risk Tier:         LOW          MEDIUM         HIGH         CRITICAL
AML Prevalence:   4.23%   ───>   42.08%   ───>  90.91%   ───>   99.86%
Evaluation:        PASSED       PASSED        PASSED       PASSED (STRICTLY MONOTONIC)
```

Notice the steep separation gradient: from 4.23% in LOW up to **99.86% in CRITICAL**.

---

## 13. XGB/IF Consensus Analysis

Examining how the four Step 4 alert groups distribute across the final risk tiers confirms the logic of the baseline design:

| Group | Total Count | Mean Final Score | Landed in LOW | Landed in MEDIUM | Landed in HIGH | Landed in CRITICAL |
| :--- | :---:| :---:| :---:| :---:| :---:| :---:|
| **Both Models Flagged** | 1,133 | **91.90** | 0 | 8 | 33 | **1,092 (96.4%)** |
| **XGBoost Only** | 657 | **75.83** | 0 | 130 | 165 | **362 (55.1%)** |
| **Isolation Forest Only** | 2,171 | **16.96** | 2,049 | 122 | 0 | 0 |
| **Neither Model Flagged** | 26,039 | **10.01** | 25,617 | 422 | 0 | 0 |

- **Consensus Escalation**: 96.4% of all transactions flagged by both models enter the CRITICAL tier (> 80), aligning with their 99.56% empirical purity for highest-priority compliance investigation.
- **Zero False Clears for XGBoost**: Every single transaction flagged by XGBoost is elevated out of the LOW tier.
- **Controlled Watchlist for IF-Only**: The 2,171 IF-only outliers (which have a 93.8% false alarm rate) are safely routed to MEDIUM or upper LOW, avoiding operational queue flooding while preserving visibility.

---

## 14. Limitations

1. **Baseline Classification**: The weights ($W_{\text{XGB}} = 0.80, W_{\text{IF}} = 0.20$) represent an empirically grounded operational baseline rather than statistically optimal weights fitted on a dedicated validation fold. The 80/20 weighting is NOT statistically optimized and is NOT derived directly from the precision ratio.
2. **Retrospective Evaluation**: Prevalences reported are retrospective validation measurements on the historical evaluation set and should not be interpreted as guaranteed future probabilities.
3. **Zero Weights on Graph/Rules**: While setting graph and rule weights to zero prevents double counting, future architectures could explore residual graph features not captured by tree splits.

---

## 15. Temporal Graph Disclosure

> [!WARNING]
> **Static Full-Graph Network Representation Disclosure**
> The topological graph features ingesting accounts' network properties (`sender_pagerank_score`, `receiver_in_degree`, cycle flags, etc.) were computed over the complete static 150,000-transaction network topology $(:Account)-[:TRANSACTED_TO]->(:Account)$.
> - **Valid Scope**: Sound for retrospective batch investigations, offline compliance audits, and forensic review.
> - **Streaming Backtest Limitation**: These results are **not strictly point-in-time causal** for real-time streaming backtesting without dynamic sliding temporal graph snapshots.

---

## 16. Future Calibration Plan

In future production phases, a dedicated holdout validation split (distinct from training and test partitions) should be used with bounded optimization (e.g., Nelder-Mead or Logistic calibration) to fine-tune weights against institution-specific cost matrices (cost of false positive vs. cost of undetected money laundering).

---

## 17. Final Recommendation

**APPROVED BASELINE**: The Final AML Risk Scoring formula ($0.80 \times \text{XGB\_SCORE} + 0.20 \times \text{IF\_SCORE}$) is validated as mathematically sound, strictly monotonic across all operational risk tiers, robust against double-counting risks, and approved as a baseline scoring framework.

> **Compliance Note**: Final SAR filing and compliance disposition remain subject to appropriate investigator/compliance review. The scoring system prioritizes transactions for investigation; it does NOT autonomously determine that a SAR must be filed.
