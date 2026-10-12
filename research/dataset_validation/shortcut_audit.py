"""
Project Vigilance - Simple Feature Shortcut & Baseline Probe Audit (Phase 0)
=============================================================================
Script: ml-service/audit/shortcut_audit.py

Tests whether any isolated raw feature or basic combination can act as a
predictive shortcut (leakage / trivial proxy) for the ground_truth label.

Tests Conducted:
  - Test 1: Amount only
  - Test 2: Geography only (Country + City)
  - Test 3: Crypto only (is_crypto)
  - Test 4: Channel only (Payment channel)
  - Test 5: Basic Transaction (Amount + Currency + Channel + Crypto + Country + City)
  - Test 6: Temporal only (Hour + Day + Weekday)
  - Test 7: Infrastructure only (Device / IP reuse indicators)
  - Test 8: Shallow / Deliberately Simple Baseline Models (Logistic Regression, Decision Trees)

Metrics Evaluated:
  - ROC-AUC
  - PR-AUC (Average Precision)
  - Accuracy
  - Precision, Recall, F1 Score
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    accuracy_score,
)
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline


def run_shortcut_audit():
    if sys.platform.startswith("win"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print("=" * 80)
    print(" PROJECT VIGILANCE - SIMPLE FEATURE SHORTCUT & BASELINE PROBE AUDIT (PHASE 0)")
    print("=" * 80)

    # Resolve paths
    base_dir = Path(__file__).resolve().parent.parent.parent
    tx_file = base_dir / "data" / "training" / "aml_150k_v2.csv"
    gt_file = base_dir / "data" / "training" / "aml_150k_v2_ground_truth.csv"

    print(f"Loading Transaction Data: {tx_file}")
    print(f"Loading Ground Truth Data: {gt_file}")
    df_tx = pd.read_csv(tx_file, low_memory=False)
    df_gt = pd.read_csv(gt_file, low_memory=False)
    df = pd.merge(df_tx, df_gt, on="transaction_id")
    n_rows = len(df)
    susp_rate = df["ground_truth"].mean()
    print(f"Total Rows: {n_rows:,} | Base Suspicious Rate: {susp_rate:.4f} ({susp_rate*100:.2f}%)")
    print("-" * 80)

    # 1. Temporal feature extraction
    df["dt"] = pd.to_datetime(df["timestamp"], format="ISO8601")
    df["hour"] = df["dt"].dt.hour
    df["day"] = df["dt"].dt.day
    df["weekday"] = df["dt"].dt.weekday

    # 2. Infrastructure reuse indicators
    df["device_tx_count"] = df["device_id"].map(df["device_id"].value_counts()).fillna(0)
    df["ip_tx_count"] = df["ip_address"].map(df["ip_address"].value_counts()).fillna(0)
    df["device_acc_count"] = df.groupby("device_id")["sender_account"].transform("nunique").fillna(0)
    df["ip_acc_count"] = df.groupby("ip_address")["sender_account"].transform("nunique").fillna(0)

    # Define Feature Sets
    test_suites = {
        "Test 1: Amount only": ["amount"],
        "Test 2: Geography only": ["location_country", "location_city"],
        "Test 3: Crypto only": ["is_crypto"],
        "Test 4: Channel only": ["channel"],
        "Test 5: Basic Transaction (Amt+Curr+Chan+Crypto+Geo)": [
            "amount",
            "currency",
            "channel",
            "is_crypto",
            "location_country",
            "location_city",
        ],
        "Test 6: Temporal only (Hour+Day+Weekday)": ["hour", "day", "weekday"],
        "Test 7: Infrastructure only (Device/IP reuse)": [
            "device_tx_count",
            "ip_tx_count",
            "device_acc_count",
            "ip_acc_count",
        ],
    }

    y = df["ground_truth"].values
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

    summary_records = []

    for test_name, cols in test_suites.items():
        print(f"\nEvaluating: {test_name}")
        print(f"Features: {cols}")

        num_cols = [
            c
            for c in cols
            if c
            in [
                "amount",
                "hour",
                "day",
                "weekday",
                "device_tx_count",
                "ip_tx_count",
                "device_acc_count",
                "ip_acc_count",
            ]
        ]
        cat_cols = [c for c in cols if c not in num_cols]

        transformers = []
        if num_cols:
            transformers.append(("num", StandardScaler(), num_cols))
        if cat_cols:
            transformers.append(("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols))

        preprocessor = ColumnTransformer(transformers=transformers)

        models = {
            "Logistic Regression": LogisticRegression(max_iter=500, random_state=42),
            "Decision Tree (depth=3)": DecisionTreeClassifier(max_depth=3, random_state=42),
            "Decision Tree (depth=5)": DecisionTreeClassifier(max_depth=5, random_state=42),
        }

        for model_name, model in models.items():
            pipe = Pipeline([("prep", preprocessor), ("clf", model)])

            y_prob = np.zeros(len(y))
            y_pred = np.zeros(len(y))

            for train_idx, val_idx in cv.split(df, y):
                pipe.fit(df.iloc[train_idx], y[train_idx])
                y_prob[val_idx] = pipe.predict_proba(df.iloc[val_idx])[:, 1]
                y_pred[val_idx] = pipe.predict(df.iloc[val_idx])

            roc = roc_auc_score(y, y_prob)
            pr_auc = average_precision_score(y, y_prob)
            acc = accuracy_score(y, y_pred)
            prec = precision_score(y, y_pred, zero_division=0)
            rec = recall_score(y, y_pred, zero_division=0)
            f1 = f1_score(y, y_pred, zero_division=0)

            print(
                f"  {model_name:<25} | ROC-AUC: {roc:.4f} | PR-AUC: {pr_auc:.4f} | "
                f"Acc: {acc:.4f} | Prec: {prec:.4f} | Rec: {rec:.4f} | F1: {f1:.4f}"
            )

            summary_records.append({
                "test_name": test_name,
                "model_name": model_name,
                "roc_auc": round(float(roc), 4),
                "pr_auc": round(float(pr_auc), 4),
                "accuracy": round(float(acc), 4),
                "precision": round(float(prec), 4),
                "recall": round(float(rec), 4),
                "f1_score": round(float(f1), 4),
            })

    # Summary table output
    summary_df = pd.DataFrame(summary_records)
    print("\n" + "=" * 80)
    print("                    FINAL SHORTCUT AUDIT BENCHMARK SUMMARY")
    print("=" * 80)
    print(
        f"{'Feature Set':<42} | {'Model':<23} | {'ROC-AUC':<8} | {'PR-AUC':<8} | {'F1':<6}"
    )
    print("-" * 95)
    for _, r in summary_df.iterrows():
        print(
            f"{r['test_name']:<42} | {r['model_name']:<23} | {r['roc_auc']:<8.4f} | {r['pr_auc']:<8.4f} | {r['f1_score']:<6.4f}"
        )
    print("=" * 80)

    # Critical Diagnosis:
    max_roc = summary_df["roc_auc"].max()
    max_pr = summary_df["pr_auc"].max()
    max_f1 = summary_df["f1_score"].max()

    top_run = summary_df.loc[summary_df["roc_auc"].idxmax()]

    print(f"\nHighest ROC-AUC achieved by simple features: {max_roc:.4f} ({top_run['test_name']} - {top_run['model_name']})")
    print(f"Highest PR-AUC achieved by simple features:  {max_pr:.4f}")
    print(f"Highest F1-Score achieved by simple features: {max_f1:.4f}")

    if max_roc >= 0.90 or max_f1 >= 0.85:
        print("\n[CRITICAL LEAKAGE DETECTED]: Simple raw features provide a near-perfect shortcut!")
    elif max_roc >= 0.75:
        print("\n[MODERATE PREDICTIVE SIGNAL]: Simple features show moderate baseline correlation, but NO trivial 99% shortcut.")
    else:
        print("\n[CLEAN / NO SHORTCUT]: Simple features alone CANNOT reliably classify suspicious AML transactions.")
        print("This confirms the dataset requires complex behavioral, temporal, and graph features to detect AML patterns!")


if __name__ == "__main__":
    run_shortcut_audit()
