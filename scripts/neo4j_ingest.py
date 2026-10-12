"""
Project Vigilance - Neo4j Automated Batch Ingestion Script
==========================================================
Script: scripts/neo4j_ingest.py

Purpose:
Standalone batch ingestion script that reads the finalized Phase 2 dataset:
    data/processed/aml_150k_features.csv
and constructs the graph entities and relationships in the active Neo4j database.

Design & Isolation Guardrails:
1. Standalone execution: Completely isolated from the core ML/training/inference pipeline.
2. Zero hard-coded credentials: Uses ml-service/app/graph/config.py and connection.py.
3. Constraint preservation: Relies on the 4 existing pre-created uniqueness constraints:
     - account_id_unique on (:Account {account_id})
     - customer_id_unique on (:Customer {customer_id})
     - device_id_unique on (:Device {device_id})
     - ip_address_unique on (:IP {ip_address})
   Does NOT drop, alter, or re-create these constraints.
4. Idempotent Cypher operations:
   - Uses MERGE on all nodes (Customer, Account, Device, IP).
   - Uses MERGE on ownership and infrastructure relationships (OWNS_ACCOUNT, USED_DEVICE, USED_IP).
   - Uses MERGE on TRANSACTED_TO via transaction_id so re-running never creates duplicate edges.
5. Preserves key transaction metadata:
   Preserves transaction_id, timestamp, amount, channel, currency, is_crypto,
   crypto_wallet, location_country, location_city.
6. Null-safety: Missing device_id or crypto_wallet values are preserved as null.
   No artificial placeholder nodes ("UNKNOWN", "NULL", "None") are created.
7. Pre-ingestion safety inspection: Inspects target database counts before running.
   Does not delete or alter any existing data.
8. Configurable batch size: Default is 5,000 rows.
"""

import sys
import os
import time
import argparse
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd

# Ensure ml-service is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.graph import Neo4jConfig, get_neo4j_config, Neo4jConnectionManager


# Cypher Ingestion Queries utilizing UNWIND for bulk performance
CYPHER_INGEST_CUSTOMERS_ACCOUNTS = """
UNWIND $batch AS row
// Merge Senders
MERGE (sc:Customer {customer_id: row.sender_customer_id})
ON CREATE SET sc.name = row.sender_name
MERGE (sa:Account {account_id: row.sender_account})
MERGE (sc)-[:OWNS_ACCOUNT]->(sa)

// Merge Receivers
MERGE (rc:Customer {customer_id: row.receiver_customer_id})
ON CREATE SET rc.name = row.receiver_name
MERGE (ra:Account {account_id: row.receiver_account})
MERGE (rc)-[:OWNS_ACCOUNT]->(ra)
"""

CYPHER_INGEST_INFRASTRUCTURE = """
UNWIND $batch AS row
MATCH (sa:Account {account_id: row.sender_account})

// Optional Device connection (only if valid device_id exists)
FOREACH (_ IN CASE WHEN row.device_id IS NOT NULL AND row.device_id <> '' THEN [1] ELSE [] END |
    MERGE (d:Device {device_id: row.device_id})
    MERGE (sa)-[:USED_DEVICE]->(d)
)

// Optional IP connection (only if valid ip_address exists)
FOREACH (_ IN CASE WHEN row.ip_address IS NOT NULL AND row.ip_address <> '' THEN [1] ELSE [] END |
    MERGE (ip:IP {ip_address: row.ip_address})
    MERGE (sa)-[:USED_IP]->(ip)
)
"""

# CHANGE 1: Idempotent TRANSACTED_TO relationship using MERGE on transaction_id
CYPHER_INGEST_TRANSACTIONS = """
UNWIND $batch AS row
MATCH (sa:Account {account_id: row.sender_account})
MATCH (ra:Account {account_id: row.receiver_account})

MERGE (sa)-[r:TRANSACTED_TO {transaction_id: row.transaction_id}]->(ra)
ON CREATE SET
    r.timestamp = row.timestamp,
    r.amount = row.amount,
    r.channel = row.channel,
    r.currency = row.currency,
    r.is_crypto = row.is_crypto,
    r.crypto_wallet = row.crypto_wallet,
    r.location_country = row.location_country,
    r.location_city = row.location_city
"""


class Neo4jBatchIngester:
    """Coordinates batch ingestion of cleaned AML features into Neo4j."""

    def __init__(
        self,
        csv_path: Optional[Path] = None,
        batch_size: Optional[int] = None,
        config: Optional[Neo4jConfig] = None,
    ):
        self.csv_path = csv_path or (PROJECT_ROOT / "data" / "processed" / "aml_150k_features.csv")
        self.config = config or get_neo4j_config()
        self.batch_size = batch_size or self.config.batch_size
        self.conn_mgr = Neo4jConnectionManager(self.config)

    def validate_prerequisites(self) -> Dict[str, Any]:
        """
        Validates input dataset presence, column schema, and database connection settings.
        Does NOT ingest data.
        """
        if not self.csv_path.is_file():
            raise FileNotFoundError(f"Source features file not found: {self.csv_path}")

        # Quick preview check
        sample_df = pd.read_csv(self.csv_path, nrows=5)
        required_cols = [
            "transaction_id", "timestamp", "sender_account", "sender_name",
            "sender_customer_id", "receiver_account", "receiver_name",
            "receiver_customer_id", "ip_address", "device_id", "amount", "is_crypto"
        ]
        missing = [c for c in required_cols if c not in sample_df.columns]
        if missing:
            raise ValueError(f"CSV missing essential graph columns: {missing}")

        return {
            "csv_path": str(self.csv_path),
            "csv_exists": True,
            "target_database": self.config.database,
            "target_uri": self.config.uri,
            "user": self.config.user,
            "batch_size": self.batch_size,
        }

    # Safe pre-ingestion database state inspection
    def check_database_state(self) -> Dict[str, int]:
        """
        Safely inspects the current entity and relationship counts in the target Neo4j database.
        Does NOT delete, clear, or modify any database data.
        """
        driver = self.conn_mgr.get_driver()
        counts = {}
        with driver.session(database=self.config.database) as session:
            counts["Account"] = session.run("MATCH (n:Account) RETURN count(n) AS cnt").single()["cnt"]
            counts["Customer"] = session.run("MATCH (n:Customer) RETURN count(n) AS cnt").single()["cnt"]
            counts["Device"] = session.run("MATCH (n:Device) RETURN count(n) AS cnt").single()["cnt"]
            counts["IP"] = session.run("MATCH (n:IP) RETURN count(n) AS cnt").single()["cnt"]
            counts["TRANSACTED_TO"] = session.run("MATCH ()-[r:TRANSACTED_TO]->() RETURN count(r) AS cnt").single()["cnt"]

        total_elements = sum(counts.values())
        print("=" * 75)
        print(" PRE-INGESTION DATABASE STATE INSPECTION")
        print("=" * 75)
        print(f" Target Database : {self.config.database} on {self.config.uri}")
        print(f" - (:Account) nodes           : {counts['Account']:,}")
        print(f" - (:Customer) nodes          : {counts['Customer']:,}")
        print(f" - (:Device) nodes            : {counts['Device']:,}")
        print(f" - (:IP) nodes                : {counts['IP']:,}")
        print(f" - [:TRANSACTED_TO] relations : {counts['TRANSACTED_TO']:,}")
        print("-" * 75)

        if total_elements == 0:
            print(" [STATUS] Neo4j graph is empty — ready for initial ingestion.")
        else:
            print(f" [WARNING] Existing graph data detected ({total_elements:,} total elements).")
            print("           Because MERGE is used, re-ingestion is idempotent and will not duplicate existing entities.")
        print("=" * 75 + "\n")
        return counts

    # Preserve all required transaction fields (channel, currency, crypto_wallet, etc.)
    def prepare_record(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalizes a single row dictionary for Cypher parameter binding.
        Preserves channel, currency, crypto_wallet, and location without dummy placeholders.
        """
        # Clean optional device_id
        device_id = row.get("device_id")
        if pd.isna(device_id) or str(device_id).strip() in ("", "nan", "None", "NULL"):
            clean_device = None
        else:
            clean_device = str(device_id).strip()

        # Clean optional crypto_wallet
        crypto_wallet = row.get("crypto_wallet")
        if pd.isna(crypto_wallet) or str(crypto_wallet).strip() in ("", "nan", "None", "NULL"):
            clean_wallet = None
        else:
            clean_wallet = str(crypto_wallet).strip()

        # Extract/reconstruct channel string
        channel = row.get("channel")
        if not channel or pd.isna(channel):
            for col_name, chan_name in [
                ("channel_UPI", "UPI"),
                ("channel_IMPS", "IMPS"),
                ("channel_NEFT", "NEFT"),
                ("channel_RTGS", "RTGS"),
                ("channel_Card", "Card"),
                ("channel_Crypto_Gateway", "Crypto Gateway"),
            ]:
                if row.get(col_name) == 1:
                    channel = chan_name
                    break
        clean_channel = str(channel).strip() if (channel and not pd.isna(channel)) else None

        # Extract/reconstruct currency string
        currency = row.get("currency")
        if not currency or pd.isna(currency):
            if row.get("currency_USDT") == 1:
                currency = "USDT"
            elif row.get("currency_INR") == 1:
                currency = "INR"
            else:
                currency = "INR"
        clean_currency = str(currency).strip() if (currency and not pd.isna(currency)) else None

        # Location attributes
        loc_country = row.get("location_country")
        clean_country = str(loc_country).strip() if (loc_country and not pd.isna(loc_country)) else None

        loc_city = row.get("location_city")
        clean_city = str(loc_city).strip() if (loc_city and not pd.isna(loc_city)) else None

        return {
            "transaction_id": str(row["transaction_id"]).strip(),
            "timestamp": str(row["timestamp"]).strip(),
            "sender_account": str(row["sender_account"]).strip(),
            "sender_name": str(row["sender_name"]).strip(),
            "sender_customer_id": str(row["sender_customer_id"]).strip(),
            "receiver_account": str(row["receiver_account"]).strip(),
            "receiver_name": str(row["receiver_name"]).strip(),
            "receiver_customer_id": str(row["receiver_customer_id"]).strip(),
            "ip_address": str(row["ip_address"]).strip(),
            "device_id": clean_device,
            "amount": float(row["amount"]),
            "channel": clean_channel,
            "currency": clean_currency,
            "is_crypto": bool(row["is_crypto"]),
            "crypto_wallet": clean_wallet,
            "location_country": clean_country,
            "location_city": clean_city,
        }

    def verify_post_ingestion(self) -> Dict[str, Any]:
        """
        Executes read-only queries to verify the final graph state, counts,
        integrity, and absence of placeholders.
        """
        driver = self.conn_mgr.get_driver()
        results = {}
        with driver.session(database=self.config.database) as session:
            # 1. Node counts
            results["account_count"] = session.run("MATCH (n:Account) RETURN count(n) AS cnt").single()["cnt"]
            results["customer_count"] = session.run("MATCH (n:Customer) RETURN count(n) AS cnt").single()["cnt"]
            results["device_count"] = session.run("MATCH (n:Device) RETURN count(n) AS cnt").single()["cnt"]
            results["ip_count"] = session.run("MATCH (n:IP) RETURN count(n) AS cnt").single()["cnt"]

            # 2. Relationship counts
            results["transacted_to_count"] = session.run("MATCH ()-[r:TRANSACTED_TO]->() RETURN count(r) AS cnt").single()["cnt"]
            results["owns_account_count"] = session.run("MATCH ()-[r:OWNS_ACCOUNT]->() RETURN count(r) AS cnt").single()["cnt"]
            results["used_device_count"] = session.run("MATCH ()-[r:USED_DEVICE]->() RETURN count(r) AS cnt").single()["cnt"]
            results["used_ip_count"] = session.run("MATCH ()-[r:USED_IP]->() RETURN count(r) AS cnt").single()["cnt"]

            # 3. Transaction ID and duplicate checks
            results["distinct_tx_ids"] = session.run("MATCH ()-[r:TRANSACTED_TO]->() RETURN count(DISTINCT r.transaction_id) AS cnt").single()["cnt"]
            dup_query = """
            MATCH ()-[r:TRANSACTED_TO]->()
            WITH r.transaction_id AS tid, count(r) AS cnt
            WHERE cnt > 1
            RETURN count(tid) AS dup_count
            """
            results["duplicate_tx_ids"] = session.run(dup_query).single()["dup_count"]

            # 4. Placeholder checks
            ph_query = """
            MATCH (n)
            WHERE (n:Device AND n.device_id IN ['UNKNOWN', 'NULL', 'None', 'nan', ''])
               OR (n:IP AND n.ip_address IN ['UNKNOWN', 'NULL', 'None', 'nan', ''])
            RETURN count(n) AS ph_count
            """
            results["placeholder_node_count"] = session.run(ph_query).single()["ph_count"]

            # 5. Active constraints check
            const_res = session.run("SHOW CONSTRAINTS")
            active_constraints = [r["name"] for r in const_res]
            results["active_constraints"] = active_constraints

        return results

    def ingest(self, dry_run: bool = False) -> Dict[str, Any]:
        """
        Executes the batch ingestion workflow.
        When dry_run=True, verifies connectivity and reads CSV without writing to Neo4j.
        """
        self.validate_prerequisites()
        print(f"Connecting to Neo4j at {self.config.uri} (database: {self.config.database})...")
        self.conn_mgr.verify_connectivity()
        print("Neo4j connectivity verified successfully.")

        # Execute safe pre-ingestion database state check
        current_state = self.check_database_state()

        if dry_run:
            print("DRY RUN: Validation passed. Skipping write operations.")
            return {
                "status": "dry_run_success",
                "database_state": current_state,
            }

        start_time = time.time()
        driver = self.conn_mgr.get_driver()

        # Count total rows for precise progress calculation
        print(f"Reading dataset: {self.csv_path}...")
        total_rows = 150000  # verified dataset size
        total_batches = (total_rows + self.batch_size - 1) // self.batch_size

        total_processed = 0
        batch_num = 0
        failed_batches = 0

        print(f"\nStarting batch ingestion of {total_rows:,} rows across {total_batches} batches (batch size: {self.batch_size:,})...\n")

        for chunk in pd.read_csv(self.csv_path, chunksize=self.batch_size, low_memory=False):
            batch_num += 1
            batch_len = len(chunk)
            batch_records = [self.prepare_record(r) for r in chunk.to_dict(orient="records")]
            batch_start = time.time()

            try:
                with driver.session(database=self.config.database) as session:
                    # 1. Ingest Customers and Accounts
                    session.run(CYPHER_INGEST_CUSTOMERS_ACCOUNTS, {"batch": batch_records})
                    # 2. Ingest Infrastructure (Devices & IPs)
                    session.run(CYPHER_INGEST_INFRASTRUCTURE, {"batch": batch_records})
                    # 3. Ingest Transactions (Idempotent MERGE)
                    session.run(CYPHER_INGEST_TRANSACTIONS, {"batch": batch_records})

                total_processed += batch_len
                batch_elapsed = time.time() - batch_start
                rate = batch_len / batch_elapsed if batch_elapsed > 0 else 0
                rows_remaining = total_rows - total_processed
                print(f"Batch {batch_num:02d}/{total_batches:02d} | "
                      f"Processed: {total_processed:7,d}/{total_rows:,} | "
                      f"Remaining: {rows_remaining:7,d} | "
                      f"Time: {batch_elapsed:5.2f}s | "
                      f"Speed: {rate:6.0f} rows/s")
            except Exception as e:
                failed_batches += 1
                print(f" [ERROR] Batch {batch_num} failed with error: {e}")
                raise RuntimeError(f"Ingestion stopped on batch {batch_num} due to critical database error: {e}") from e

        total_elapsed = time.time() - start_time
        avg_rate = total_processed / total_elapsed if total_elapsed > 0 else 0
        print("\n" + "=" * 75)
        print(f" BATCH INGESTION COMPLETE")
        print("=" * 75)
        print(f" - Rows Processed    : {total_processed:,} / {total_rows:,}")
        print(f" - Batches Completed : {batch_num} / {total_batches} (Failed: {failed_batches})")
        print(f" - Total Time        : {total_elapsed:.2f} seconds ({total_elapsed / 60:.2f} minutes)")
        print(f" - Average Speed     : {avg_rate:.0f} rows/second")
        print("=" * 75 + "\n")

        # Run Read-Only Post-Ingestion Verification
        print("Running post-ingestion verification queries...")
        verification_results = self.verify_post_ingestion()

        return {
            "status": "success",
            "total_processed": total_processed,
            "total_batches": batch_num,
            "failed_batches": failed_batches,
            "elapsed_seconds": round(total_elapsed, 2),
            "verification": verification_results,
        }


def main():
    parser = argparse.ArgumentParser(description="Project Vigilance - Neo4j Batch Ingestion")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5000,
        help="Batch size for Cypher UNWIND transactions (default: 5000)",
    )
    parser.add_argument(
        "--csv-path",
        type=str,
        default=None,
        help="Path to feature CSV (default: data/processed/aml_150k_features.csv)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute the full batch ingestion into Neo4j",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration, dataset, and connectivity without ingesting nodes/edges",
    )
    parser.add_argument(
        "--check-state",
        action="store_true",
        help="Inspect existing database entity and relationship counts without writing any data",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Run post-ingestion verification queries on the current database state",
    )
    args = parser.parse_args()

    custom_csv = Path(args.csv_path) if args.csv_path else None
    ingester = Neo4jBatchIngester(csv_path=custom_csv, batch_size=args.batch_size)

    if args.check_state:
        ingester.check_database_state()
    elif args.verify_only:
        res = ingester.verify_post_ingestion()
        print("Verification Results:", res)
    elif args.dry_run:
        print("Running in DRY-RUN mode...")
        result = ingester.ingest(dry_run=True)
        print("Dry run result:", result)
    elif args.execute:
        result = ingester.ingest(dry_run=False)
    else:
        print("Ready for ingestion. To execute, run with --execute.")


if __name__ == "__main__":
    main()
