"""
Project Vigilance - Neo4j Graph Database Configuration
======================================================
Module: ml-service/app/graph/config.py

Purpose:
Manages Neo4j connection settings securely using environment variables.
Password is never hard-coded in source code; it is loaded from .env or the system environment.
"""

import os
from pathlib import Path
from dataclasses import dataclass
from dotenv import load_dotenv

# Search for .env in project root or current working directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
env_candidates = [
    PROJECT_ROOT / ".env",
    Path.cwd() / ".env",
    Path(__file__).resolve().parent.parent.parent / ".env",
]

for env_path in env_candidates:
    if env_path.is_file():
        load_dotenv(dotenv_path=env_path)
        break


@dataclass(frozen=True)
class Neo4jConfig:
    """Immutable Neo4j connection configuration."""
    uri: str = os.getenv("NEO4J_URI", "neo4j://127.0.0.1:7687")
    user: str = os.getenv("NEO4J_USER", "neo4j")
    password: str = os.getenv("NEO4J_PASSWORD", "")
    database: str = os.getenv("NEO4J_DATABASE", "neo4j")
    batch_size: int = int(os.getenv("BATCH_SIZE", "5000"))

    def validate(self) -> None:
        """Validates that necessary configuration is provided."""
        if not self.uri:
            raise ValueError("NEO4J_URI is required.")
        if not self.user:
            raise ValueError("NEO4J_USER is required.")
        if not self.password:
            raise ValueError(
                "NEO4J_PASSWORD is not set. Please set it in your .env file or as an "
                "environment variable (e.g., NEO4J_PASSWORD=<password>)."
            )


def get_neo4j_config() -> Neo4jConfig:
    """Returns the current Neo4j configuration instance."""
    return Neo4jConfig()
