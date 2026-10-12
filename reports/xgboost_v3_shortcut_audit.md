# Project Vigilance — Phase 4: Model Training
## Step 2: XGBoost Shortcut & Sanity Audit Report

**Target Model Artifact**: `models/xgboost_v3_graph.joblib`  
**Model Metadata**: `models/xgboost_v3_graph_metadata.json`  
**Dataset Under Audit**: `data/processed/aml_150k_graph_features.csv` (150,000 rows $\times$ 98 columns)  
**Ground Truth Source**: `data/training/aml_150k_v2_ground_truth.csv` (150,000 rows)  
**Audit Date**: 2026-10-06  

---

### 1. Executive Summary & Audit Verdict

> [!IMPORTANT]
> **FINAL AUDIT VERDICT: CATEGORY A — NO SIGNIFICANT SHORTCUT DETECTED**
> 
> An exhaustive technical audit was conducted to investigate whether the high performance of `xgboost_v3_graph` (Test ROC-AUC: 0.9166, Precision: 97.09%) was driven by an artificial artifact or feature shortcut—specifically focusing on the #1 gain feature `ip_txn_count_prev_1h` and the historical amount range distributions.
> 
> **Key Findings**:
> 1. **Temporal Correctness**: `ip_txn_count_prev_1h` strictly excludes the current transaction ($t_k$) and all future transactions ($t > t_k$). It uses pure past historical data within a 3600-second window.
> 2. **No Artificial Separation**: 44.9% of AML transactions have `ip_txn_count_prev_1h == 0`, and 2.1% of legitimate transactions have $> 0$. The feature range $[0, 5]$ is identical across both classes.
> 3. **Single-Feature Classifier Insufficiency**: A threshold rule on `ip_txn_count_prev_1h` alone achieves only 0.7683 ROC-AUC and 0.6355 F1, confirming that this feature alone cannot explain model performance.
> 4. **No Amount Range Artifact**: The synthetic non-overlapping amount range problem from legacy Phase 0 datasets is completely absent. Both legitimate and AML transactions span $[98.70, 1.48\text{M}]$.
> 5. **Robust Ablation Stability**: When `ip_txn_count_prev_1h` is completely removed, model ROC-AUC remains at **0.9089**. When the **top 5 behavioral features are removed simultaneously**, the model still maintains **0.9050 ROC-AUC** and **0.7170 PR-AUC**, demonstrating that predictive signal is genuinely distributed across multiple diverse features.

---

### 2. Temporal Correctness of Historical Features

The implementation in [`ml-service/app/features/infrastructure_features.py`](file:///D:/Projects/AI%20Powered%20AML%20detection%20system/Project%20codebase/ml-service/app/features/infrastructure_features.py) was audited line-by-line:

```python
# Lines 76-80 in infrastructure_features.py
t_k = g_ts[k]
# 1h Window
j_1h = np.searchsorted(g_ts[:k], t_k - 3600, side="left")
vel_1h[idxs[k]] = k - j_1h
```

**Audit Confirmations**:
1. **Strictly Past-Looking**: The search slice `g_ts[:k]` terminates at index $k-1$.
2. **Current Transaction Excluded**: The transaction at index $k$ is not included in the window calculation.
3. **Future Transactions Excluded**: No future timestamp is ever accessible to `searchsorted`.
4. **Zero Ground-Truth Access**: Ground-truth labels are never imported, loaded, or referenced.
5. **No Test-to-Train Leakage**: The dataset is sorted strictly by `[timestamp, transaction_id]` prior to feature extraction.
6. **Unit Test Verification**: Existing unit tests in `tests/test_features.py` (`test_no_future_data_leakage`, `test_current_transaction_is_excluded`) explicitly verify this implementation.

---

### 3. `ip_txn_count_prev_1h` Distribution Analysis

Evaluated on the exact chronological partition (first 120,000 train / last 30,000 test):

| Metric | Training Legit (0) | Training AML (1) | Test Legit (0) | Test AML (1) |
| :--- | :---: | :---: | :---: | :---: |
| **Transaction Count** | 105,089 | 14,911 | 26,911 | 3,089 |
| **Mean** | 0.0215 | 1.0538 | 0.0222 | 1.0437 |
| **Median** | 0.0 | 1.0 | 0.0 | 1.0 |
| **Std Dev** | 0.1582 | 1.1217 | 0.1593 | 1.1286 |
| **Min** | 0 | 0 | 0 | 0 |
| **25th Percentile** | 0.0 | 0.0 | 0.0 | 0.0 |
| **75th Percentile** | 0.0 | 2.0 | 0.0 | 2.0 |
| **90th Percentile** | 0.0 | 3.0 | 0.0 | 3.0 |
| **Max** | 5 | 5 | 4 | 5 |
| **Count == 0** | **97.98%** (102,966) | **44.01%** (6,563) | **97.90%** (26,346) | **44.90%** (1,387) |
| **Count > 0** | **2.02%** (2,123) | **55.99%** (8,348) | **2.10%** (565) | **55.10%** (1,702) |
| **Count $\ge$ 5** | 1 txn | 1 txn | 0 txns | 3 txns |

**Key Takeaways**:
- **Huge Mass at Zero**: Nearly half (44.90%) of AML transactions have `ip_txn_count_prev_1h == 0`.
- **Legitimate Bursting**: 565 legitimate transactions in the test set had `ip_txn_count_prev_1h > 0`.
- **Complete Range Overlap**: Both classes span $[0, 5]$.

---

### 4. Artificial Threshold Separation Analysis

To test whether a single threshold on `ip_txn_count_prev_1h` could replicate the model:

| Threshold Rule | Test Accuracy | Test Precision | Test Recall | Test F1 | Test ROC-AUC |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ip_txn_count_prev_1h >= 1` | 93.49% | 75.08% | 55.10% | 0.6355 | 0.7683 |
| `ip_txn_count_prev_1h >= 2` | 93.08% | 98.10% | 33.41% | 0.4984 | 0.7683 |
| `ip_txn_count_prev_1h >= 3` | 91.23% | 97.91% | 15.15% | 0.2624 | 0.7683 |
| `ip_txn_count_prev_1h >= 5` | 89.71% | 100.0% | 0.10% | 0.0019 | 0.7683 |
| **Full XGBoost Model (84 Feat)** | **95.32%** | **97.09%** | **56.26%** | **0.7124** | **0.9166** |

**Conclusion**: The single-feature classifier achieves only 0.7683 ROC-AUC versus 0.9166 for XGBoost. The feature is strong, but far from explaining the model's predictive power on its own.

---

### 5. Top Feature Stability & Overlap Analysis

Inspected the top 10 XGBoost features by gain across legitimate and AML populations:

| Feature Name | Legit (0) Range | AML (1) Range | Overlap Range | Overlap Assessment |
| :--- | :---: | :---: | :---: | :--- |
| `ip_txn_count_prev_1h` | [0.00, 5.00] | [0.00, 5.00] | [0.00, 5.00] | **Substantial overlap** |
| `receiver_txn_count_prev_1h` | [0.00, 4.00] | [0.00, 4.00] | [0.00, 4.00] | **Substantial overlap** |
| `channel_UPI` | [0, 1] | [0, 1] | [0, 1] | **Substantial overlap** |
| `receiver_unique_senders_prev_1h` | [0.00, 4.00] | [0.00, 4.00] | [0.00, 4.00] | **Substantial overlap** |
| `receiver_amount_sum_prev_1h` | [0.00, 2.78M] | [0.00, 3.58M] | [0.00, 2.78M] | **Substantial overlap** |
| `channel_Crypto_Gateway` | [0, 1] | [0, 1] | [0, 1] | **Substantial overlap** |
| `channel_IMPS` | [0, 1] | [0, 1] | [0, 1] | **Substantial overlap** |
| `log_amount` | [4.62, 14.21] | [4.60, 14.21] | [4.62, 14.21] | **Substantial overlap** |
| `amount` | [100.22, 1.48M] | [98.70, 1.48M] | [100.22, 1.48M] | **Substantial overlap** |
| `receiver_unique_senders_prev_24h` | [0.00, 8.00] | [0.00, 7.00] | [0.00, 7.00] | **Substantial overlap** |

**Conclusion**: Zero top features exhibit disjoint or artificial separation boundaries.

---

### 6. Amount / `log_amount` Shortcut Check

Audit of transaction amounts confirmed that the legacy synthetic artifact has been completely eliminated:

| Partition / Feature | Legit (Class 0) | AML (Class 1) | Overlap Range |
| :--- | :---: | :---: | :---: |
| **Train `amount`** | [100.22, 1,484,993.73] | [98.70, 1,484,940.04] | **[100.22, 1,484,940.04]** |
| **Train `log_amount`** | [4.62, 14.21] | [4.60, 14.21] | **[4.62, 14.21]** |
| **Test `amount`** | [104.71, 1,484,854.61] | [134.97, 1,482,651.30] | **[134.97, 1,482,651.30]** |
| **Test `log_amount`** | [4.66, 14.21] | [4.91, 14.21] | **[4.91, 14.21]** |

- Median amount in Legit is ₹59,707 vs ₹96,600 in AML (higher typical volume, but continuous and overlapping across the full distribution).
- **Verdict**: No artificial amount boundary detected.

---

### 7. Categorical Feature Analysis

| Channel / Currency Feature | Total Transaction Count | AML Count | AML Incident Rate |
| :--- | :---: | :---: | :---: |
| `channel_UPI` | 44,829 | 2,370 | 5.29% |
| `channel_Crypto_Gateway` | 21,311 | 1,500 | 7.04% |
| `channel_IMPS` | 37,221 | 6,887 | 18.50% |
| `channel_NEFT` | 22,045 | 3,948 | 17.91% |
| `channel_RTGS` | 18,134 | 2,382 | 13.14% |
| `channel_Card` | 6,460 | 913 | 14.13% |
| `is_crypto` / `currency_USDT` | 21,311 | 1,500 | 7.04% |
| `currency_INR` | 128,689 | 16,500 | 12.82% |

- Every channel exhibits a balanced mix of legitimate and suspicious flows (rates between 5.29% and 18.50%).
- **Verdict**: No categorical shortcut exists.

---

### 8. Graph Feature Sanity Check

| Graph Feature | Legit Mean | AML Mean | AML Signal Dynamics |
| :--- | :---: | :---: | :--- |
| `sender_in_degree` | 4.9989 | 5.4600 | Modest transit elevation |
| `sender_out_degree` | 5.9908 | 6.3541 | Higher velocity out of mule accounts |
| `receiver_in_degree` | 6.0007 | **7.7506** | **High-density mule destination fan-in** |
| `receiver_out_degree` | 5.0020 | 5.4368 | Rapid aggregation and pass-through |
| `receiver_total_cycle_count` | 0.0314 | **0.0500** | **Elevated circular layering participation** |
| `receiver_pagerank_score` | 1.0884 | **1.3525** | **Elevated structural network prestige** |

- Graph features provide clean topological differentiation without degenerate spikes.

---

### 9. Diagnostic Ablation Experiments

To definitively verify model resilience, two diagnostic models were trained on the exact same 120,000 chronological train set and evaluated on the untouched 30,000 test set:

| Model Configuration | Active Features | Test ROC-AUC | Test PR-AUC | Test Accuracy | Test Precision | Test Recall | Test F1 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Approved Baseline Model** | **84** | **0.9166** | **0.7677** | **95.32%** | **97.09%** | **56.26%** | **0.7124** |
| **Diagnostic 1 (Drop `ip_txn_count_prev_1h`)** | **83** | **0.9089** | **0.7369** | **94.56%** | **93.75%** | **50.53%** | **0.6567** |
| **Diagnostic 2 (Drop Top 5 Features)** | **79** | **0.9050** | **0.7170** | **94.15%** | **92.21%** | **47.13%** | **0.6238** |

*Dropped in Diagnostic 2: `ip_txn_count_prev_1h`, `receiver_txn_count_prev_1h`, `channel_UPI`, `receiver_unique_senders_prev_1h`, `receiver_amount_sum_prev_1h`.*

**Ablation Takeaways**:
1. Dropping `ip_txn_count_prev_1h` reduces ROC-AUC by only **0.0077** (from 0.9166 to 0.9089).
2. Dropping all top 5 behavioral features still preserves an ROC-AUC of **0.9050** and a PR-AUC of **0.7170** (7.0x above random baseline).
3. The remaining 79 features (infrastructure reuse, historical amounts, device counts, and graph topology) independently sustain strong predictive performance.

---

### 10. Final Conclusion & Recommendations

#### Final Verdict: **CATEGORY A — NO SIGNIFICANT SHORTCUT DETECTED**
- **Leakage Found**: **None.**
- **`ip_txn_count_prev_1h` Validity**: Legitimate historical behavioral velocity signal.
- **Amount Range Separation**: **Eliminated.** Full continuous overlap across ₹100 to ₹1.48M.
- **Model Stability**: Resilient across feature ablations; not over-dependent on any single feature.

#### Operational Recommendations:
1. Retain the approved `xgboost_v3_graph.joblib` model artifact without modification.
2. In production API serving, ensure that real-time feature computation uses strict rolling Redis / event-store windows to replicate the offline calculation of `ip_txn_count_prev_1h`.
3. Proceed to Phase 4 Step 3 (Unsupervised Isolation Forest training) under the approved readiness roadmap.
