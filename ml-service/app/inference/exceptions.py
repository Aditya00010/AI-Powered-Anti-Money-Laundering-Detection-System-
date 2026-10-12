"""
Project Vigilance - AML Inference Engine Exceptions
===================================================
Module: app.inference.exceptions

Defines specialized exception classes for strict schema validation,
missing feature rejection, raw identifier rejection, and model artifact errors.
"""


class InferenceError(Exception):
    """Base exception for all AML inference errors."""
    pass


class ModelArtifactError(InferenceError):
    """Raised when model files, configs, or metadata cannot be loaded or verified."""
    pass


class SchemaValidationError(InferenceError):
    """Base exception for input feature schema and formatting errors."""
    pass


class MissingFeaturesError(SchemaValidationError):
    """Raised when required features are missing from the input."""
    pass


class UnexpectedFeaturesError(SchemaValidationError):
    """Raised when unexpected features or raw identifiers are present."""
    pass


class DuplicateFeaturesError(SchemaValidationError):
    """Raised when duplicate feature names are detected in the input."""
    pass


class FeatureOrderError(SchemaValidationError):
    """Raised when features are not in the exact expected ordering."""
    pass


class InvalidFeatureValueError(InferenceError):
    """Raised when feature values contain NaN or infinite values."""
    pass
