"""
Project Vigilance - Neo4j GDS PageRank Execution Script
======================================================
Script: scripts/neo4j_pagerank.py

Purpose:
Executes PageRank on the projected transaction topology (:Account)-[:TRANSACTED_TO]->(:Account)
using Neo4j Graph Data Science (GDS).

Key Guarantees:
1. Target Graph: Pure Account-to-Account directed transaction edges.
2. In-memory Projection: 'aml_account_transaction_graph' (dropped safely upon completion).
3. Persistent Property: Writes 'pagerank_score' onto (:Account) nodes.
4. Non-destructive: Does NOT alter Customer, Device, IP, or any relationship properties.
5. Export: Saves an isolated CSV copy of account_id -> pagerank_score in data/processed/graph_features/
   without touching data/processed/aml_150k_features.csv.
"""

import sys
import os
import time
from pathlib import Path
from typing import Dict, Any, List
import pandas as pd

# Add ml-service to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.graph import Neo4jConfig, get_neo4j_config, Neo4jConnectionManager

PROJECTION_NAME = "aml_account_transaction_graph"


def run_pagerank():
    config = get_neo4j_config()
    print("=" * 75)
    print(" PROJECT VIGILANCE — PHASE 3: GDS PAGERANK EXECUTION")
    print("=" * 75)
    print(f"Target Database : {config.database} on {config.uri}")

    conn_mgr = Neo4jConnectionManager(config)
    driver = conn_mgr.get_driver()

    with driver.session(database=config.database) as session:
        # Step 1: Check and drop old projection if exists
        print("\n[Step 1/5] Checking existing GDS projections...")
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

        # Step 2: Create GDS in-memory projection
        print(f"\n[Step 2/5] Creating GDS in-memory projection '{PROJECTION_NAME}'...")
        print("  - Node Label : Account")
        print("  - Rel Type   : TRANSACTED_TO (directed)")

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

        # Step 3: Run PageRank and write pagerank_score to Account nodes
        print(f"\n[Step 3/5] Running GDS PageRank algorithm and writing to 'pagerank_score' property...")
        pr_query = """
        CALL gds.pageRank.write(
            $name,
            {
                writeProperty: 'pagerank_score'
            }
        )
        YIELD nodePropertiesWritten, computeMillis, postProcessingMillis, writeMillis
        """
        pr_start = time.time()
        pr_res = session.run(pr_query, {"name": PROJECTION_NAME}).single()
        pr_elapsed = time.time() - pr_start

        print(f"  PageRank computation & write finished in {pr_elapsed:.2f}s:")
        print(f"  - Node properties written : {pr_res['nodePropertiesWritten']:,}")
        print(f"  - Compute time            : {pr_res['computeMillis']} ms")
        print(f"  - Write time              : {pr_res['writeMillis']} ms")

        # Step 4: Validate PageRank scores on Account nodes
        print("\n[Step 4/5] Performing read-only score validation...")
        val_query = """
        MATCH (a:Account)
        RETURN
            count(a) AS total_accounts,
            count(a.pagerank_score) AS scored_accounts,
            count(CASE WHEN a.pagerank_score IS NULL THEN 1 END) AS null_scores,
            min(a.pagerank_score) AS min_pr,
            max(a.pagerank_score) AS max_pr,
            avg(a.pagerank_score) AS avg_pr
        """
        val_res = session.run(val_query).single()

        print(f"  - Total Account nodes evaluated : {val_res['total_accounts']:,}")
        print(f"  - Accounts with pagerank_score  : {val_res['scored_accounts']:,}")
        print(f"  - Missing / Null scores         : {val_res['null_scores']:,}")
        print(f"  - Minimum PageRank              : {val_res['min_pr']:.6f}")
        print(f"  - Maximum PageRank              : {val_res['max_pr']:.6f}")
        print(f"  - Average PageRank              : {val_res['avg_pr']:.6f}")

        # Top 10 Accounts
        top_query = """
        MATCH (a:Account)
        RETURN a.account_id AS account_id, a.pagerank_score AS pagerank_score
        ORDER BY a.pagerank_score DESC
        LIMIT 10
        """
        top_res = session.run(top_query).data()
        print("\n  Top 10 Accounts by PageRank Score:")
        print("  " + "-" * 50)
        for rank, row in enumerate(top_res, 1):
            print(f"   {rank:2d}. {row['account_id']} : {row['pagerank_score']:.6f}")
        print("  " + "-" * 50)

        # Topology sanity check
        print("\n  Verifying overall graph topology counts...")
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

        # Export isolated PageRank scores to CSV for persistence
        out_dir = PROJECT_ROOT / "data" / "processed" / "graph_features"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "account_pagerank.csv"

        print(f"\n  Exporting isolated PageRank scores to {out_file}...")
        export_query = """
        MATCH (a:Account)
        RETURN a.account_id AS account_id, a.pagerank_score AS pagerank_score
        ORDER BY a.account_id ASC
        """
        export_data = session.run(export_query).data()
        export_df = pd.DataFrame(export_data)
        export_df.to_csv(out_file, index=False)
        print(f"  Exported {len(export_df):,} rows to {out_file}")

        # Step 5: Drop GDS in-memory projection
        print(f"\n[Step 5/5] Dropping GDS in-memory projection '{PROJECTION_NAME}'...")
        session.run("CALL gds.graph.drop($name) YIELD graphName", {"name": PROJECTION_NAME})
        exists_final = session.run(
            "CALL gds.graph.exists($name) YIELD exists",
            {"name": PROJECTION_NAME}
        ).single()["exists"]
        print(f"  Projection dropped successfully. In-memory exists: {exists_final}")

    print("\n" + "=" * 75)
    print(" PAGERANK COMPUTATION & VALIDATION COMPLETED SUCCESSFULLY")
    print("=" * 75)

    return {
        "val_res": val_res,
        "top_10": top_res,
        "topo_res": topo_res,
        "export_file": str(out_file),
    }


if __name__ == "__main__":
    run_pagerank()
