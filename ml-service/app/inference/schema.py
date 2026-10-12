"""
Project Vigilance - AML Inference Output Schemas
================================================
Module: app.inference.schema

Defines standardized data classes for single-transaction and batch inference results.
"""

from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any


@dataclass(frozen=True)
class TransactionRiskResult:
    """
    Standardized inference result container for a single transaction.

    Attributes:
        transaction_id: Transaction identifier (None if omitted during inference).
        xgb_probability: Supervised likelihood of laundering typology in [0.0, 1.0].
        xgb_score: Rescaled supervised score in [0.0, 100.0] (xgb_probability * 100).
        isolation_forest_raw_score: Raw anomaly score (-score_samples) in approx [0.35, 0.73].
        isolation_forest_score: Normalized anomaly score in [0.0, 100.0].
        final_risk_score: Baseline weighted score in [0.0, 100.0] (0.80*xgb + 0.20*if).
        risk_tier: Operational prioritization tier (LOW, MEDIUM, HIGH, CRITICAL).
    """
    transaction_id: Optional[str]
    xgb_probability: float
    xgb_score: float
    isolation_forest_raw_score: float
    isolation_forest_score: float
    final_risk_score: float
    risk_tier: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert the result into a clean dictionary representation."""
        return asdict(self)
