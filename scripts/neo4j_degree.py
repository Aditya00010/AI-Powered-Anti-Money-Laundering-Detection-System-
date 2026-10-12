"""
Project Vigilance - Neo4j GDS Account Degree Centrality Execution Script
========================================================================
Script: scripts/neo4j_degree.py

Purpose:
Calculates directional degree centrality (in_degree and out_degree) on:
    (:Account)-[:TRANSACTED_TO]->(:Account)
using Neo4j Graph Data Science (GDS).

Key Guarantees:
1. Target Graph: Pure Account-to-Account directed transaction edges.
2. In-memory Projection: 'aml_account_transaction_degree' (dropped safely upon completion).
3. Persistent Properties:
   - Writes 'out_degree' onto (:Account) nodes (orientation: NATURAL).
   - Writes 'in_degree' onto (:Account) nodes (orientation: REVERSE).
4. Preserves Existing Properties: Does NOT alter or overwrite 'pagerank_score' or 'louvain_community_id'.
5. Non-destructive: Does NOT alter Customer, Device, IP, or any relationship properties.
6. Export: Saves an isolated CSV copy of account_id -> in_degree, out_degree in data/processed/graph_features/
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

PROJECTION_NAME = "aml_account_transaction_degree"


def run_degree_centrality():
    config = get_neo4j_config()
    print("=" * 75)
    print(" PROJECT VIGILANCE — PHASE 3: GDS ACCOUNT DEGREE CENTRALITY")
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

        # Step 3: Run GDS Degree Centrality writes
        print("\n[Step 3/5] Running GDS Degree writes...")
        
        # 3a. Out-degree (NATURAL orientation)
        print("  Computing and writing 'out_degree' (orientation: NATURAL)...")
        out_start = time.time()
        out_res = session.run("""
            CALL gds.degree.write(
                $name,
                {
                    writeProperty: 'out_degree',
                    orientation: 'NATURAL'
                }
            )
            YIELD nodePropertiesWritten, computeMillis, writeMillis
        """, {"name": PROJECTION_NAME}).single()
        out_elapsed = time.time() - out_start
        print(f"  -> Out-degree properties written : {out_res['nodePropertiesWritten']:,} (in {out_elapsed:.2f}s)")

        # 3b. In-degree (REVERSE orientation)
        print("  Computing and writing 'in_degree' (orientation: REVERSE)...")
        in_start = time.time()
        in_res = session.run("""
            CALL gds.degree.write(
                $name,
                {
                    writeProperty: 'in_degree',
                    orientation: 'REVERSE'
                }
            )
            YIELD nodePropertiesWritten, computeMillis, writeMillis
        """, {"name": PROJECTION_NAME}).single()
        in_elapsed = time.time() - in_start
        print(f"  -> In-degree properties written  : {in_res['nodePropertiesWritten']:,} (in {in_elapsed:.2f}s)")

        # Step 4: Validate Degree Centrality properties on Account nodes
        print("\n[Step 4/5] Performing read-only degree validation...")
        val_query = """
        MATCH (a:Account)
        RETURN
            count(a) AS total_accounts,
            count(a.in_degree) AS scored_in_degree,
            count(a.out_degree) AS scored_out_degree,
            count(CASE WHEN a.in_degree IS NULL THEN 1 END) AS null_in_degree,
            count(CASE WHEN a.out_degree IS NULL THEN 1 END) AS null_out_degree,
            min(a.in_degree) AS min_in,
            max(a.in_degree) AS max_in,
            avg(a.in_degree) AS avg_in,
            percentileCont(a.in_degree, 0.5) AS median_in,
            min(a.out_degree) AS min_out,
            max(a.out_degree) AS max_out,
            avg(a.out_degree) AS avg_out,
            percentileCont(a.out_degree, 0.5) AS median_out,
            count(a.pagerank_score) AS accounts_with_pagerank,
            count(CASE WHEN a.pagerank_score IS NULL THEN 1 END) AS null_pageranks,
            count(a.louvain_community_id) AS accounts_with_louvain,
            count(CASE WHEN a.louvain_community_id IS NULL THEN 1 END) AS null_louvain
        """
        val_res = session.run(val_query).single()

        print(f"  - Total Account nodes evaluated : {val_res['total_accounts']:,}")
        print(f"  - Accounts with in_degree       : {val_res['scored_in_degree']:,}")
        print(f"  - Accounts with out_degree      : {val_res['scored_out_degree']:,}")
        print(f"  - Missing / Null in_degree      : {val_res['null_in_degree']:,}")
        print(f"  - Missing / Null out_degree     : {val_res['null_out_degree']:,}")
        print("\n  In-Degree Statistics:")
        print(f"  - Minimum in_degree             : {int(val_res['min_in'])}")
        print(f"  - Maximum in_degree             : {int(val_res['max_in'])}")
        print(f"  - Mean in_degree                : {val_res['avg_in']:.4f}")
        print(f"  - Median in_degree              : {val_res['median_in']:.1f}")
        print("\n  Out-Degree Statistics:")
        print(f"  - Minimum out_degree            : {int(val_res['min_out'])}")
        print(f"  - Maximum out_degree            : {int(val_res['max_out'])}")
        print(f"  - Mean out_degree               : {val_res['avg_out']:.4f}")
        print(f"  - Median out_degree             : {val_res['median_out']:.1f}")
        print("\n  Prior Algorithm Integrity:")
        print(f"  - Accounts with pagerank_score  : {val_res['accounts_with_pagerank']:,} (null: {val_res['null_pageranks']})")
        print(f"  - Accounts with louvain_comm_id : {val_res['accounts_with_louvain']:,} (null: {val_res['null_louvain']})")

        # Top 10 by in_degree
        top_in_query = """
        MATCH (a:Account)
        RETURN a.account_id AS account_id, a.in_degree AS in_degree
        ORDER BY a.in_degree DESC, a.account_id ASC
        LIMIT 10
        """
        top_in_res = session.run(top_in_query).data()
        print("\n  Top 10 Accounts by In-Degree (Incoming Transactions):")
        print("  " + "-" * 45)
        print(f"   {'Rank':<5} | {'Account ID':<18} | {'In-Degree':<10}")
        print("  " + "-" * 45)
        for rank, row in enumerate(top_in_res, 1):
            print(f"   {rank:<5} | {row['account_id']:<18} | {int(row['in_degree']):<10}")
        print("  " + "-" * 45)

        # Top 10 by out_degree
        top_out_query = """
        MATCH (a:Account)
        RETURN a.account_id AS account_id, a.out_degree AS out_degree
        ORDER BY a.out_degree DESC, a.account_id ASC
        LIMIT 10
        """
        top_out_res = session.run(top_out_query).data()
        print("\n  Top 10 Accounts by Out-Degree (Outgoing Transactions):")
        print("  " + "-" * 45)
        print(f"   {'Rank':<5} | {'Account ID':<18} | {'Out-Degree':<10}")
        print("  " + "-" * 45)
        for rank, row in enumerate(top_out_res, 1):
            print(f"   {rank:<5} | {row['account_id']:<18} | {int(row['out_degree']):<10}")
        print("  " + "-" * 45)

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

        # Export isolated degree features to CSV
        out_dir = PROJECT_ROOT / "data" / "processed" / "graph_features"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "account_degree.csv"

        print(f"\n  Exporting isolated Account Degree features to {out_file}...")
        export_query = """
        MATCH (a:Account)
        RETURN
            a.account_id AS account_id,
            toInteger(a.in_degree) AS in_degree,
            toInteger(a.out_degree) AS out_degree
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
    print(" ACCOUNT DEGREE CENTRALITY & VALIDATION COMPLETED SUCCESSFULLY")
    print("=" * 75)

    return {
        "val_res": val_res,
        "top_in": top_in_res,
        "top_out": top_out_res,
        "topo_res": topo_res,
        "export_file": str(out_file),
    }


if __name__ == "__main__":
    run_degree_centrality()
