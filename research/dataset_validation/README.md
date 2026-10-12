# Project Vigilance - Phase 0: Independent Dataset Audit

## Overview
Phase 0 independently inspects the operational transaction dataset (`aml_150k.csv`) and its corresponding ground truth target file (`aml_150k_ground_truth.csv`).

This audit runs before any feature engineering, model training, or application building to verify:
1. **Schema & Integrity**: Verifies exact 17 operational columns, binary ground truth, row counts, and duplicate IDs.
2. **Ground Truth Separation**: Verifies that no target label columns leaked into `aml_150k.csv`.
3. **Class Distribution**: Confirms normal vs. suspicious distribution (~88.6% vs ~11.4%).
4. **Data Quality & Domain Validity**: Validates non-negative amounts, ISO-8601 UTC timestamps, and boolean crypto flags.
5. **Entity Consistency**: Validates 1-to-1/N-to-1 consistency for account -> customer mappings across sender and receiver roles.
6. **Infrastructure Sharing**: Audits shared device and IP reuse patterns for mule / syndication scenarios.
7. **Synthetic Marker Scan**: Checks for synthetic markers in names and IDs (`SMURF`, `STR-FWD`, `MULE`, `SHELL`, `CRIME`) that caused artificial 99% accuracy in legacy datasets.
8. **Label Leakage & Deterministic Proxies**: Audits whether any raw categorical attribute, channel, currency, or threshold deterministically reveals the ground truth.

## Hardware & Architecture Guardrails
- **Memory Optimization**: Executes on Windows with 8 GB RAM and Ryzen 5 5600H without out-of-memory overhead.
- **Pure Verification**: Does NOT modify any dataset files or train XGBoost models.

## Usage

Run the audit from the project root (`Project codebase/`):

```bash
python ml-service/audit/dataset_audit.py
```

Or specify custom file paths:

```bash
python ml-service/audit/dataset_audit.py \
    --tx-file data/training/aml_150k.csv \
    --gt-file data/training/aml_150k_ground_truth.csv \
    --output-json reports/dataset_audit_report.json \
    --output-txt reports/dataset_audit_report.txt
```

## Generated Reports
- `reports/dataset_audit_report.json`: Full machine-readable audit report containing exact statistical metrics and breakdown.
- `reports/dataset_audit_report.txt`: Human-readable executive summary and diagnostic breakdown.
