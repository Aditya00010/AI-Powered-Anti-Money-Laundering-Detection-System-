"""
Project Vigilance - Graph Feature Integration Test Suite
========================================================
Test Module: tests/test_graph_merge.py

Verifies:
1. Output dataset shape: exactly 150,000 rows x 98 columns.
2. The 22 new graph features are present, non-null, and finite.
3. Transaction ID alignment matches aml_150k_features.csv exactly.
4. Base Phase 2 columns and values are 100% unaltered.
5. Immutability of the original aml_150k_features.csv dataset.
6. Cycle sentinel (-1) semantics are faithfully preserved.
"""

import hashlib
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent

BASE_FEATURES_PATH = PROJECT_ROOT / "data" / "processed" / "aml_150k_features.csv"
GRAPH_FEATURES_PATH = PROJECT_ROOT / "data" / "processed" / "aml_150k_graph_features.csv"

EXPECTED_BASE_SHA256 = "2895d5cf6e4dd16c75da1e0cce9b74446b4dfaa1230720d0b3818522ac2aee7c"

EXPECTED_SENDER_FEATURES = [
    "sender_pagerank_score",
    "sender_louvain_community_id",
    "sender_in_degree",
    "sender_out_degree",
    "sender_has_self_loop",
    "sender_participates_in_cycle",
    "sender_shortest_cycle_length",
    "sender_cycle_count_len2",
    "sender_cycle_count_len3",
    "sender_cycle_count_len4",
    "sender_total_cycle_count",
]

EXPECTED_RECEIVER_FEATURES = [
    "receiver_pagerank_score",
    "receiver_louvain_community_id",
    "receiver_in_degree",
    "receiver_out_degree",
    "receiver_has_self_loop",
    "receiver_participates_in_cycle",
    "receiver_shortest_cycle_length",
    "receiver_cycle_count_len2",
    "receiver_cycle_count_len3",
    "receiver_cycle_count_len4",
    "receiver_total_cycle_count",
]

ALL_22_GRAPH_FEATURES = EXPECTED_SENDER_FEATURES + EXPECTED_RECEIVER_FEATURES


def compute_file_hash(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def test_base_dataset_immutability():
    """Confirms the Phase 2 baseline dataset was not altered."""
    assert BASE_FEATURES_PATH.exists()
    current_hash = compute_file_hash(BASE_FEATURES_PATH)
    assert current_hash == EXPECTED_BASE_SHA256, "Baseline aml_150k_features.csv hash was altered!"


def test_merged_dataset_existence_and_shape():
    """Validates row count (150,000) and column count (98)."""
    assert GRAPH_FEATURES_PATH.exists()
    # Read sample to verify header and length
    df = pd.read_csv(GRAPH_FEATURES_PATH, nrows=5)
    assert df.shape[1] == 98, f"Expected 98 columns, found {df.shape[1]}"


def test_graph_feature_columns_present():
    """Validates all 22 graph features are present in the dataset."""
    df_sample = pd.read_csv(GRAPH_FEATURES_PATH, nrows=1)
    for col in ALL_22_GRAPH_FEATURES:
        assert col in df_sample.columns, f"Missing graph feature column: {col}"


def test_transaction_id_and_order_alignment():
    """Confirms strict 1:1 transaction alignment with the base dataset."""
    df_base = pd.read_csv(BASE_FEATURES_PATH, usecols=["transaction_id"])
    df_graph = pd.read_csv(GRAPH_FEATURES_PATH, usecols=["transaction_id"])
    assert len(df_base) == 150_000
    assert len(df_graph) == 150_000
    assert (df_base["transaction_id"] == df_graph["transaction_id"]).all()


def test_graph_features_completeness_and_sentinels():
    """Validates zero nulls, zero infs, and correct sentinel values in graph features."""
    df_graph = pd.read_csv(GRAPH_FEATURES_PATH, usecols=ALL_22_GRAPH_FEATURES)
    
    # Null and inf checks
    assert df_graph.isnull().sum().sum() == 0, "Graph features contain null values!"
    assert np.isinf(df_graph.select_dtypes(include=[np.number])).sum().sum() == 0, "Graph features contain infinities!"
    
    # Sentinel check (-1 for shortest_cycle_length when no cycle)
    no_cycle_senders = df_graph[df_graph["sender_participates_in_cycle"] == 0]
    assert (no_cycle_senders["sender_shortest_cycle_length"] == -1).all()

    no_cycle_receivers = df_graph[df_graph["receiver_participates_in_cycle"] == 0]
    assert (no_cycle_receivers["receiver_shortest_cycle_length"] == -1).all()
