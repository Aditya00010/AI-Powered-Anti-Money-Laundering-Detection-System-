"""
Project Vigilance - Canonical Transaction & Ground Truth Schema
==============================================================
Module: ml-service/app/preprocessing/schema.py

Purpose:
Centralized, immutable canonical schema definitions for transaction ingestion,
validation, deterministic preprocessing, and downstream model feature safety.
"""

from typing import List, Set, Dict, Any

# 1. Exact canonical 17 operational transaction columns in required sequence
REQUIRED_TRANSACTION_COLUMNS: List[str] = [
    "transaction_id",
    "timestamp",
    "sender_account",
    "sender_name",
    "sender_customer_id",
    "receiver_account",
    "receiver_name",
    "receiver_customer_id",
    "amount",
    "currency",
    "channel",
    "ip_address",
    "device_id",
    "location_country",
    "location_city",
    "is_crypto",
    "crypto_wallet",
]

# 2. Mandatory columns that must never contain null or empty values
MANDATORY_NON_NULL_COLUMNS: Set[str] = {
    "transaction_id",
    "timestamp",
    "amount",
    "currency",
    "channel",
    "ip_address",
    "location_country",
    "location_city",
    "is_crypto",
}

# 3. Columns permitted to have legitimate missingness
NULLABLE_COLUMNS: Set[str] = {
    "sender_account",
    "sender_name",
    "sender_customer_id",
    "receiver_account",
    "receiver_name",
    "receiver_customer_id",
    "device_id",
    "crypto_wallet",
}

# 4. Approved Currencies (unsupported currencies fail validation)
APPROVED_CURRENCIES: Set[str] = {"INR", "USDT"}

# 5. Approved Payment Rails & Channels
APPROVED_CHANNELS: Set[str] = {
    "UPI",
    "IMPS",
    "NEFT",
    "Crypto Gateway",
    "RTGS",
    "Card",
}

# 6. Raw Identifier Policy: Entity and identifier attributes
# These must NOT be directly encoded as ordinary numerical predictors for XGBoost.
# They are preserved for graph construction, entity joins, velocity calculations, and investigation UI.
IDENTIFIER_COLUMNS: List[str] = [
    "transaction_id",
    "sender_account",
    "sender_customer_id",
    "receiver_account",
    "receiver_customer_id",
    "sender_name",
    "receiver_name",
    "ip_address",
    "device_id",
    "crypto_wallet",
]

# 7. Ground Truth Schema
GROUND_TRUTH_COLUMNS: List[str] = [
    "transaction_id",
    "ground_truth",
]

# 8. Expected Canonical Types for verification
COLUMN_DATA_TYPES: Dict[str, str] = {
    "transaction_id": "string",
    "timestamp": "datetime",
    "sender_account": "string",
    "sender_name": "string",
    "sender_customer_id": "string",
    "receiver_account": "string",
    "receiver_name": "string",
    "receiver_customer_id": "string",
    "amount": "float64",
    "currency": "string",
    "channel": "string",
    "ip_address": "string",
    "device_id": "string",
    "location_country": "string",
    "location_city": "string",
    "is_crypto": "boolean",
    "crypto_wallet": "string",
}

# 9. Deterministic Derived Features permitted in Phase 1
PHASE1_DERIVED_TEMPORAL_COLUMNS: List[str] = [
    "transaction_date",
    "transaction_hour",
    "transaction_weekday",
]
