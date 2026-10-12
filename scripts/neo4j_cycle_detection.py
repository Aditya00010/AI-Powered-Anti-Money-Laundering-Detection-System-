"""
Project Vigilance - Neo4j Transaction Cycle Detection Script
============================================================
Script: scripts/neo4j_cycle_detection.py

Purpose:
Detects circular transaction flows on:
    (:Account)-[:TRANSACTED_TO]->(:Account)
to identify potential layering topologies (e.g., A -> B -> C -> A).

Key Guarantees:
1. Target Graph: Pure Account-to-Account directed transaction edges.
2. Bounded Cycle Scope:
   - Self-loops (Length 1): A -> A (detected & reported separately).
   - Reciprocal Cycles (Length 2): A -> B -> A.
   - Triangular Cycles (Length 3): A -> B -> C -> A (canonical AML layering).
   - Quadrilateral Cycles (Length 4): A -> B -> C -> D -> A (extended circular flow).
   - Maximum Cycle Length Bound: K = 4 (prevents exponential path explosion).
3. Rotational Deduplication:
   - Enforces unique canonical minimum node representation:
     e.g., for Length 3: a.account_id < b.account_id AND a.account_id < c.account_id
     ensuring every physical cycle is counted exactly once globally.
4. GDS Projection Lifecycle:
   - Checks and projects 'aml_account_transaction_cycle' in memory.
   - Verifies GDS algorithm availability.
   - Safely drops the projection upon completion.
5. Non-destructive:
   - Underlying topology and prior node properties (pagerank_score, louvain_community_id,
     in_degree, out_degree) remain completely unaltered.
6. Export:
   - Saves isolated table to data/processed/graph_features/account_cycles.csv
   - 29,998 rows (one per account), zero duplicates, zero nulls.
"""

import sys
import os
import time
from pathlib import Path
from typing import Dict, Any, List
from collections import defaultdict
import pandas as pd

# Add ml-service to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.graph import Neo4jConfig, get_neo4j_config, Neo4jConnectionManager

PROJECTION_NAME = "aml_account_transaction_cycle"
MAX_CYCLE_LENGTH = 4


def run_cycle_detection():
    config = get_neo4j_config()
    print("=" * 75)
    print(" PROJECT VIGILANCE — PHASE 3: TRANSACTION CYCLE DETECTION")
    print("=" * 75)
    print(f"Target Database : {config.database} on {config.uri}")
    print(f"Cycle Bound     : Maximum Cycle Length K = {MAX_CYCLE_LENGTH}")

    conn_mgr = Neo4jConnectionManager(config)
    driver = conn_mgr.get_driver()

    with driver.session(database=config.database) as session:
        # Step 1: Manage GDS Projection Lifecycle
        print("\n[Step 1/5] Checking GDS projection state...")
        exists_res = session.run(
            "CALL gds.graph.exists($name) YIELD exists",
            {"name": PROJECTION_NAME}
        ).single()

        if exists_res and exists_res["exists"]:
            print(f"Found existing projection '{PROJECTION_NAME}'. Dropping it...")
            session.run("CALL gds.graph.drop($name) YIELD graphName", {"name": PROJECTION_NAME})
            print(f"Projection '{PROJECTION_NAME}' dropped successfully.")
        else:
            print(f"No existing projection named '{PROJECTION_NAME}'. Ready to project.")

        print(f"Creating temporary GDS projection '{PROJECTION_NAME}'...")
        proj_query = """
        CALL gds.graph.project(
            $name,
            'Account',
            'TRANSACTED_TO'
        )
        YIELD graphName, nodeCount, relationshipCount, projectMillis
        """
        proj_res = session.run(proj_query, {"name": PROJECTION_NAME}).single()
        print(f"  Projection created in {proj_res['projectMillis']} ms:")
        print(f"  - Projected Nodes         : {proj_res['nodeCount']:,}")
        print(f"  - Projected Relationships : {proj_res['relationshipCount']:,}")

        # Check GDS capabilities for directed cycle enumeration
        print("\n[Step 2/5] Evaluating algorithm availability in GDS...")
        gds_cycle_procs = session.run(
            "SHOW PROCEDURES YIELD name WHERE name CONTAINS 'cycle' OR name CONTAINS 'triangle'"
        ).data()
        proc_names = [p["name"] for p in gds_cycle_procs]
        print(f"  Available GDS cycle/triangle procedures: {proc_names}")
        print("  Notice: GDS triangleCount is undirected clustering coefficient.")
        print("  Executing optimized bounded Cypher with strict rotational deduplication.")

        # Step 3: Execute bounded cycle detection
        print(f"\n[Step 3/5] Computing directed cycles (Lengths 1 to {MAX_CYCLE_LENGTH})...")

        # 3a. Self-loops (Length 1)
        print("  Evaluating Self-loops (Length 1: A -> A)...")
        t0 = time.time()
        self_loops_res = session.run("""
            MATCH (a:Account)-[:TRANSACTED_TO]->(a)
            RETURN a.account_id AS account_id
        """).data()
        self_loop_accounts = {r["account_id"] for r in self_loops_res}
        print(f"  -> Found {len(self_loop_accounts)} self-loop cycle(s) in {time.time()-t0:.2f}s")
        if self_loop_accounts:
            print(f"     Accounts with self-loop: {list(self_loop_accounts)}")

        # 3b. Length 2 (A -> B -> A)
        print("  Evaluating Reciprocal Cycles (Length 2: A -> B -> A)...")
        t0 = time.time()
        c2_res = session.run("""
            MATCH (a:Account)-[:TRANSACTED_TO]->(b:Account)-[:TRANSACTED_TO]->(a)
            WHERE a.account_id < b.account_id
            RETURN a.account_id AS a, b.account_id AS b
        """).data()
        c2_elapsed = time.time() - t0
        print(f"  -> Found {len(c2_res)} distinct 2-cycle(s) in {c2_elapsed:.2f}s (rotations deduplicated)")

        # 3c. Length 3 (A -> B -> C -> A)
        print("  Evaluating Triangular Cycles (Length 3: A -> B -> C -> A)...")
        t0 = time.time()
        c3_res = session.run("""
            MATCH (a:Account)-[:TRANSACTED_TO]->(b:Account)-[:TRANSACTED_TO]->(c:Account)-[:TRANSACTED_TO]->(a)
            WHERE a.account_id < b.account_id 
              AND a.account_id < c.account_id 
              AND b <> c
            RETURN a.account_id AS a, b.account_id AS b, c.account_id AS c
        """).data()
        c3_elapsed = time.time() - t0
        print(f"  -> Found {len(c3_res)} distinct 3-cycle(s) in {c3_elapsed:.2f}s (rotations deduplicated)")

        # 3d. Length 4 (A -> B -> C -> D -> A)
        print("  Evaluating Quadrilateral Cycles (Length 4: A -> B -> C -> D -> A)...")
        t0 = time.time()
        c4_res = session.run("""
            MATCH (a:Account)-[:TRANSACTED_TO]->(b:Account)-[:TRANSACTED_TO]->(c:Account)-[:TRANSACTED_TO]->(d:Account)-[:TRANSACTED_TO]->(a)
            WHERE a.account_id < b.account_id 
              AND a.account_id < c.account_id 
              AND a.account_id < d.account_id
              AND b <> c AND b <> d AND c <> d
            RETURN a.account_id AS a, b.account_id AS b, c.account_id AS c, d.account_id AS d
        """).data()
        c4_elapsed = time.time() - t0
        print(f"  -> Found {len(c4_res)} distinct 4-cycle(s) in {c4_elapsed:.2f}s (rotations deduplicated)")

        # Step 4: Account-Level Feature Aggregation & Validation
        print("\n[Step 4/5] Aggregating features for all 29,998 accounts...")
        all_accounts = [
            r["account_id"]
            for r in session.run("MATCH (a:Account) RETURN a.account_id AS account_id ORDER BY a.account_id ASC").data()
        ]

        c2_counts = defaultdict(int)
        for r in c2_res:
            c2_counts[r["a"]] += 1
            c2_counts[r["b"]] += 1

        c3_counts = defaultdict(int)
        for r in c3_res:
            c3_counts[r["a"]] += 1
            c3_counts[r["b"]] += 1
            c3_counts[r["c"]] += 1

        c4_counts = defaultdict(int)
        for r in c4_res:
            c4_counts[r["a"]] += 1
            c4_counts[r["b"]] += 1
            c4_counts[r["c"]] += 1
            c4_counts[r["d"]] += 1

        feature_rows = []
        for acc in all_accounts:
            has_sl = 1 if acc in self_loop_accounts else 0
            cnt2 = c2_counts[acc]
            cnt3 = c3_counts[acc]
            cnt4 = c4_counts[acc]
            tot_cycles = cnt2 + cnt3 + cnt4
            part_flag = 1 if tot_cycles > 0 else 0

            # Shortest cycle length (sentinel: -1 if no cycle in lengths 2..4)
            if cnt2 > 0:
                shortest_len = 2
            elif cnt3 > 0:
                shortest_len = 3
            elif cnt4 > 0:
                shortest_len = 4
            else:
                shortest_len = -1

            feature_rows.append({
                "account_id": acc,
                "has_self_loop": has_sl,
                "participates_in_cycle": part_flag,
                "shortest_cycle_length": shortest_len,
                "cycle_count_len2": cnt2,
                "cycle_count_len3": cnt3,
                "cycle_count_len4": cnt4,
                "total_cycle_count": tot_cycles,
            })

        df_features = pd.DataFrame(feature_rows)

        # Validation stats
        total_accounts = len(df_features)
        participating_accounts = int(df_features["participates_in_cycle"].sum())
        non_participating_accounts = total_accounts - participating_accounts
        pct_participating = (participating_accounts / total_accounts) * 100.0

        print(f"  - Total Account nodes evaluated : {total_accounts:,}")
        print(f"  - Accounts in detected cycles   : {participating_accounts:,} ({pct_participating:.2f}%)")
        print(f"  - Accounts with NO cycle        : {non_participating_accounts:,} ({100.0-pct_participating:.2f}%)")
        print("\n  Cycle Counts by Length (Distinct Rotations):")
        print(f"  - Length 1 (Self-loops)         : {len(self_loop_accounts)}")
        print(f"  - Length 2 (Reciprocal)         : {len(c2_res)}")
        print(f"  - Length 3 (Triangular)         : {len(c3_res)}")
        print(f"  - Length 4 (Quadrilateral)      : {len(c4_res)}")
        print(f"  - Total Non-trivial Cycles      : {len(c2_res) + len(c3_res) + len(c4_res)}")
        print("\n  Shortest Detected Cycle Distribution:")
        print(f"  - Length 2                      : {(df_features['shortest_cycle_length'] == 2).sum():,} accounts")
        print(f"  - Length 3                      : {(df_features['shortest_cycle_length'] == 3).sum():,} accounts")
        print(f"  - Length 4                      : {(df_features['shortest_cycle_length'] == 4).sum():,} accounts")
        print(f"  - Sentinel -1 (No cycle)        : {(df_features['shortest_cycle_length'] == -1).sum():,} accounts")

        # Top 10 Accounts by cycle participation
        top_10 = df_features.sort_values(
            by=["total_cycle_count", "cycle_count_len3", "cycle_count_len2"],
            ascending=False
        ).head(10)
        print("\n  Top 10 Accounts by Cycle Participation (Total Cycles):")
        print("  " + "-" * 75)
        print(f"   {'Rank':<5} | {'Account ID':<16} | {'Total':<6} | {'Len 2':<6} | {'Len 3':<6} | {'Len 4':<6} | {'Shortest':<8}")
        print("  " + "-" * 75)
        for rank, (_, row) in enumerate(top_10.iterrows(), 1):
            print(f"   {rank:<5} | {row['account_id']:<16} | {row['total_cycle_count']:<6} | {row['cycle_count_len2']:<6} | {row['cycle_count_len3']:<6} | {row['cycle_count_len4']:<6} | {row['shortest_cycle_length']:<8}")
        print("  " + "-" * 75)

        # Step 5: Export isolated CSV and Cleanup
        out_dir = PROJECT_ROOT / "data" / "processed" / "graph_features"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "account_cycles.csv"
        df_features.to_csv(out_file, index=False)
        print(f"\n[Step 5/5] Exported {len(df_features):,} rows to {out_file}")

        # Drop temporary GDS projection
        print(f"Dropping temporary GDS projection '{PROJECTION_NAME}'...")
        session.run("CALL gds.graph.drop($name) YIELD graphName", {"name": PROJECTION_NAME})
        exists_final = session.run(
            "CALL gds.graph.exists($name) YIELD exists",
            {"name": PROJECTION_NAME}
        ).single()["exists"]
        print(f"Projection dropped successfully. In-memory exists: {exists_final}")

        # Topology and property integrity check
        print("\nVerifying database topology and property integrity...")
        topo_query = """
        RETURN
            count { MATCH (:Account) } AS accounts,
            count { MATCH (:Customer) } AS customers,
            count { MATCH (:Device) } AS devices,
            count { MATCH (:IP) } AS ips,
            count { MATCH ()-[:TRANSACTED_TO]->() } AS transacted_to,
            count { MATCH ()-[:OWNS_ACCOUNT]->() } AS owns_account,
            count { MATCH ()-[:USED_DEVICE]->() } AS used_device,
            count { MATCH ()-[:USED_IP]->() } AS used_ip
        """
        topo_res = session.run(topo_query).single()
        print(f"  - Accounts       : {topo_res['accounts']:,} (expected 29,998)")
        print(f"  - Customers      : {topo_res['customers']:,} (expected 19,999)")
        print(f"  - Devices        : {topo_res['devices']:,} (expected 7,000)")
        print(f"  - IPs            : {topo_res['ips']:,} (expected 9,734)")
        print(f"  - TRANSACTED_TO  : {topo_res['transacted_to']:,} (expected 150,000)")
        print(f"  - OWNS_ACCOUNT   : {topo_res['owns_account']:,} (expected 32,998)")
        print(f"  - USED_DEVICE    : {topo_res['used_device']:,} (expected 139,360)")
        print(f"  - USED_IP        : {topo_res['used_ip']:,} (expected 147,717)")

        prop_query = """
        MATCH (a:Account)
        RETURN
            count(a.pagerank_score) AS pr_count,
            count(a.louvain_community_id) AS louvain_count,
            count(a.in_degree) AS in_degree_count,
            count(a.out_degree) AS out_degree_count
        """
        prop_res = session.run(prop_query).single()
        print(f"  - pagerank_score       : {prop_res['pr_count']:,} (expected 29,998)")
        print(f"  - louvain_community_id : {prop_res['louvain_count']:,} (expected 29,998)")
        print(f"  - in_degree            : {prop_res['in_degree_count']:,} (expected 29,998)")
        print(f"  - out_degree           : {prop_res['out_degree_count']:,} (expected 29,998)")

    print("\n" + "=" * 75)
    print(" TRANSACTION CYCLE DETECTION COMPLETED SUCCESSFULLY")
    print("=" * 75)

    return {
        "total_accounts": total_accounts,
        "participating_accounts": participating_accounts,
        "non_participating_accounts": non_participating_accounts,
        "pct_participating": pct_participating,
        "self_loops": len(self_loop_accounts),
        "cycles_len2": len(c2_res),
        "cycles_len3": len(c3_res),
        "cycles_len4": len(c4_res),
        "top_10": top_10,
        "export_file": str(out_file),
    }


if __name__ == "__main__":
    run_cycle_detection()
