"""Couche service du pipeline Agentic BI.

Ce module orchestre le pipeline complet d'analyse :
1. Réception d'une question en langage naturel
2. Génération du schéma de la base ciblée
3. Génération SQL via LLM
4. Exécution de la requête et export CSV
5. Génération d'un script de visualisation (dataviz)
6. Exécution du script et production du graphique HTML
7. Génération du rapport Insights & Actions en Markdown

Il expose aussi les fonctions utilitaires pour lire/lister/supprimer
les résultats persistés sur disque.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any

import pandas as pd

# Étapes du pipeline
from backend.scripts.generate_dataviz import generate_dataviz
from backend.scripts.generate_insights_actions import generate_insights_actions
from backend.scripts.generate_sql import generate_sql
from backend.scripts.run_analysis import execute_analysis
from backend.scripts.run_dataviz import run_dataviz_script
from backend.scripts.schema import generate_schema
from backend.utils.db_discovery import list_databases, list_schemas


# ── Répertoires de travail ────────────────────────────────────────────────────
REQUESTS_DIR = Path("requests")   # Fichiers .txt contenant les questions
SQL_DIR = Path("sql")             # Fichiers .sql générés par le LLM
DATAVIZ_DIR = Path("dataviz")     # Scripts Python de visualisation générés
OUTPUTS_DIR = Path("outputs")     # CSV, HTML, Markdown, metadata par analyse

# Providers LLM supportés par l'application
PROVIDERS = ["gemini", "crok"]


class PipelineServiceError(RuntimeError):
    """Levée quand le pipeline ne peut pas terminer une étape."""


# ── Utilitaires ───────────────────────────────────────────────────────────────

def slugify(value: str) -> str:
    """Convertit une chaîne en identifiant sans espaces ni caractères spéciaux."""
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower())
    normalized = normalized.strip("_")
    return normalized or "analysis"


def capture_step(step_name: str, func: Any, *args: Any, **kwargs: Any) -> str:
    """Exécute une étape du pipeline et capture stdout/stderr dans une chaîne.

    En cas d'erreur (exception ou sys.exit), lève PipelineServiceError
    avec le nom de l'étape et le message d'erreur.
    """
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            func(*args, **kwargs)
    except SystemExit as exc:
        output = buffer.getvalue().strip()
        message = f"{step_name} failed with exit code {exc.code}."
        if output:
            message = f"{message}\n{output}"
        raise PipelineServiceError(message) from exc
    except Exception as exc:
        output = buffer.getvalue().strip()
        message = f"{step_name} failed: {exc}"
        if output:
            message = f"{message}\n{output}"
        raise PipelineServiceError(message) from exc
    return buffer.getvalue().strip()


def build_question_name(question_text: str, requested_name: str, overwrite_existing: bool) -> str:
    """Détermine le nom unique de l'artefact pour une question donnée.

    - Si un nom est fourni manuellement, il est utilisé tel quel (slugifié).
    - Sinon, le nom est dérivé automatiquement des 80 premiers caractères.
    - Un suffixe numérique (_2, _3…) est ajouté si le nom est déjà pris.
    """
    if requested_name.strip():
        question_name = slugify(requested_name)
        request_file = REQUESTS_DIR / f"{question_name}.txt"
        if request_file.exists() and not overwrite_existing:
            raise PipelineServiceError(
                f"Le nom '{question_name}' existe déjà. Activez l'écrasement ou choisissez un autre nom."
            )
        return question_name

    # Nom automatique basé sur la question
    base_name = slugify(question_text[:80])
    request_file = REQUESTS_DIR / f"{base_name}.txt"
    if not request_file.exists() or overwrite_existing:
        return base_name

    # Ajout d'un suffixe numérique pour éviter les doublons
    suffix = 2
    while True:
        candidate = f"{base_name}_{suffix}"
        if not (REQUESTS_DIR / f"{candidate}.txt").exists():
            return candidate
        suffix += 1


def write_request_file(question_name: str, question_text: str, overwrite_existing: bool) -> Path:
    """Écrit la question en langage naturel dans un fichier .txt dans REQUESTS_DIR."""
    REQUESTS_DIR.mkdir(exist_ok=True)
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    if request_file.exists() and not overwrite_existing:
        raise PipelineServiceError(f"Fichier de requête déjà existant : {request_file}")
    request_file.write_text(question_text.strip(), encoding="utf-8")
    return request_file


def validate_file(path: Path, label: str) -> None:
    """Vérifie qu'un fichier existe et n'est pas vide (pour les fichiers texte).

    Lève PipelineServiceError si la vérification échoue.
    """
    if not path.exists():
        raise PipelineServiceError(f"{label} n'a pas été généré : {path}")
    if path.suffix in {".sql", ".py", ".md", ".html"} and not path.read_text(encoding="utf-8").strip():
        raise PipelineServiceError(f"{label} est vide : {path}")


def dataframe_to_records(dataframe: pd.DataFrame) -> list[dict[str, Any]]:
    """Convertit un DataFrame pandas en liste de dicts JSON-sérialisables.

    Les valeurs NaN sont remplacées par None pour éviter les erreurs JSON.
    """
    safe_dataframe = dataframe.where(pd.notnull(dataframe), None)
    return safe_dataframe.to_dict(orient="records")


def normalize_dtype(dtype: Any) -> str:
    """Convertit un dtype pandas en type SQL simplifié (INTEGER, FLOAT, etc.)."""
    dtype_name = str(dtype).lower()
    if "int" in dtype_name:
        return "INTEGER"
    if "float" in dtype_name or "double" in dtype_name:
        return "FLOAT"
    if "bool" in dtype_name:
        return "BOOLEAN"
    if "datetime" in dtype_name:
        return "DATETIME"
    return "TEXT"


def build_metadata(
    metadata_path: Path,
    dataframe: pd.DataFrame,
    execution_time_ms: int,
    sql_text: str,
) -> dict[str, Any]:
    """Construit le dictionnaire de métadonnées enrichi pour un résultat d'analyse."""
    raw_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    # Informations de colonnes avec types normalisés pour le frontend
    columns = [
        {"name": column_name, "type": normalize_dtype(dataframe[column_name].dtype)}
        for column_name in dataframe.columns
    ]

    return {
        "question": raw_metadata.get("question"),
        "rows_returned": raw_metadata.get("rows_returned", len(dataframe)),
        "columns": columns,
        "sql_file": raw_metadata.get("sql_file"),
        "database": raw_metadata.get("database"),
        "schema": raw_metadata.get("schema"),
        "execution_time_ms": execution_time_ms,
        # Hash SHA-256 tronqué pour identifier la requête de façon unique
        "query_hash": hashlib.sha256(sql_text.encode("utf-8")).hexdigest()[:20],
    }


# ── Pipeline principal ────────────────────────────────────────────────────────

def run_pipeline(
    question_text: str,
    artifact_name: str,
    database_name: str,
    schema_name: str,
    provider_name: str,
    overwrite_existing: bool,
) -> dict[str, Any]:
    """Orchestre le pipeline complet d'analyse BI en 6 étapes.

    Étapes :
    1. Validation des paramètres d'entrée
    2. Génération du nom et écriture du fichier de requête
    3. Génération du schéma de la base de données
    4. Génération SQL via LLM → validation
    5. Exécution SQL → CSV + metadata → validation
    6. Génération dataviz → HTML → validation
    7. Génération insights → Markdown → validation
    8. Sauvegarde des logs et contexte d'exécution
    """
    # Validation des paramètres obligatoires
    if not question_text.strip():
        raise PipelineServiceError("questionText est obligatoire.")
    if not database_name.strip():
        raise PipelineServiceError("databaseName est obligatoire.")
    if not schema_name.strip():
        raise PipelineServiceError("schemaName est obligatoire.")
    if provider_name not in PROVIDERS:
        raise PipelineServiceError(f"Provider non supporté : {provider_name}")

    # Détermination des chemins de fichiers pour cet artefact
    question_name = build_question_name(question_text, artifact_name, overwrite_existing)
    request_file = write_request_file(question_name, question_text, overwrite_existing)
    sql_file = SQL_DIR / f"{question_name}.sql"
    csv_file = OUTPUTS_DIR / question_name / f"{question_name}.csv"
    metadata_file = OUTPUTS_DIR / question_name / "metadata.json"
    dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
    html_file = OUTPUTS_DIR / question_name / f"{question_name}.html"
    markdown_file = OUTPUTS_DIR / question_name / f"{question_name}.md"

    logs: list[str] = []

    # Étape 1 : Génération du schéma de la base de données (fichier .md)
    logs.append(capture_step("Schema generation", generate_schema, database_name, schema_name))

    # Étape 2 : Génération du SQL via LLM
    logs.append(capture_step("SQL generation", generate_sql, request_file, database_name, schema_name, provider_name))
    validate_file(sql_file, "Fichier SQL")

    # Étape 3 : Exécution de la requête SQL (mesure du temps d'exécution)
    execution_start = time.perf_counter()
    logs.append(capture_step("SQL execution", execute_analysis, sql_file, database_name, schema_name))
    execution_time_ms = int((time.perf_counter() - execution_start) * 1000)

    validate_file(csv_file, "Sortie CSV")
    validate_file(metadata_file, "Fichier metadata")

    # Étape 4 : Génération du script de visualisation Python
    logs.append(capture_step("Dataviz generation", generate_dataviz, request_file, provider_name))
    validate_file(dataviz_file, "Script dataviz")

    # Étape 5 : Exécution du script dataviz pour produire le graphique HTML
    logs.append(capture_step("Dataviz execution", run_dataviz_script, dataviz_file))
    validate_file(html_file, "Graphique HTML")

    # Étape 6 : Génération du rapport Insights & Actions en Markdown
    logs.append(capture_step("Insights generation", generate_insights_actions, request_file, provider_name))
    validate_file(markdown_file, "Rapport Markdown")

    # Sauvegarde des logs et du contexte d'exécution pour consultation ultérieure
    logs_text = "\n\n".join(log for log in logs if log)
    context_path = OUTPUTS_DIR / question_name / "backend_context.json"
    logs_path = OUTPUTS_DIR / question_name / "logs.txt"
    context_path.write_text(
        json.dumps(
            {
                "provider_name": provider_name,
                "execution_time_ms": execution_time_ms,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logs_path.write_text(logs_text, encoding="utf-8")

    return load_result(question_name, execution_time_ms, logs_text)


# ── Chargement des résultats ──────────────────────────────────────────────────

def load_result(
    question_name: str,
    execution_time_ms: int | None = None,
    log_output: str | None = None,
) -> dict[str, Any]:
    """Charge tous les artefacts d'un résultat depuis le disque et les retourne en dict.

    Si execution_time_ms ou log_output ne sont pas fournis, ils sont lus depuis
    les fichiers persistés (backend_context.json et logs.txt).
    """
    # Chemins des artefacts attendus
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    sql_file = SQL_DIR / f"{question_name}.sql"
    csv_file = OUTPUTS_DIR / question_name / f"{question_name}.csv"
    metadata_file = OUTPUTS_DIR / question_name / "metadata.json"
    html_file = OUTPUTS_DIR / question_name / f"{question_name}.html"
    markdown_file = OUTPUTS_DIR / question_name / f"{question_name}.md"
    context_file = OUTPUTS_DIR / question_name / "backend_context.json"
    logs_file = OUTPUTS_DIR / question_name / "logs.txt"

    # Validation de la présence de tous les artefacts obligatoires
    validate_file(request_file, "Fichier de requête")
    validate_file(sql_file, "Fichier SQL")
    validate_file(csv_file, "Sortie CSV")
    validate_file(metadata_file, "Fichier metadata")
    validate_file(html_file, "Graphique HTML")
    validate_file(markdown_file, "Rapport Markdown")

    # Lecture des données depuis le disque
    sql_text = sql_file.read_text(encoding="utf-8")
    dataframe = pd.read_csv(csv_file)
    context = {}
    if context_file.exists():
        context = json.loads(context_file.read_text(encoding="utf-8"))

    # Temps d'exécution : paramètre en mémoire ou valeur persistée sur disque
    resolved_execution_time_ms = execution_time_ms
    if resolved_execution_time_ms is None:
        resolved_execution_time_ms = int(context.get("execution_time_ms", 0))

    metadata = build_metadata(metadata_file, dataframe, resolved_execution_time_ms, sql_text)
    html_content = html_file.read_text(encoding="utf-8")
    report_text = markdown_file.read_text(encoding="utf-8")

    # Timestamp basé sur la date de modification du fichier de requête
    timestamp = int(request_file.stat().st_mtime * 1000)

    # Logs : paramètre, fichier disque, ou message par défaut
    resolved_logs = log_output
    if resolved_logs is None and logs_file.exists():
        resolved_logs = logs_file.read_text(encoding="utf-8")
    if resolved_logs is None:
        resolved_logs = f"Artefacts chargés depuis outputs/{question_name}/"

    return {
        "id": question_name,
        "questionName": question_name,
        "questionText": request_file.read_text(encoding="utf-8").strip(),
        "databaseName": metadata["database"],
        "schemaName": metadata["schema"],
        "providerName": context.get("provider_name", "unknown"),
        "sql": sql_text,
        "csvData": dataframe_to_records(dataframe),
        "metadata": metadata,
        "report": report_text,
        "logs": resolved_logs,
        "timestamp": timestamp,
        "chartHtml": html_content,
        # URLs des artefacts téléchargeables depuis le frontend
        "artifactUrls": {
            "sql": f"/api/artifacts/{question_name}/sql",
            "csv": f"/api/artifacts/{question_name}/csv",
            "metadata": f"/api/artifacts/{question_name}/metadata",
            "chart": f"/api/artifacts/{question_name}/chart",
            "report": f"/api/artifacts/{question_name}/report",
            "logs": f"/api/artifacts/{question_name}/logs",
        },
    }


def list_available_results() -> list[dict[str, Any]]:
    """Retourne la liste des analyses disponibles, triées de la plus récente à la plus ancienne."""
    results: list[dict[str, Any]] = []
    for output_dir in sorted(OUTPUTS_DIR.glob("*"), key=lambda path: path.stat().st_mtime, reverse=True):
        if not output_dir.is_dir():
            continue

        question_name = output_dir.name
        request_file = REQUESTS_DIR / f"{question_name}.txt"
        metadata_file = output_dir / "metadata.json"

        # On ignore les dossiers sans fichier de requête ou de metadata
        if not request_file.exists() or not metadata_file.exists():
            continue

        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        context_file = output_dir / "backend_context.json"
        context = {}
        if context_file.exists():
            context = json.loads(context_file.read_text(encoding="utf-8"))

        results.append(
            {
                "id": question_name,
                "questionName": question_name,
                "questionText": request_file.read_text(encoding="utf-8").strip(),
                "databaseName": metadata.get("database"),
                "schemaName": metadata.get("schema"),
                "providerName": context.get("provider_name", "unknown"),
                "timestamp": int(request_file.stat().st_mtime * 1000),
            }
        )
    return results


def clear_history() -> dict[str, str]:
    """Supprime tous les artefacts générés (requests, sql, dataviz, outputs)."""
    for result in list_available_results():
        question_name = result["questionName"]
        request_file = REQUESTS_DIR / f"{question_name}.txt"
        sql_file = SQL_DIR / f"{question_name}.sql"
        dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
        output_dir = OUTPUTS_DIR / question_name

        # Suppression des fichiers individuels
        for file_path in (request_file, sql_file, dataviz_file):
            if file_path.exists():
                file_path.unlink()

        # Suppression récursive du dossier de sortie
        if output_dir.exists():
            shutil.rmtree(output_dir)

    return {"status": "success", "message": "Historique supprimé"}


def get_config(database_name: str | None = None) -> dict[str, Any]:
    """Retourne la configuration complète : bases, schémas, providers, sélections par défaut."""
    # list_databases() lève une exception si la connexion échoue — on la laisse remonter
    databases = list_databases()
    selected_database = database_name or (databases[0] if databases else "")
    schemas = list_schemas(selected_database) if selected_database else []
    return {
        "databases": databases,
        "schemas": schemas,
        "providers": PROVIDERS,
        "selectedDatabase": selected_database,
        "selectedSchema": schemas[0] if schemas else "",
        "selectedProvider": PROVIDERS[0],
    }


def get_artifact_path(question_name: str, artifact_type: str) -> tuple[Path, str]:
    """Retourne le chemin et le type MIME d'un artefact donné.

    Lève PipelineServiceError si le type d'artefact est inconnu.
    """
    # Table de correspondance : type d'artefact → (chemin, type MIME)
    artifact_map = {
        "sql": (SQL_DIR / f"{question_name}.sql", "text/sql"),
        "csv": (OUTPUTS_DIR / question_name / f"{question_name}.csv", "text/csv"),
        "metadata": (OUTPUTS_DIR / question_name / "metadata.json", "application/json"),
        "chart": (OUTPUTS_DIR / question_name / f"{question_name}.html", "text/html"),
        "report": (OUTPUTS_DIR / question_name / f"{question_name}.md", "text/markdown"),
        "logs": (OUTPUTS_DIR / question_name / "logs.txt", "text/plain"),
    }
    if artifact_type not in artifact_map:
        raise PipelineServiceError(f"Type d'artefact non supporté : {artifact_type}")
    return artifact_map[artifact_type]


def default_cors_origins() -> list[str]:
    """Retourne la liste des origines CORS autorisées depuis les variables d'environnement."""
    # FRONTEND_ORIGIN : origine principale du frontend (dev ou production)
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    # FRONTEND_CORS_ORIGINS : origines supplémentaires séparées par des virgules
    additional = os.getenv("FRONTEND_CORS_ORIGINS", "")
    origins = [frontend_origin]
    if additional.strip():
        origins.extend(origin.strip() for origin in additional.split(",") if origin.strip())
    return origins
