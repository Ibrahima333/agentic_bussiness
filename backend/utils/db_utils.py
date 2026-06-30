"""Utilitaires de connexion et d'exécution SQL (backend Agentic BI).

Ce module fournit les fonctions bas niveau pour :
- Établir une connexion à une base PostgreSQL ou MySQL
- Exécuter une requête SQL et retourner les résultats

La configuration de connexion est lue depuis le gestionnaire singleton
:class:`DatabaseConfigManager`, avec fallback sur les variables d'environnement.
"""

import os
from dotenv import load_dotenv

# Chargement des variables d'environnement depuis .env (si présent)
load_dotenv()


def _get_config():
    """Retourne la config DB active depuis le gestionnaire runtime.

    Retourne None si le gestionnaire n'est pas disponible (ex : import circulaire).
    """
    try:
        from backend.db_config import DatabaseConfigManager
        return DatabaseConfigManager.instance().get()
    except Exception:
        return None


def _db_type() -> str:
    """Retourne le type de base de données actif ("postgresql" ou "mysql")."""
    cfg = _get_config()
    if cfg:
        return cfg.db_type.lower()
    # Fallback sur la variable d'environnement
    return os.getenv("DB_TYPE", "postgresql").lower()


def get_connection(database_name: str):
    """Établit et retourne une connexion MySQL ou PostgreSQL selon la config active.

    Args:
        database_name: nom de la base de données à laquelle se connecter.
                       Peut différer de cfg.database (ex : "mysql" pour SHOW DATABASES).

    Returns:
        Objet connexion mysql.connector ou psycopg2

    Raises:
        Exception: si la connexion échoue (propagée telle quelle)
    """
    cfg = _get_config()

    if cfg:
        # Utilisation de la configuration runtime (interface web)
        db_type = cfg.db_type.lower()
        host = cfg.host
        port = cfg.port
        user = cfg.user
        password = cfg.password
    else:
        # Fallback sur les variables d'environnement
        db_type = os.getenv("DB_TYPE", "postgresql").lower()
        host = os.getenv("DB_HOST", "localhost")
        port = int(os.getenv("DB_PORT", "3306" if db_type == "mysql" else "5432"))
        user = os.getenv("DB_USER", "root")
        password = os.getenv("DB_PASSWORD", "")

    if db_type == "mysql":
        # Connexion MySQL via mysql-connector-python
        import mysql.connector
        return mysql.connector.connect(
            host=host,
            port=int(port),
            database=database_name,
            user=user,
            password=password,
        )
    else:
        # Pour PostgreSQL, si database_name est vide ou ressemble à un schéma
        # (ex: "public"), utiliser le vrai nom de base depuis la config runtime.
        pg_dbname = database_name
        if cfg and (not pg_dbname or pg_dbname == (cfg.schema or "public")):
            if cfg.database:
                pg_dbname = cfg.database

        import psycopg2
        return psycopg2.connect(
            host=host,
            port=int(port),
            dbname=pg_dbname,
            user=user,
            password=password,
        )


def run_query(sql: str, database_name: str, params: tuple = None):
    """Exécute une requête SQL et retourne les colonnes et les lignes.

    Args:
        sql: requête SQL à exécuter
        database_name: base de données cible
        params: paramètres à passer à la requête (pour les requêtes paramétrées)

    Returns:
        Tuple (columns, rows) :
        - columns : liste des noms de colonnes
        - rows    : liste de tuples de valeurs

    Raises:
        Exception: si la connexion ou l'exécution échoue
    """
    conn = get_connection(database_name)
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        if cur.description:
            # Requête SELECT : récupération des noms de colonnes et des lignes
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
        else:
            # Requête DDL/DML : pas de résultat
            columns, rows = [], []
        cur.close()
    finally:
        # Fermeture de la connexion dans tous les cas
        conn.close()
    return columns, rows
