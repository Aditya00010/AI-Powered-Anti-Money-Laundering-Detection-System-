# Project Vigilance — Phase 4 Step 4: XGBoost + Isolation Forest Complementarity Analysis

> [!IMPORTANT]
> **Analysis-Only Step**: This evaluation establishes whether the supervised XGBoost model and unsupervised Isolation Forest model provide redundant or complementary detection signals. **No models were modified or retrained**, **no risk scores or ensemble weights were calculated**, and **all datasets remain immutable**.

---

## 1. Executive Summary

A rigorous empirical comparison of the supervised XGBoost model (`models/xgboost_v3_graph.joblib`) and the unsupervised Isolation Forest model (`models/isolation_forest_v3_graph.joblib`) on the untouched 30,000-transaction chronological evaluation set demonstrates that the two architectures provide **partially complementary** AML detection capabilities:

- **Score Correlation**: Pearson $r = 0.4852$ (moderate linear relationship), Spearman $\rho = 0.3030$ (low-to-moderate monotonic ranking alignment).
- **Alert Population Overlap**: Out of 3,961 total unique alerted transactions across both models, 1,133 were flagged by both (Jaccard similarity = **0.2860**).
- **High-Confidence Intersection**: When both models trigger an alert (1,133 transactions), the true AML rate is **99.56%** (1,128 verified AML cases, only 5 false alerts).
- **Complementary Detection**: Isolation Forest identifies **135 ground-truth AML transactions** that XGBoost completely misses at its standard 0.50 threshold (+4.37% absolute AML recall gain), while XGBoost identifies **610 AML transactions** missed by Isolation Forest.
- **Combined Union Coverage**: Alerting on either model captures **1,873 out of 3,089 AML cases (60.63%)**, boosting overall recall above both individual models (XGBoost solo: 56.26%, IF solo: 40.89%).
- **Final Classification**: **B — Partially Complementary**.

---

## 2. Model Inputs & Architectural Roles

| Attribute | Supervised Model: XGBoost | Unsupervised Model: Isolation Forest |
| :--- | :--- | :--- |
| **Artifact Path** | `models/xgboost_v3_graph.joblib` | `models/isolation_forest_v3_graph.joblib` |
| **Metadata Path** | `models/xgboost_v3_graph_metadata.json` | `models/isolation_forest_v3_graph_metadata.json` |
| **Learning Paradigm** | Supervised gradient-boosted decision trees | Unsupervised recursive partitioning ensemble |
| **Feature Count** | 84 features (62 Phase 2 + 22 Graph) | 80 features (62 Phase 2 + 18 Graph) |
| **Feature Exclusions** | 14 raw metadata/identifiers | 14 raw identifiers + 2 Louvain IDs + 2 redundant count columns |
| **Primary Detection Role** | Identifies known historical typologies via calibrated class likelihood | Detects structural/behavioral outliers independent of historical labels |
| **Inference Metric** | $P(\text{AML} \mid \text{XGBoost}) \in [0, 1]$ | $\text{anomaly\_score} = -\text{score\_samples}(x) \in (0, 1)$ |

---

## 3. Evaluation Population

- **Evaluation Partition**: Final 30,000 chronological transactions (indices 120,000 to 149,999 of `data/processed/aml_150k_graph_features.csv`).
- **Total Evaluation Transactions**: 30,000
- **Ground-Truth AML Transactions**: 3,089 (10.30%)
- **Ground-Truth Legitimate Transactions**: 26,911 (89.70%)
- **Label Handling**: Ground-truth labels from `data/training/aml_150k_v2_ground_truth.csv` were merged strictly by `transaction_id` solely for post-hoc diagnostic measurement.

---

## 4. Score Generation & Calibration

Both models generated scores across all 30,000 evaluation records with 0 missing values and 100% ID alignment:
1. **XGBoost Probability (`xgb_probability`)**: Extracted from `predict_proba(X)[:, 1]`. Standard operational decision threshold: $\ge 0.50$.
2. **Isolation Forest Anomaly Score (`isolation_anomaly_score`)**: Computed as $-\text{score\_samples}(x)$ (Liu et al. 2008 path length score). Standard decision threshold: $\text{decision\_function}(x) < 0$ (equivalent to $\text{anomaly\_score} \ge 0.5000$ at $\text{offset\_} = -0.50$).

---

## 5. Score Correlation Analysis

| Metric | Coefficient | Interpretation |
| :--- | :---: | :--- |
| **Pearson Correlation ($r$)** | **0.4852** | Moderate linear correlation. Demonstrates shared sensitivity to major financial velocity/graph anomalies while maintaining distinct variance. |
| **Spearman Rank Correlation ($\rho$)** | **0.3030** | Low-to-moderate monotonic ranking correlation. Indicates substantial divergence in transaction risk prioritization across the full population. |

> [!NOTE]
> If the models were **redundant**, Pearson $r$ would exceed $0.85$ and Spearman $\rho$ would exceed $0.80$. If they were **purely uncorrelated noise**, $r \approx 0$. The observed values ($r = 0.4852, \rho = 0.3030$) confirm that each model contributes non-overlapping variance.

---

## 6. XGBoost Alert Analysis (Threshold $\ge 0.50$)

| Metric | Value |
| :--- | :---: |
| **Transactions Flagged** | 1,790 (5.97%) |
| **True AML Cases Captured** | 1,738 |
| **Legitimate Cases Flagged (FP)** | 52 |
| **Diagnostic Precision** | **97.09%** |
| **Diagnostic Recall** | **56.26%** |
| **False Positive Rate (FPR)** | **0.19%** |

---

## 7. Isolation Forest Alert Analysis (Approved Offset $\le 0$ / Score $\ge 0.50$)

| Metric | Value |
| :--- | :---: |
| **Transactions Flagged** | 3,304 (11.01%) |
| **True AML Cases Captured** | 1,263 |
| **Legitimate Cases Flagged (FP)** | 2,041 |
| **Diagnostic Precision** | **38.23%** |
| **Diagnostic Recall** | **40.89%** |
| **False Positive Rate (FPR)** | **7.58%** |

---

## 8. Four-Way Alert Overlap

The 30,000 evaluation transactions partition into four mutually exclusive alert quadrants:

| Group | Definition | Count | % Population | AML | Legit | AML Rate | % of Total AML Captured |
| :--- | :--- | :---:| :---:| :---:| :---:| :---:| :---:|
| **Group 1: XGBoost Only** | `XGB=1, IF=0` | 657 | 2.19% | 610 | 47 | 92.85% | 19.75% |
| **Group 2: Isolation Forest Only** | `XGB=0, IF=1` | 2,171 | 7.24% | 135 | 2,036 | 6.22% | 4.37% |
| **Group 3: Both Models** | `XGB=1, IF=1` | 1,133 | 3.78% | 1,128 | 5 | **99.56%** | **36.52%** |
| **Group 4: Neither Model** | `XGB=0, IF=0` | 26,039 | 86.80% | 1,216 | 24,823 | 4.67% | 39.37% |
| **Total Evaluation** | - | 30,000 | 100.00% | 3,089 | 26,911 | 10.30% | 100.00% |

---

## 9. Venn / Overlap Statistics

| Overlap Metric | Value | Operational Implication |
| :--- | :---: | :--- |
| **XGBoost Flagged Count** | 1,790 | Conservative high-precision supervised alert queue. |
| **Isolation Forest Flagged Count** | 3,304 | Broader structural anomaly queue. |
| **Intersection Count (Both Flagged)** | 1,133 | High-confidence tier (1,128 AML cases, 5 false alarms). |
| **Union Count (Either Flagged)** | 3,961 | Total alert volume if models operate in OR-logic. |
| **Jaccard Similarity** | **0.2860** | Substantial divergence; alert sets are far from identical. |
| **XGBoost Overlap with IF** | **63.30%** | 63.30% of XGBoost alerts are verified as top structural anomalies. |
| **Isolation Forest Overlap with XGBoost** | **34.29%** | 34.29% of IF anomalies meet the strict XGBoost supervised threshold. |

---

## 10. Complementary AML Detection Analysis

A critical test of complementarity is whether Isolation Forest identifies genuine AML cases that XGBoost misses:

- **AML Cases Detected ONLY by XGBoost**: **610 cases (19.75%)**
  - These represent subtler typologies that do not manifest extreme multidimensional geometric eccentricity, but exhibit learned supervised interaction patterns.
- **AML Cases Detected ONLY by Isolation Forest**: **135 cases (4.37%)**
  - These 135 transactions were scored below 0.50 by XGBoost (and thus missed by the primary supervised filter), but were successfully isolated as top-tier structural outliers by Isolation Forest.
- **AML Cases Detected by BOTH Models**: **1,128 cases (36.52%)**
  - The robust core of severe laundering patterns. Notice the alert purity in this consensus subset: **99.56%**.
- **AML Cases Detected by NEITHER Model**: **1,216 cases (39.37%)**
  - Low-velocity, non-outlier laundering transactions that evade both standard tree cutoffs.

---

## 11. Score-Bin Analysis

### A. Isolation Forest Behavior Across XGBoost Probability Deciles

| XGB Probability Bin | Count | Mean IF Score | Median IF Score | AML Count | AML Prevalence |
| :--- | :---:| :---:| :---:| :---:| :---:|
| `0.00–0.10` | 24,299 | 0.4442 | 0.4394 | 724 | 2.98% |
| `0.10–0.20` | 2,736 | 0.4533 | 0.4486 | 294 | 10.75% |
| `0.20–0.30` | 730 | 0.4607 | 0.4569 | 173 | 23.70% |
| `0.30–0.40` | 307 | 0.4635 | 0.4592 | 88 | 28.66% |
| `0.40–0.50` | 138 | 0.4565 | 0.4519 | 72 | 52.17% |
| `0.50–0.60` | 96 | 0.4558 | 0.4537 | 67 | 69.79% |
| `0.60–0.70` | 72 | 0.4509 | 0.4476 | 65 | 90.28% |
| `0.70–0.80` | 77 | 0.4613 | 0.4608 | 70 | 90.91% |
| `0.80–0.90` | 87 | 0.4659 | 0.4642 | 80 | 91.95% |
| `0.90–1.00` | 1,458 | 0.5399 | 0.5375 | 1,456 | 99.86% |

### B. XGBoost Behavior Across Isolation Forest Anomaly Score Ranges

| IF Anomaly Score Bin | Count | Mean XGB Prob | Median XGB Prob | AML Count | AML Prevalence |
| :--- | :---:| :---:| :---:| :---:| :---:|
| `0.30–0.40` | 1,979 | 0.0367 | 0.0127 | 67 | 3.39% |
| `0.40–0.45` | 15,133 | 0.0563 | 0.0291 | 857 | 5.66% |
| `0.45–0.48` | 7,014 | 0.0892 | 0.0407 | 576 | 8.21% |
| `0.48–0.50` | 2,570 | 0.1305 | 0.0484 | 326 | 12.68% |
| `0.50–0.52` | 1,368 | 0.2054 | 0.0563 | 286 | 20.91% |
| `0.52–0.55` | 1,062 | 0.3415 | 0.0815 | 352 | 33.15% |
| `0.55–0.60` | 644 | 0.6364 | 0.9961 | 406 | 63.04% |
| `0.60–0.65` | 174 | 0.9342 | 0.9986 | 163 | 93.68% |
| `0.65–0.75` | 56 | 0.9981 | 0.9984 | 56 | 100.00% |

---

## 12. Model Disagreement Analysis

| Disagreement Category | Criteria | Transactions | AML Count | AML Rate | Characterization |
| :--- | :--- | :---:| :---:| :---:| :--- |
| **High XGB / High IF (Consensus)** | `XGB >= 0.50, IF >= 0.50` | 1,133 | 1,128 | **99.56%** | Definitive laundering; severe multi-feature and topological anomaly. |
| **High XGB / Low IF (Supervised Solo)** | `XGB >= 0.50, IF < 0.50` | 657 | 610 | **92.85%** | Pattern-specific laundering with moderate baseline values. |
| **Low XGB / High IF (Outlier Solo)** | `XGB < 0.50, IF >= 0.50` | 2,171 | 135 | **6.22%** | Unusual geometric/infrastructure outlier; candidate novel/unseen typology. |
| **Low XGB / Low IF (Inliers)** | `XGB < 0.50, IF < 0.50` | 26,039 | 1,216 | **4.67%** | Predominantly benign transactions (95.3% legitimate). |

---

## 13. Ground-Truth Score Distributions (Post-Hoc Diagnostic)

| Statistic | XGBoost Prob (Legitimate) | XGBoost Prob (AML) | IF Anomaly Score (Legitimate) | IF Anomaly Score (AML) |
| :--- | :---:| :---:| :---:| :---:|
| **Mean** | 0.0492 | 0.5935 | 0.4455 | 0.4935 |
| **Median** | 0.0308 | 0.7868 | 0.4407 | 0.4834 |
| **Std Dev** | 0.0654 | 0.4162 | 0.0355 | 0.0642 |
| **25th Percentile** | 0.0059 | 0.1106 | 0.4197 | 0.4426 |
| **75th Percentile** | 0.0651 | 0.9978 | 0.4661 | 0.5365 |
| **90th Percentile** | 0.1130 | 0.9991 | 0.4930 | 0.5862 |
| **95th Percentile** | 0.1616 | 0.9993 | 0.5108 | 0.6097 |
| **99th Percentile** | 0.3187 | 0.9996 | 0.5488 | 0.6674 |

---

## 14. Interpretation

1. **Non-Redundancy**: The moderate correlations ($r = 0.4852, \rho = 0.3030$) and low Jaccard index ($0.2860$) definitively refute hypothesis A (Highly Redundant). The models do not mirror each other.
2. **Distinct Behavioral Sensitivities**: XGBoost excels at identifying structured patterns matching known labels, producing razor-sharp precision (97.09% standalone). Isolation Forest acts as a wide-aperture lens sensitive to high-dimensional dispersion, discovering 135 AML cases that fell below XGBoost's supervised threshold.
3. **Exceptional Precision in Agreement**: In the consensus region where both models agree, precision reaches an unprecedented **99.56%** (1,128 / 1,133). This provides an optimal anchor for prioritized automated filing of Suspicious Activity Reports (SARs).

---

## 15. Recommendation for Ensemble Design

The empirical findings strongly support an ensemble design incorporating both signals:
1. **Tiered / Multi-Modal Fusion**: Rather than naive unweighted averaging, an ensemble risk score should exploit the high-confidence intersection (`Both = 1` $\rightarrow$ Critical Alert) while assigning a moderated secondary investigation queue to the `IF-only` outliers.
2. **Complementary Weighting**: Supervised XGBoost should carry primary weight for operational alert generation due to its 97% precision, while Isolation Forest should provide anomaly boosting and zero-day defense.

---

## 16. Important Temporal Disclosure

> [!WARNING]
> **Full-Network Static Graph Features Disclosure**
> As established throughout Phase 3 and Phase 4, the topological graph features utilized by both models were computed over the complete static 150,000-transaction network graph $(:Account)-[:TRANSACTED_TO]->(:Account)$.
> - **Valid Scope**: Retrospective batch transaction monitoring, forensic investigations, and offline risk scoring.
> - **Streaming Limitation**: These results are **not strictly point-in-time causal** for real-time streaming backtesting without dynamic sliding graph snapshots.

---

## 17. Final Conclusion

**CATEGORY B — PARTIALLY COMPLEMENTARY**

Based on comprehensive analysis of score correlations ($r = 0.4852, \rho = 0.3030$), alert overlap (Jaccard = $0.2860$), mutually exclusive AML detection (XGB-only: 610, IF-only: 135), consensus purity (99.56%), and score-bin cross-distributions, XGBoost and Isolation Forest are classified as **Partially Complementary**.
