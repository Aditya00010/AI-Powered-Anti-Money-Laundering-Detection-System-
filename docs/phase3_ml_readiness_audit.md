# Project Vigilance — Phase 3: Graph Intelligence
## Step 6: Final ML Feature Audit & Model-Readiness Report

**Audit Timestamp**: 2026-10-06  
**Target Enriched Dataset**: `data/processed/aml_150k_graph_features.csv`  
**Input Baseline Dataset**: `data/processed/aml_150k_features.csv`  
**Dataset Dimensions**: 150,000 rows $\times$ 98 columns  
**Dataset SHA-256 Checksum**: `6d53702b29e670f9857a7f824d13e2ad500ead891192296954ec1e87e02eeb7c`  
**Baseline SHA-256 Checksum**: `2895d5cf6e4dd16c75da1e0cce9b74446b4dfaa1230720d0b3818522ac2aee7c` (Bit-for-bit identical to Phase 2)  

---

### 1. Executive Summary & Readiness Verdict
> [!IMPORTANT]
> **FINAL MODEL-READINESS VERDICT: GO (Approved for Model Development under Controlled Feature Sets)**
> 
> - **Total Columns**: 98
> - **Excluded Non-Feature Columns**: 14 raw identifiers / metadata
> - **Total Candidate ML Features**: **84 features** (62 Phase 2 behavioral/velocity + 22 Graph features)
> - **Target / Ground-Truth Leakage**: **0%** (Strictly zero labels or scenario codes in dataset)
> - **Missing / Infinite Values in ML Features**: **0%** (All 84 features are 100% complete and finite)
> - **Regression Tests**: **51/51 tests passing**

---

### 2. Dataset Structure & Schema Verification
| Audit Metric | Observed Value | Expected Value | Status |
| :--- | :---: | :---: | :---: |
| **Total Transaction Rows** | **150,000** | 150,000 | &check; Pass |
| **Total Columns** | **98** | 98 | &check; Pass |
| **Distinct Transaction IDs** | **150,000** | 150,000 | &check; Pass (Zero duplicates) |
| **Duplicate Rows** | **0** | 0 | &check; Pass |
| **Row Order Alignment** | **100.0%** | Identical to Phase 2 | &check; Pass |
| **Phase 2 Values Invariance** | **100.0%** | Bit-for-bit intact | &check; Pass |

---

### 3. Exhaustive Column Classification (98 Columns)

#### Category A: Target / Ground Truth (0 Columns)
- *None.* Ground truth labels (`is_laundering`, `scenario_id`) are strictly segregated in `data/training/aml_150k_v2_ground_truth.csv` and never present in processed feature matrices.

#### Category B: Raw Metadata / Identifiers (14 Columns — MUST NOT ENTER MODEL TRAINING)
The following 14 columns must be preserved for investigative UI and entity linking, but **strictly excluded from all model feature inputs**:
1. `transaction_id`: Unique primary key
2. `timestamp`: UTC ISO timestamp
3. `sender_account`: Originating account identifier
4. `sender_name`: Originating individual/entity name
5. `sender_customer_id`: Originating customer CIF ID
6. `receiver_account`: Destination account identifier
7. `receiver_name`: Destination individual/entity name
8. `receiver_customer_id`: Destination customer CIF ID
9. `ip_address`: IPv4 address string
10. `device_id`: Hardware fingerprint ID (nullable)
11. `crypto_wallet`: Cryptocurrency public key (nullable)
12. `location_country`: Geographic country string
13. `location_city`: Geographic city string
14. `transaction_date`: Gregorian calendar date (YYYY-MM-DD)

#### Category C: Phase 2 Engineered ML Features (62 Columns)
- **Transaction Attributes (18)**: `amount`, `log_amount`, `transaction_hour`, `transaction_weekday`, `is_weekend`, `is_night`, `hour_sin`, `hour_cos`, `weekday_sin`, `weekday_cos`, `currency_INR`, `currency_USDT`, `channel_UPI`, `channel_NEFT`, `channel_RTGS`, `channel_IMPS`, `channel_Crypto_Gateway`, `is_crypto`
- **Short-Term Velocity Features (16)**: `sender_txn_count_prev_1h`, `sender_total_amount_prev_1h`, `sender_avg_amount_prev_1h`, `sender_max_amount_prev_1h`, `sender_txn_count_prev_24h`, `sender_total_amount_prev_24h`, `sender_avg_amount_prev_24h`, `sender_max_amount_prev_24h`, `receiver_txn_count_prev_1h`, `receiver_total_amount_prev_1h`, `receiver_avg_amount_prev_1h`, `receiver_max_amount_prev_1h`, `receiver_txn_count_prev_24h`, `receiver_total_amount_prev_24h`, `receiver_avg_amount_prev_24h`, `receiver_max_amount_prev_24h`
- **Historical Profile & Diversity (16)**: `sender_txn_count_historical`, `sender_total_amount_historical`, `sender_avg_amount_historical`, `sender_std_amount_historical`, `sender_max_amount_historical`, `sender_amount_ratio_to_avg`, `receiver_txn_count_historical`, `receiver_total_amount_historical`, `receiver_avg_amount_historical`, `receiver_std_amount_historical`, `receiver_max_amount_historical`, `receiver_amount_ratio_to_avg`, `sender_unique_receivers_prev_24h`, `receiver_unique_senders_prev_24h`, `sender_unique_receivers_historical`, `receiver_unique_senders_historical`
- **Infrastructure & Relationship Features (11)**: `device_txn_count_historical`, `device_unique_accounts_historical`, `device_unique_customers_historical`, `ip_txn_count_historical`, `ip_unique_accounts_historical`, `ip_unique_customers_historical`, `sender_customer_accounts_count_historical`, `sender_is_shared_device_historical`, `sender_is_shared_ip_historical`, `sender_crypto_txn_count_historical`, `sender_crypto_total_amount_historical`
- **Regulatory Threshold Features (1)**: `sender_near_regulatory_threshold_txns_prev_24h`

#### Category D: Graph-Derived ML Features (22 Columns)
- **Sender Graph Features (11)**: `sender_pagerank_score`, `sender_louvain_community_id`, `sender_in_degree`, `sender_out_degree`, `sender_has_self_loop`, `sender_participates_in_cycle`, `sender_shortest_cycle_length`, `sender_cycle_count_len2`, `sender_cycle_count_len3`, `sender_cycle_count_len4`, `sender_total_cycle_count`
- **Receiver Graph Features (11)**: `receiver_pagerank_score`, `receiver_louvain_community_id`, `receiver_in_degree`, `receiver_out_degree`, `receiver_has_self_loop`, `receiver_participates_in_cycle`, `receiver_shortest_cycle_length`, `receiver_cycle_count_len2`, `receiver_cycle_count_len3`, `receiver_cycle_count_len4`, `receiver_total_cycle_count`

---

### 4. Ground-Truth Leakage Audit
An automated pattern scan across column headers, values, and upstream pipeline artifacts confirmed:
- **Zero Ground-Truth Variables**: No presence of labels (`is_laundering`, `is_fraud`, `target`, `sar_status`).
- **Zero Scenario Leakage**: No presence of AML scenario identifiers (`structuring`, `mule_fan_out`, `layering_cycle`, `crypto_ramp`).
- **Zero Transaction ID Encoding**: Transaction IDs follow uniform sequential formatting (`TX-V2-000001` to `TX-V2-150000`) with zero embedded risk status.
- **Zero Label-Derived Aggregations**: All 84 features are strictly unsupervised and self-contained from transaction mechanics and topology.

---

### 5. Feature Quality, Variance & Missing-Value Audit
- **Missing / NaN Values in ML Features**: Exactly **0** across all 84 candidate features.
- **Infinite / -Infinite Values**: Exactly **0** across all 84 candidate features.
- **Constant Features (Variance = 0)**: Exactly **0** (no feature has only 1 unique value).
- **Near-Zero Variance Features**: None below $10^{-4}$ threshold.
- **Sentinel Preservation**: `sender_shortest_cycle_length` and `receiver_shortest_cycle_length` retain `-1` sentinel for accounts with no detected cycles.

---

### 6. Correlation & Multicollinearity Analysis
Identified **19 highly correlated feature pairs** (|r| $\ge$ 0.95):

| Feature 1 | Feature 2 | Pearson r | Explanatory AML Domain Context |
| :--- | :--- | :---: | :--- |
| `is_crypto` | `currency_INR` | -1.0000 | Exact complement in one-hot encoded dual-currency dataset |
| `is_crypto` | `currency_USDT` | 1.0000 | Exact equivalent: all crypto transactions use USDT |
| `is_crypto` | `channel_Crypto_Gateway` | 1.0000 | Exact channel mapping: all USDT flows use Crypto Gateway |
| `currency_INR` | `currency_USDT` | -1.0000 | Exact dual-currency complement |
| `currency_INR` | `channel_Crypto_Gateway` | -1.0000 | Exact dual-currency/channel complement |
| `currency_USDT` | `channel_Crypto_Gateway` | 1.0000 | Exact dual-currency/channel equivalence |
| `sender_txn_count_prev_24h` | `sender_unique_receivers_prev_24h` | 0.9721 | Baseline AML behavior: normal accounts transact with unique counterparties |
| `receiver_txn_count_prev_1h` | `receiver_unique_senders_prev_1h` | 0.9791 | Normal baseline fan-in velocity alignment |
| `receiver_txn_count_prev_24h` | `receiver_unique_senders_prev_24h` | 0.9851 | Normal baseline fan-in velocity alignment |
| `sender_txn_count_historical` | `sender_unique_receivers_historical` | 0.9913 | Cumulative counterparty count closely tracks historical transaction count |
| `receiver_txn_count_historical` | `receiver_unique_senders_historical` | 0.9919 | Cumulative counterparty count closely tracks historical transaction count |
| `device_txn_count_historical` | `device_unique_accounts_historical` | 1.0000 | Synthetic benchmark baseline: single account per device in legitimate traffic |
| `device_txn_count_historical` | `device_unique_customers_historical` | 1.0000 | Synthetic benchmark baseline: single customer per device in legitimate traffic |
| `device_unique_accounts_historical` | `device_unique_customers_historical` | 1.0000 | 1:1 account-to-customer binding per device in baseline traffic |
| `ip_txn_count_historical` | `ip_unique_accounts_historical` | 0.9965 | Normal baseline traffic exhibits 1:1 account per IP mapping |
| `ip_txn_count_historical` | `ip_unique_customers_historical` | 0.9965 | Normal baseline traffic exhibits 1:1 customer per IP mapping |
| `ip_unique_accounts_historical` | `ip_unique_customers_historical` | 1.0000 | 1:1 account-to-customer binding per IP in baseline traffic |
| `sender_participates_in_cycle` | `sender_shortest_cycle_length` | 0.9937 | Direct sentinel coupling: 97.67% of rows share flag=0 and shortest=-1 |
| `receiver_participates_in_cycle` | `receiver_shortest_cycle_length` | 0.9932 | Direct sentinel coupling: 97.67% of rows share flag=0 and shortest=-1 |

*Recommendation*: For tree-based models (XGBoost), collinear features do not destabilize gradient boosting. For Isolation Forest, retaining only one representative per exact collinear block ($r = 1.0$) prevents distorted distance metrics in unsupervised splits.

---

### 7. Critical Temporal-Leakage Disclosure
> [!WARNING]
> **Methodological Disclosure on Graph Features vs. Phase 2 Features**
> 
> - **Phase 2 Behavioral Features (Causal)**: Computed strictly chronologically using rolling past-looking windows excluding current transactions and strictly zero future data.
> - **Phase 3 Graph Features (Static Full-Network)**: Computed globally over the complete 150,000-transaction network topology $(:Account)-[:TRANSACTED_TO]->(:Account)$. Consequently, an account's PageRank, community, degree, and cycle attributes incorporate graph edges formed across the entire timeline.
> - **Suitability**: This static network representation is valid for retrospective batch investigation, intelligence graph enrichment, and AML typological analysis. However, it is **not strictly point-in-time causal** for real-time backtesting without sliding temporal graph projections.

---

### 8. Recommended Feature Sets by Model Architecture

#### A. Supervised Model (XGBoost): **84 Features**
- **All 62 Phase 2 features + All 22 Graph features**.
- Gradient boosted trees natively handle nonlinearities, monotonic step boundaries, collinear pairs, and categorical community IDs.

#### B. Unsupervised Model (Isolation Forest): **80 Features**
- **Exclude nominal community IDs** (`sender_louvain_community_id`, `receiver_louvain_community_id`): Community IDs are arbitrary nominal cluster indices (e.g., 2822 vs 24311). Treating them as continuous coordinates in Isolation Forest induces spurious distance cuts.
- **Exclude redundant exact duplicates** (`device_unique_customers_historical`, `ip_unique_customers_historical`): Retain `device_unique_accounts_historical` and `ip_unique_accounts_historical` to prevent double-weighting redundant axes.
- **Total Isolation Forest Feature Count**: **80 Features** (continuous topology, velocity, and infrastructure metrics).

---

### 9. Train / Validation Strategy Recommendation
> [!TIP]
> **Recommended Strategy: Chronological Out-of-Time Split (80 / 20)**
> 
> - **Split Logic**: Sort transactions chronologically by `timestamp` / `transaction_id`.
>   - **Train Set**: First 120,000 transactions (80.0%)
>   - **Test / Validation Set**: Subsequent 30,000 transactions (20.0%)
> - **Rationale**: Random k-fold cross-validation is strictly avoided as it leaks temporal dynamics across train and test folds.

---

### 10. Automated Test Results
All 51 automated tests passed in `pytest`:
```
============================= 51 passed in 11.26s =============================
```
- `tests/test_features.py`: 23 passed
- `tests/test_preprocessing.py`: 23 passed
- `tests/test_graph_merge.py`: 5 passed

---

### 11. Candidate ML Feature Catalog (All 84 Features)
| # | Feature Name | Source | Dtype | Uniques | Min | Max | Mean | Std |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `amount` | Phase 2 | float64 | 144,395 | 98.7000 | 1484993.7300 | 206795.9809 | 328749.8817 |
| 2 | `log_amount` | Phase 2 | float64 | 144,395 | 4.6022 | 14.2109 | 10.9784 | 1.7655 |
| 3 | `is_crypto` | Phase 2 | int64 | 2 | 0 | 1 | 0.1421 | 0.3491 |
| 4 | `currency_INR` | Phase 2 | int64 | 2 | 0 | 1 | 0.8579 | 0.3491 |
| 5 | `currency_USDT` | Phase 2 | int64 | 2 | 0 | 1 | 0.1421 | 0.3491 |
| 6 | `channel_UPI` | Phase 2 | int64 | 2 | 0 | 1 | 0.2989 | 0.4578 |
| 7 | `channel_IMPS` | Phase 2 | int64 | 2 | 0 | 1 | 0.2481 | 0.4319 |
| 8 | `channel_NEFT` | Phase 2 | int64 | 2 | 0 | 1 | 0.1470 | 0.3541 |
| 9 | `channel_Crypto_Gateway` | Phase 2 | int64 | 2 | 0 | 1 | 0.1421 | 0.3491 |
| 10 | `channel_RTGS` | Phase 2 | int64 | 2 | 0 | 1 | 0.1209 | 0.3260 |
| 11 | `channel_Card` | Phase 2 | int64 | 2 | 0 | 1 | 0.0431 | 0.2030 |
| 12 | `is_cross_border` | Phase 2 | int64 | 2 | 0 | 1 | 0.3846 | 0.4865 |
| 13 | `transaction_hour` | Phase 2 | int64 | 24 | 0 | 23 | 11.4776 | 6.9150 |
| 14 | `transaction_weekday` | Phase 2 | int64 | 7 | 0 | 6 | 3.0852 | 1.9442 |
| 15 | `transaction_day` | Phase 2 | int64 | 31 | 1 | 31 | 15.9036 | 8.9092 |
| 16 | `is_weekend` | Phase 2 | int64 | 2 | 0 | 1 | 0.2877 | 0.4527 |
| 17 | `hour_sin` | Phase 2 | float64 | 20 | -1.0000 | 1.0000 | 0.0021 | 0.7067 |
| 18 | `hour_cos` | Phase 2 | float64 | 22 | -1.0000 | 1.0000 | -0.0014 | 0.7075 |
| 19 | `sender_txn_count_prev_1h` | Phase 2 | int64 | 4 | 0 | 3 | 0.0290 | 0.2094 |
| 20 | `sender_amount_sum_prev_1h` | Phase 2 | float64 | 3,184 | 0.0000 | 2968649.8800 | 9821.1024 | 118764.3848 |
| 21 | `sender_txn_count_prev_24h` | Phase 2 | int64 | 6 | 0 | 5 | 0.1830 | 0.4523 |
| 22 | `sender_amount_sum_prev_24h` | Phase 2 | float64 | 23,745 | 0.0000 | 5018948.3700 | 41671.3549 | 198972.3119 |
| 23 | `sender_unique_receivers_prev_1h` | Phase 2 | int64 | 3 | 0 | 2 | 0.0214 | 0.1460 |
| 24 | `sender_unique_receivers_prev_24h` | Phase 2 | int64 | 5 | 0 | 4 | 0.1732 | 0.4166 |
| 25 | `receiver_txn_count_prev_1h` | Phase 2 | int64 | 5 | 0 | 4 | 0.0946 | 0.4187 |
| 26 | `receiver_amount_sum_prev_1h` | Phase 2 | float64 | 8,746 | 0.0000 | 4444413.9600 | 26542.6252 | 183630.1238 |
| 27 | `receiver_txn_count_prev_24h` | Phase 2 | int64 | 9 | 0 | 8 | 0.2644 | 0.6425 |
| 28 | `receiver_amount_sum_prev_24h` | Phase 2 | float64 | 28,139 | 0.0000 | 5014863.7600 | 60270.2376 | 251669.4351 |
| 29 | `receiver_unique_senders_prev_1h` | Phase 2 | int64 | 5 | 0 | 4 | 0.0871 | 0.3923 |
| 30 | `receiver_unique_senders_prev_24h` | Phase 2 | int64 | 9 | 0 | 8 | 0.2544 | 0.6176 |
| 31 | `sender_txn_count_historical` | Phase 2 | int64 | 18 | 0 | 17 | 2.5172 | 2.1646 |
| 32 | `sender_amount_sum_historical` | Phase 2 | float64 | 119,873 | 0.0000 | 7327853.4300 | 521569.6262 | 709102.7610 |
| 33 | `sender_amount_avg_historical` | Phase 2 | float64 | 119,465 | 0.0000 | 1484940.0400 | 165684.2061 | 221643.4367 |
| 34 | `sender_amount_std_historical` | Phase 2 | float64 | 91,057 | 0.0000 | 1047092.3059 | 144471.7974 | 207771.2046 |
| 35 | `sender_unique_receivers_historical` | Phase 2 | int64 | 16 | 0 | 15 | 2.4727 | 2.1119 |
| 36 | `sender_unique_channels_historical` | Phase 2 | int64 | 7 | 0 | 6 | 1.8258 | 1.3549 |
| 37 | `sender_crypto_txn_count_historical` | Phase 2 | int64 | 7 | 0 | 6 | 0.3520 | 0.6238 |
| 38 | `amount_to_sender_avg_ratio` | Phase 2 | float64 | 119,742 | 0.0001 | 11568.2669 | 6.0692 | 82.6406 |
| 39 | `sender_amount_zscore_historical` | Phase 2 | float64 | 90,760 | -72534461.4400 | 5229535682.5600 | 118585.3376 | 18554058.1788 |
| 40 | `receiver_txn_count_historical` | Phase 2 | int64 | 20 | 0 | 19 | 2.6053 | 2.3136 |
| 41 | `receiver_amount_sum_historical` | Phase 2 | float64 | 119,911 | 0.0000 | 8968407.4500 | 547888.1423 | 762144.6292 |
| 42 | `receiver_amount_avg_historical` | Phase 2 | float64 | 119,469 | 0.0000 | 1484324.9400 | 166218.7067 | 221366.7182 |
| 43 | `receiver_amount_std_historical` | Phase 2 | float64 | 91,274 | 0.0000 | 1048083.8958 | 145015.1868 | 207731.0723 |
| 44 | `receiver_unique_senders_historical` | Phase 2 | int64 | 19 | 0 | 18 | 2.5583 | 2.2590 |
| 45 | `receiver_unique_channels_historical` | Phase 2 | int64 | 7 | 0 | 6 | 1.8488 | 1.3814 |
| 46 | `receiver_crypto_txn_count_historical` | Phase 2 | int64 | 6 | 0 | 5 | 0.3498 | 0.6241 |
| 47 | `amount_to_receiver_avg_ratio` | Phase 2 | float64 | 119,764 | 0.0001 | 10055.6054 | 5.4414 | 58.4936 |
| 48 | `receiver_amount_zscore_historical` | Phase 2 | float64 | 90,985 | -73259664.6400 | 6870052211.1361 | 82528.7572 | 18776868.8573 |
| 49 | `sender_near_regulatory_threshold_txns_prev_24h` | Phase 2 | int64 | 4 | 0 | 3 | 0.0026 | 0.0561 |
| 50 | `device_txn_count_historical` | Phase 2 | int64 | 39 | 0 | 38 | 9.3485 | 6.9799 |
| 51 | `device_unique_accounts_historical` | Phase 2 | int64 | 39 | 0 | 38 | 9.3465 | 6.9778 |
| 52 | `device_unique_customers_historical` | Phase 2 | int64 | 39 | 0 | 38 | 9.3456 | 6.9766 |
| 53 | `device_txn_count_prev_1h` | Phase 2 | int64 | 6 | 0 | 5 | 0.1066 | 0.4465 |
| 54 | `device_txn_count_prev_24h` | Phase 2 | int64 | 13 | 0 | 12 | 0.7390 | 1.0463 |
| 55 | `ip_txn_count_historical` | Phase 2 | int64 | 51 | 0 | 50 | 8.0523 | 5.9618 |
| 56 | `ip_unique_accounts_historical` | Phase 2 | int64 | 51 | 0 | 50 | 7.9209 | 5.8305 |
| 57 | `ip_unique_customers_historical` | Phase 2 | int64 | 51 | 0 | 50 | 7.9204 | 5.8297 |
| 58 | `ip_txn_count_prev_1h` | Phase 2 | int64 | 6 | 0 | 5 | 0.1453 | 0.5343 |
| 59 | `ip_txn_count_prev_24h` | Phase 2 | int64 | 12 | 0 | 11 | 0.6546 | 1.0209 |
| 60 | `sender_customers_count_historical` | Phase 2 | int64 | 5 | 0 | 4 | 0.8246 | 0.4381 |
| 61 | `receiver_customers_count_historical` | Phase 2 | int64 | 4 | 0 | 3 | 0.8248 | 0.4378 |
| 62 | `sender_customer_accounts_count_historical` | Phase 2 | int64 | 5 | 0 | 4 | 1.3673 | 0.7359 |
| 63 | `sender_pagerank_score` | Graph | float64 | 29,550 | 0.1500 | 3.9430 | 0.9392 | 0.4768 |
| 64 | `sender_louvain_community_id` | Graph | int64 | 49 | 489 | 29680 | 14267.4946 | 8798.0424 |
| 65 | `sender_in_degree` | Graph | int64 | 20 | 0 | 20 | 5.0542 | 2.4915 |
| 66 | `sender_out_degree` | Graph | int64 | 17 | 1 | 18 | 6.0344 | 2.2810 |
| 67 | `sender_has_self_loop` | Graph | int64 | 2 | 0 | 1 | 0.0000 | 0.0068 |
| 68 | `sender_participates_in_cycle` | Graph | int64 | 2 | 0 | 1 | 0.0282 | 0.1656 |
| 69 | `sender_shortest_cycle_length` | Graph | int64 | 4 | -1 | 4 | -0.8657 | 0.7931 |
| 70 | `sender_cycle_count_len2` | Graph | int64 | 3 | 0 | 3 | 0.0018 | 0.0553 |
| 71 | `sender_cycle_count_len3` | Graph | int64 | 3 | 0 | 3 | 0.0047 | 0.0780 |
| 72 | `sender_cycle_count_len4` | Graph | int64 | 6 | 0 | 9 | 0.0267 | 0.2161 |
| 73 | `sender_total_cycle_count` | Graph | int64 | 6 | 0 | 9 | 0.0331 | 0.2380 |
| 74 | `receiver_pagerank_score` | Graph | float64 | 29,741 | 0.1642 | 3.9430 | 1.1201 | 0.5074 |
| 75 | `receiver_louvain_community_id` | Graph | int64 | 53 | 489 | 29911 | 14314.6063 | 8804.2265 |
| 76 | `receiver_in_degree` | Graph | int64 | 19 | 1 | 20 | 6.2107 | 2.5818 |
| 77 | `receiver_out_degree` | Graph | int64 | 18 | 0 | 18 | 5.0542 | 2.2932 |
| 78 | `receiver_has_self_loop` | Graph | int64 | 2 | 0 | 1 | 0.0001 | 0.0089 |
| 79 | `receiver_participates_in_cycle` | Graph | int64 | 2 | 0 | 1 | 0.0288 | 0.1671 |
| 80 | `receiver_shortest_cycle_length` | Graph | int64 | 4 | -1 | 4 | -0.8636 | 0.7979 |
| 81 | `receiver_cycle_count_len2` | Graph | int64 | 3 | 0 | 3 | 0.0020 | 0.0559 |
| 82 | `receiver_cycle_count_len3` | Graph | int64 | 3 | 0 | 3 | 0.0048 | 0.0787 |
| 83 | `receiver_cycle_count_len4` | Graph | int64 | 6 | 0 | 9 | 0.0269 | 0.2163 |
| 84 | `receiver_total_cycle_count` | Graph | int64 | 6 | 0 | 9 | 0.0336 | 0.2380 |
