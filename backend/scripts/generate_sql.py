"""Génération de requêtes SQL à partir d'une question en langage naturel.

Ce script lit un fichier de requête .txt, charge le schéma de la base cible,
construit un prompt et appelle le provider LLM pour générer la requête SQL.

Utilisation en ligne de commande :
    python -m backend.scripts.generate_sql \\
        --request requests/ma_question.txt \\
        --database ma_base \\
        --schema public \\
        --provider gemini
"""

import argparse
import re
import sys
from pathlib import Path

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.llm.factory import generate_with_fallback

def _clean_sql(text: str) -> str:
    """Supprime les balises markdown et tout texte parasite autour du SQL.

    Le LLM entoure parfois le SQL de :
      ```sql
      SELECT ...
      ```
    ou d'explications avant/après. On extrait uniquement le bloc SQL.
    """
    # Cas 1 : bloc ```sql ... ``` ou ``` ... ```
    match = re.search(r"```(?:sql)?\s*([\s\S]+?)```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Cas 2 : pas de balises — nettoyer les lignes qui ne sont pas du SQL
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        # Ignorer les lignes vides en début, les commentaires markdown type "Voici..."
        if not stripped:
            if lines:  # garder les lignes vides à l'intérieur
                lines.append(line)
            continue
        lines.append(line)

    return "\n".join(lines).strip()


# Dossier de sortie pour les fichiers SQL générés
SQL_DIR = Path("sql")

# Template de prompt pour la génération SQL
PROMPT_TEMPLATE = Path(__file__).parent / "prompt_template.txt"


def generate_sql(
    question_file: Path,
    database_name: str,
    schema_name: str = "public",
    provider_name: str = "gemini",
):
    """Génère une requête SQL depuis une question en langage naturel.

    Args:
        question_file : chemin vers le fichier .txt contenant la question
        database_name : nom de la base de données cible
        schema_name   : nom du schéma (défaut : "public" pour PostgreSQL)
        provider_name : provider LLM à utiliser ("gemini" ou "groq")

    Écrit le SQL généré dans ``sql/<nom_question>.sql``.
    """
    sql_file = SQL_DIR / (question_file.stem + ".sql")
    schema_file = Path(f"schema/{database_name}__{schema_name}_schema.md")

    # Vérification que le fichier de schéma existe (généré par scripts/schema.py)
    if not schema_file.exists():
        print(f"Erreur : Fichier schéma introuvable : {schema_file}")
        print(f"Générez le schéma d'abord : python -m backend.scripts.schema --database {database_name} --schema {schema_name}")
        sys.exit(1)

    # Construction du prompt en substituant les variables dans le template
    prompt = PROMPT_TEMPLATE.read_text()
    prompt = prompt.replace("{{SCHEMA}}", schema_file.read_text())
    prompt = prompt.replace("{{QUESTION}}", question_file.read_text())
    prompt = prompt.replace("{{SQL_PATH}}", str(sql_file))

    # Appel au provider LLM pour générer le SQL
    try:
        result = generate_with_fallback(prompt, provider_name)
    except Exception as exc:
        print("Erreur lors de l'appel au provider LLM :")
        print(exc)
        sys.exit(1)

    # Nettoyage du SQL : suppression des balises markdown ```sql ... ```
    sql_clean = _clean_sql(result.text)

    # Écriture du fichier SQL généré
    sql_file.parent.mkdir(exist_ok=True)
    sql_file.write_text(sql_clean)

    # Avertissement si un provider de secours a été utilisé
    if result.used_fallback:
        print(f"[WARN] {result.fallback_reason}")
        print("[WARN] Basculement sur Gemini pour préserver le workflow.")

    print(f"[OK] SQL généré pour {question_file.name}")


def main():
    """Point d'entrée CLI pour la génération SQL."""
    parser = argparse.ArgumentParser(description="Génère du SQL à partir d'une requête en langage naturel.")
    parser.add_argument("--request", required=True, help="Chemin vers le fichier de requête .txt")
    parser.add_argument("--database", required=True, help="Nom de la base de données")
    parser.add_argument("--schema", default="public", help="Nom du schéma (défaut : public)")
    parser.add_argument(
        "--provider",
        type=str,
        default="gemini",
        choices=["gemini", "groq"],
        help="Provider LLM à utiliser (défaut : gemini)",
    )
    args = parser.parse_args()

    request_file = Path(args.request)
    if not request_file.exists():
        print(f"Erreur : Le fichier {request_file} n'existe pas.")
        sys.exit(1)

    generate_sql(request_file, args.database, args.schema, args.provider)


if __name__ == "__main__":
    main()
