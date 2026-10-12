"""
Project Vigilance - Neo4j Connection Manager
============================================
Module: ml-service/app/graph/connection.py

Purpose:
Provides lifecycle management for Neo4j driver connections.
Ensures zero hardcoded credentials, clean connection verification, and proper resource cleanup.
"""

from typing import Optional, Any
from neo4j import GraphDatabase, Driver
from .config import Neo4jConfig, get_neo4j_config


class Neo4jConnectionManager:
    """Manages lifecycle of Neo4j driver and sessions."""

    def __init__(self, config: Optional[Neo4jConfig] = None):
        self.config = config or get_neo4j_config()
        self._driver: Optional[Driver] = None

    def get_driver(self) -> Driver:
        """Returns active Neo4j driver instance, initializing if needed."""
        if self._driver is None:
            self.config.validate()
            self._driver = GraphDatabase.driver(
                self.config.uri,
                auth=(self.config.user, self.config.password),
            )
        return self._driver

    def verify_connectivity(self) -> bool:
        """
        Verifies connectivity and authentication against the running Neo4j instance.
        Returns True if connected, raises an informative exception otherwise.
        """
        driver = self.get_driver()
        driver.verify_connectivity()
        return True

    def close(self) -> None:
        """Closes the active Neo4j driver."""
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    def __enter__(self) -> "Neo4jConnectionManager":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()
