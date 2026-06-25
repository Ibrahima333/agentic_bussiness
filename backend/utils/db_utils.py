import os
from dotenv import load_dotenv

load_dotenv()


def _get_config():
    """Retourne la config DB active (runtime UI en priorité, env vars en fallback)."""
    try:
        from backend.db_config import DatabaseConfigManager
        return DatabaseConfigManager.instance().get()
    except Exception:
        return None


def _db_type() -> str:
    cfg = _get_config()
    if cfg:
        return cfg.db_type.lower()
    return os.getenv("DB_TYPE", "postgresql").lower()


def get_connection(database_name: str):
    """Établit une connexion MySQL ou PostgreSQL selon la config active."""
    cfg = _get_config()

    if cfg:
        db_type = cfg.db_type.lower()
        host = cfg.host
        port = cfg.port
        user = cfg.user
        password = cfg.password
        # database_name peut être différent de cfg.database (ex: connexion à 'mysql' pour SHOW DATABASES)
    else:
        db_type = os.getenv("DB_TYPE", "postgresql").lower()
        host = os.getenv("DB_HOST", "localhost")
        port = int(os.getenv("DB_PORT", "3306" if db_type == "mysql" else "5432"))
        user = os.getenv("DB_USER", "root")
        password = os.getenv("DB_PASSWORD", "")

    if db_type == "mysql":
        import mysql.connector
        return mysql.connector.connect(
            host=host,
            port=int(port),
            database=database_name,
            user=user,
            password=password,
        )
    else:
        import psycopg2
        return psycopg2.connect(
            host=host,
            port=int(port),
            dbname=database_name,
            user=user,
            password=password,
        )


def run_query(sql: str, database_name: str, params: tuple = None):
    """Exécute une requête SQL et retourne (columns, rows)."""
    conn = get_connection(database_name)
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        if cur.description:
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
        else:
            columns, rows = [], []
        cur.close()
    finally:
        conn.close()
    return columns, rows
