"""Exécution d'une requête SQL et export des résultats en CSV (backend Agentic BI).

Ce script lit un fichier .sql, exécute la requête sur la base cible,
écrit les résultats en CSV et génère un fichier metadata.json.

Utilisation en ligne de commande :
    python -m backend.scripts.run_analysis \\
        --sql sql/ma_question.sql \\
        --database ma_base \\
        --schema public
"""

import csv
import json
import argparse
import sys
from pathlib import Path

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.utils.db_utils import run_query

# Dossier de sortie contenant les résultats par analyse
OUTPUTS_DIR = Path("outputs")


def execute_analysis(sql_file: Path, database_name: str, schema_name: str = "public"):
    """Exécute une requête SQL et sauvegarde les résultats sur disque.

    Args:
        sql_file      : chemin vers le fichier .sql à exécuter
        database_name : nom de la base de données cible
        schema_name   : nom du schéma (utilisé dans les métadonnées)

    Produit dans ``outputs/<question_name>/`` :
    - ``<question_name>.csv`` : résultats de la requête
    - ``metadata.json``        : métadonnées (question, nb lignes, colonnes, base…)
    """
    question_name = sql_file.stem
    out_dir = OUTPUTS_DIR / question_name
    csv_path = out_dir / f"{question_name}.csv"

    # Sécurité PostgreSQL : si database_name ressemble à un schéma, utiliser la config
    from backend.utils.db_utils import _db_type
    if _db_type() != "mysql" and (not database_name or database_name == schema_name):
        try:
            from backend.db_config import DatabaseConfigManager
            cfg_db = DatabaseConfigManager.instance().get().database
            if cfg_db and cfg_db != schema_name:
                database_name = cfg_db
        except Exception:
            pass

    # Exécution de la requête SQL sur la base cible
    columns, rows = run_query(sql_file.read_text(), database_name)

    # Création du dossier de sortie si nécessaire
    out_dir.mkdir(parents=True, exist_ok=True)

    # Écriture des résultats en CSV (encodage UTF-8, sans BOM)
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(columns)   # En-tête
        writer.writerows(rows)     # Données

    # Écriture des métadonnées d'exécution
    metadata = {
        "question": question_name,
        "rows_returned": len(rows),
        "columns": columns,
        "sql_file": str(sql_file),
        "database": database_name,
        "schema": schema_name
    }
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    print(f"[OK] Résultat généré pour {question_name} sur {database_name} (schéma : {schema_name})")


def main():
    """Point d'entrée CLI pour l'exécution SQL."""
    parser = argparse.ArgumentParser(description="Exécute une requête SQL et exporte les résultats.")
    parser.add_argument("--sql", required=True, help="Chemin vers le fichier SQL à exécuter")
    parser.add_argument("--database", required=True, help="Nom de la base de données")
    parser.add_argument("--schema", default="public", help="Nom du schéma (défaut : public)")
    args = parser.parse_args()

    sql_file = Path(args.sql)
    if not sql_file.exists():
        print(f"Erreur : Le fichier {sql_file} n'existe pas.")
        sys.exit(1)

    execute_analysis(sql_file, args.database, args.schema)


if __name__ == "__main__":
    main()
