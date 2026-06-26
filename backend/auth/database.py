"""Connexion MySQL pour la base d'authentification AskData.

Crée les tables au démarrage et expose get_db() comme dépendance FastAPI.
"""

from __future__ import annotations

import os
import time

import mysql.connector
from mysql.connector import pooling

# ── Configuration depuis variables d'environnement ───────────────────────────
_DB_CONFIG = {
    "host":     os.getenv("AUTH_DB_HOST", "mysql-auth"),
    "port":     int(os.getenv("AUTH_DB_PORT", "3306")),
    "user":     os.getenv("AUTH_DB_USER", "askdata"),
    "password": os.getenv("AUTH_DB_PASSWORD", "askdata_secret"),
    "database": os.getenv("AUTH_DB_NAME", "askdata_auth"),
}

_pool: pooling.MySQLConnectionPool | None = None


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="askdata_auth",
            pool_size=5,
            **_DB_CONFIG,
        )
    return _pool


def get_connection() -> mysql.connector.MySQLConnection:
    return _get_pool().get_connection()


def init_db(retries: int = 10, delay: float = 3.0) -> None:
    """Crée les tables si elles n'existent pas. Réessaie si MySQL n'est pas prêt."""
    for attempt in range(1, retries + 1):
        try:
            conn = get_connection()
            cur = conn.cursor()

            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    email       VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    role        ENUM('admin','user') NOT NULL DEFAULT 'user',
                    is_active   TINYINT(1) NOT NULL DEFAULT 1,
                    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    user_id         INT NOT NULL,
                    question_name   VARCHAR(255) NOT NULL,
                    question_text   TEXT NOT NULL,
                    database_name   VARCHAR(255),
                    schema_name     VARCHAR(255),
                    provider_name   VARCHAR(64),
                    rows_returned   INT DEFAULT 0,
                    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS kpis (
                    id              VARCHAR(64) NOT NULL PRIMARY KEY,
                    user_id         INT NOT NULL,
                    question_name   VARCHAR(255) NOT NULL,
                    question_text   TEXT NOT NULL,
                    column_name     VARCHAR(255),
                    value           VARCHAR(255),
                    raw_value       DOUBLE,
                    previous_value  DOUBLE,
                    database_name   VARCHAR(255),
                    schema_name     VARCHAR(255),
                    provider_name   VARCHAR(64),
                    pinned_at       BIGINT,
                    last_updated    BIGINT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS dashboard (
                    id              VARCHAR(64) NOT NULL PRIMARY KEY,
                    user_id         INT NOT NULL,
                    question_name   VARCHAR(255) NOT NULL,
                    question_text   TEXT,
                    chart_url       VARCHAR(512),
                    pinned_at       BIGINT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS llm_config (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    gemini_api_key  TEXT,
                    groq_api_key    TEXT,
                    groq_api_url    VARCHAR(512),
                    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            conn.commit()
            cur.close()
            conn.close()
            print("[auth] Tables créées/vérifiées avec succès.")
            return

        except Exception as exc:
            print(f"[auth] Tentative {attempt}/{retries} — MySQL pas prêt : {exc}")
            if attempt < retries:
                time.sleep(delay)

    raise RuntimeError("[auth] Impossible de se connecter à mysql-auth après plusieurs tentatives.")
