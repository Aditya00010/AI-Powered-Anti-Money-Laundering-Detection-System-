"""
Project Vigilance - AML Inference Package
=========================================
Package: app.inference

Exports:
- AMLInferenceEngine: Main production inference engine
- TransactionRiskResult: Dataclass schema for single transaction inference output
- normalize_isolation_forest_score: Pure mathematical normalization function
- calculate_final_risk_score: Final risk score calculation function
- assign_risk_tier: Operational risk tier categorization function
- Custom exceptions: InferenceError, ModelArtifactError, SchemaValidationError, etc.
"""

from .engine import (
    AMLInferenceEngine,
    normalize_isolation_forest_score,
    calculate_final_risk_score,
    assign_risk_tier,
    RAW_IDENTIFIER_COLUMNS,
)
from .schema import TransactionRiskResult
from .exceptions import (
    InferenceError,
    ModelArtifactError,
    SchemaValidationError,
    MissingFeaturesError,
    UnexpectedFeaturesError,
    DuplicateFeaturesError,
    FeatureOrderError,
    InvalidFeatureValueError,
)

__all__ = [
    "AMLInferenceEngine",
    "TransactionRiskResult",
    "normalize_isolation_forest_score",
    "calculate_final_risk_score",
    "assign_risk_tier",
    "RAW_IDENTIFIER_COLUMNS",
    "InferenceError",
    "ModelArtifactError",
    "SchemaValidationError",
    "MissingFeaturesError",
    "UnexpectedFeaturesError",
    "DuplicateFeaturesError",
    "FeatureOrderError",
    "InvalidFeatureValueError",
]
