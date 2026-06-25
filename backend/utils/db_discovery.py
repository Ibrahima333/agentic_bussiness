import os
from typing import List

from backend.utils.db_utils import run_query


def _db_type() -> str:
    try:
        from backend.db_config import DatabaseConfigManager
        return DatabaseConfigManager.instance().get().db_type.lower()
    except Exception:
        return os.getenv("DB_TYPE", "postgresql").lower()


def list_databases() -> List[str]:
    """Liste les bases utilisateur — lève une exception si la connexion échoue."""
    db_type = _db_type()

    if db_type == "mysql":
        sql = """
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN (
                'information_schema', 'mysql',
                'performance_schema', 'sys'
            )
            ORDER BY schema_name;
        """
        _, rows = run_query(sql, "mysql")
        return [row[0] for row in rows]
    else:
        sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
        _, rows = run_query(sql, "postgres")
        return [row[0] for row in rows]


def list_schemas(database_name: str) -> List[str]:
    if not database_name:
        return []

    db_type = _db_type()

    if db_type == "mysql":
        return [database_name]
    else:
        sql = """
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
              AND schema_name NOT LIKE 'pg_toast%'
              AND schema_name NOT LIKE 'pg_temp%'
            ORDER BY schema_name;
        """
        _, rows = run_query(sql, database_name)
        return [row[0] for row in rows]
