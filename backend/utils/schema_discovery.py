import os
from typing import List

from backend.utils.db_utils import run_query


def _db_type() -> str:
    return os.getenv("DB_TYPE", "postgresql").lower()


def get_schema_markdown(database_name: str, schema_name: str) -> str:
    """
    Génère un markdown décrivant toutes les tables et colonnes
    du schéma donné (MySQL ou PostgreSQL).
    """
    db_type = _db_type()

    if db_type == "mysql":
        # En MySQL, schema_name == database_name
        target_db = schema_name if schema_name else database_name
        sql_tables = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """
        try:
            _, rows = run_query(sql_tables, target_db, (target_db,))
            tables = [r[0] for r in rows]
        except Exception as e:
            return f"Erreur lors de la récupération des tables MySQL : {e}"

        lines = [f"# Schéma MySQL : `{target_db}`\n"]
        for table in tables:
            sql_cols = """
                SELECT column_name, column_type, is_nullable, column_key, column_default
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position;
            """
            try:
                _, col_rows = run_query(sql_cols, target_db, (target_db, table))
            except Exception:
                col_rows = []

            lines.append(f"## Table `{table}`\n")
            lines.append("| Colonne | Type | Nullable | Clé | Défaut |")
            lines.append("|---------|------|----------|-----|--------|")
            for col in col_rows:
                col_name, col_type, nullable, key, default = col
                lines.append(f"| {col_name} | {col_type} | {nullable} | {key or ''} | {default or ''} |")
            lines.append("")
        return "\n".join(lines)

    else:
        # PostgreSQL
        sql_tables = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """
        try:
            _, rows = run_query(sql_tables, database_name, (schema_name,))
            tables = [r[0] for r in rows]
        except Exception as e:
            return f"Erreur lors de la récupération des tables PostgreSQL : {e}"

        lines = [f"# Schéma PostgreSQL : `{database_name}.{schema_name}`\n"]
        for table in tables:
            sql_cols = """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position;
            """
            try:
                _, col_rows = run_query(sql_cols, database_name, (schema_name, table))
            except Exception:
                col_rows = []

            lines.append(f"## Table `{table}`\n")
            lines.append("| Colonne | Type | Nullable | Défaut |")
            lines.append("|---------|------|----------|--------|")
            for col in col_rows:
                col_name, data_type, nullable, default = col
                lines.append(f"| {col_name} | {data_type} | {nullable} | {default or ''} |")
            lines.append("")
        return "\n".join(lines)
