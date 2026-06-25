"""Découverte des bases de données et schémas disponibles (backend Agentic BI).

Ce module expose les fonctions pour lister :
- Les bases de données utilisateur accessibles (``list_databases``)
- Les schémas disponibles dans une base donnée (``list_schemas``)

Compatible MySQL et PostgreSQL. Le type de base est détecté automatiquement
depuis la configuration active.
"""

import os
from typing import List

from backend.utils.db_utils import run_query


def _db_type() -> str:
    """Retourne le type de base de données actif depuis la configuration runtime."""
    try:
        from backend.db_config import DatabaseConfigManager
        return DatabaseConfigManager.instance().get().db_type.lower()
    except Exception:
        # Fallback sur la variable d'environnement si le manager n'est pas disponible
        return os.getenv("DB_TYPE", "postgresql").lower()


def list_databases() -> List[str]:
    """Liste les bases de données utilisateur accessibles.

    Exclut les bases système (information_schema, mysql, performance_schema…).
    Lève une exception si la connexion à la base échoue.

    Returns:
        Liste triée des noms de bases de données
    """
    db_type = _db_type()

    if db_type == "mysql":
        # En MySQL : liste des schémas hors bases système
        sql = """
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN (
                'information_schema', 'mysql',
                'performance_schema', 'sys'
            )
            ORDER BY schema_name;
        """
        # Connexion à la base système "mysql" pour accéder à information_schema
        _, rows = run_query(sql, "mysql")
        return [row[0] for row in rows]
    else:
        # En PostgreSQL : liste des bases non-templates
        sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
        _, rows = run_query(sql, "postgres")
        return [row[0] for row in rows]


def list_schemas(database_name: str) -> List[str]:
    """Liste les schémas disponibles dans une base de données.

    En MySQL, le schéma est identique à la base de données.
    En PostgreSQL, exclut les schémas systèmes (pg_catalog, pg_toast…).

    Args:
        database_name: nom de la base de données cible

    Returns:
        Liste des schémas disponibles (vide si database_name est absent)
    """
    if not database_name:
        return []

    db_type = _db_type()

    if db_type == "mysql":
        # En MySQL, le schéma == la base de données (pas de notion de schéma distincte)
        return [database_name]
    else:
        # En PostgreSQL, on liste les schémas en excluant les schémas internes
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
