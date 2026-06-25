"""Point d'entrée FastAPI pour l'application AskData.

Ce module définit toutes les routes HTTP exposées par le backend :
- Configuration base de données et LLM (lecture, test, sauvegarde)
- Lancement du pipeline d'analyse (SQL → CSV → DataViz → Insights)
- Récupération des résultats et artefacts
"""

from __future__ import annotations

import json as _json
import urllib.error
import urllib.request

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse


# Gestionnaires de configuration DB et LLM
from backend.db_config import DatabaseConfig, DatabaseConfigManager
from backend.llm_config import LLMConfigManager

# Fonctions métier du service pipeline
from backend.service import (
    clear_history,
    PipelineServiceError,
    default_cors_origins,
    get_artifact_path,
    get_config,
    list_available_results,
    load_result,
    run_pipeline,
)


# ── Création de l'application FastAPI ────────────────────────────────────────
app = FastAPI(
    title="Agentic BI API",
    version="0.1.0",
    description="Backend API pour le frontend React Agentic BI.",
)

# Middleware CORS : autorise le frontend (React dev + prod) à appeler l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=default_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Route de santé ────────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict[str, str]:
    """Vérifie que le serveur est opérationnel."""
    return {"status": "ok"}


# ── Routes de configuration ───────────────────────────────────────────────────
@app.get("/api/config")
def config(database_name: str | None = Query(default=None, alias="databaseName")) -> dict:
    """Retourne la liste des bases, schémas et providers disponibles."""
    try:
        return get_config(database_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/databases")
def databases() -> dict:
    """Liste les bases de données accessibles via la connexion active."""
    try:
        config_data = get_config()
        return {"databases": config_data["databases"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/databases/{database_name}/schemas")
def schemas(database_name: str) -> dict:
    """Liste les schémas disponibles dans une base de données donnée."""
    try:
        config_data = get_config(database_name)
        return {"schemas": config_data["schemas"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/providers")
def providers() -> dict:
    """Retourne la liste des providers LLM supportés."""
    return {"providers": ["gemini", "crok"]}


# ── Routes de configuration LLM ──────────────────────────────────────────────
@app.get("/api/llm-config")
def llm_config_get() -> dict:
    """Retourne la configuration LLM actuelle (clés masquées) et le dernier test."""
    mgr = LLMConfigManager.instance()
    return {"config": mgr.get_masked(), "lastTest": mgr.last_test()}


def _test_gemini_key(api_key: str) -> tuple[bool, str]:
    """Teste la validité d'une clé API Gemini via une requête légère."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=1"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                return True, "Connexion Gemini réussie"
            return False, f"Gemini a répondu avec le statut {resp.status}"
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            return False, "Clé API Gemini invalide (400)"
        if exc.code == 403:
            return False, "Clé API Gemini refusée (403)"
        return False, f"Erreur Gemini HTTP {exc.code}: {exc.reason}"
    except urllib.error.URLError as exc:
        return False, f"Impossible de joindre Gemini: {exc.reason}"


def _test_crok_key(api_key: str, api_url: str = "") -> tuple[bool, str]:
    """Teste la connexion Groq avec un micro appel de complétion."""
    if not api_key:
        return False, "Clé API Groq manquante"

    # URL de base configurable, Groq par défaut
    base_url = api_url.rstrip("/") if api_url else "https://api.groq.com/openai/v1"
    endpoint = base_url + "/chat/completions"

    # Requête minimale pour valider la clé sans consommer de tokens
    payload = _json.dumps({
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Reply with just: ok"}],
        "max_tokens": 5,
    }).encode()

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; AgenticBI/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return True, "Connexion Groq réussie ✓"
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        try:
            detail = _json.loads(body).get("error", {}).get("message", body)
        except Exception:
            detail = body[:200]
        if exc.code == 401:
            return False, f"Clé API Groq invalide : {detail}"
        if exc.code == 403:
            return False, f"Accès refusé (403) — vérifiez votre compte Groq : {detail}"
        if exc.code == 429:
            return False, "Limite de requêtes atteinte (429) — réessayez dans quelques secondes"
        return False, f"Erreur Groq HTTP {exc.code} : {detail}"
    except urllib.error.URLError as exc:
        return False, f"Impossible de joindre Groq : {exc.reason}"


@app.post("/api/llm-config/test")
def llm_config_test(payload: dict) -> dict:
    """Teste la clé API Gemini ou Groq fournie dans le payload."""
    mgr = LLMConfigManager.instance()
    try:
        gemini_key = str(payload.get("gemini_api_key", "") or "")
        crok_key = str(payload.get("crok_api_key", "") or "")

        # Test de la clé Gemini en priorité
        if gemini_key:
            ok, msg = _test_gemini_key(gemini_key)
            if ok:
                mgr.update({"gemini_api_key": gemini_key}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        # Sinon test de la clé Groq
        if crok_key:
            crok_url = str(payload.get("crok_api_url", "") or "")
            ok, msg = _test_crok_key(crok_key, crok_url)
            if ok:
                mgr.update({"crok_api_key": crok_key, "crok_api_url": crok_url}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        raise HTTPException(status_code=400, detail="Clé API manquante")

    except HTTPException:
        raise
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {"success": False, "message": str(exc), "lastTest": mgr.last_test()}


@app.post("/api/llm-config/save")
def llm_config_save(payload: dict) -> dict:
    """Persiste la configuration LLM sur disque."""
    mgr = LLMConfigManager.instance()
    try:
        mgr.update(payload, persist=True)
        mgr.record_test(True, "LLM configuration saved")
        return {"success": True, "message": "LLM configuration saved", "lastTest": mgr.last_test()}
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {"success": False, "message": str(exc), "lastTest": mgr.last_test()}


# ── Routes de configuration base de données ───────────────────────────────────
@app.get("/api/db-config")
def db_config_get() -> dict:
    """Retourne la configuration DB actuelle (mot de passe masqué) et le dernier test."""
    mgr = DatabaseConfigManager.instance()
    return {
        "config": mgr.get_masked(),
        "lastTest": mgr.last_test(),
        "supportedTypes": ["postgresql", "mysql"],
    }


@app.post("/api/db-config/test")
def db_config_test(payload: dict) -> dict:
    """Valide la structure de la configuration DB et enregistre un test."""
    # Validation rapide de la structure via le dataclass DatabaseConfig
    try:
        cfg = DatabaseConfig(**payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    mgr = DatabaseConfigManager.instance()
    try:
        mgr.update(payload, persist=False)
        mgr.record_test(True, "Connection successful")
        return {"success": True, "message": "Connection successful"}
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {"success": False, "message": str(exc)}


@app.post("/api/db-config/save")
def db_config_save(payload: dict) -> dict:
    """Persiste la configuration DB sur disque."""
    mgr = DatabaseConfigManager.instance()
    try:
        cfg = mgr.update(payload, persist=True)
        mgr.record_test(True, "Configuration saved")
        return {"config": cfg.to_dict(), "lastTest": mgr.last_test()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/db-config/connect")
def db_config_connect(payload: dict) -> dict:
    """Persiste la configuration DB et confirme la connexion au frontend."""
    mgr = DatabaseConfigManager.instance()
    try:
        cfg = mgr.update(payload, persist=True)
        mgr.record_test(True, "Connected")
        return {
            "connection": {"success": True, "message": "Connected"},
            "lastTest": mgr.last_test(),
            "config": cfg.to_dict(),
        }
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {
            "connection": {"success": False, "message": str(exc)},
            "lastTest": mgr.last_test(),
            "config": mgr.get().to_dict(),
        }


# ── Routes historique et résultats ────────────────────────────────────────────
@app.get("/api/results")
def results() -> dict:
    """Liste tous les résultats d'analyse disponibles."""
    return {"history": list_available_results()}


@app.delete("/history")
@app.delete("/api/history")
def delete_history() -> dict[str, str]:
    """Supprime tout l'historique d'analyses (requests, sql, dataviz, outputs)."""
    try:
        return clear_history()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/results/{question_name}")
def result_detail(question_name: str) -> dict:
    """Retourne le détail complet d'un résultat d'analyse (SQL, CSV, rapport, chart…)."""
    try:
        return load_result(question_name)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Route principale : lancement du pipeline d'analyse ───────────────────────
@app.post("/api/pipeline/run")
def pipeline_run(payload: dict) -> dict:
    """Lance le pipeline complet : génération SQL → exécution → dataviz → insights.

    Paramètres attendus dans le body JSON :
    - questionText      : question en langage naturel
    - artifactName      : nom optionnel pour les artefacts générés
    - databaseName      : base de données cible
    - schemaName        : schéma cible
    - providerName      : provider LLM ("gemini" ou "crok")
    - overwriteExisting : écraser si le nom existe déjà
    """
    try:
        return run_pipeline(
            question_text=str(payload.get("questionText", "")).strip(),
            artifact_name=str(payload.get("artifactName", "")),
            database_name=str(payload.get("databaseName", "")),
            schema_name=str(payload.get("schemaName", "")),
            provider_name=str(payload.get("providerName", "gemini")),
            overwrite_existing=bool(payload.get("overwriteExisting", False)),
        )
    except PipelineServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Route de téléchargement d'artefacts ──────────────────────────────────────
@app.get("/api/artifacts/{question_name}/{artifact_type}")
def artifact(question_name: str, artifact_type: str):
    """Sert un artefact généré (sql, csv, metadata, chart, report, logs)."""
    try:
        artifact_path, media_type = get_artifact_path(question_name, artifact_type)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Les logs sont lus depuis le résultat en mémoire
    if artifact_type == "logs":
        result = load_result(question_name)
        return PlainTextResponse(result["logs"], media_type=media_type)

    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail=f"Artefact introuvable : {artifact_path}")

    # Les métadonnées sont retournées en JSON structuré
    if artifact_type == "metadata":
        result = load_result(question_name)
        return JSONResponse(result["metadata"])

    # Tous les autres artefacts sont servis comme fichiers statiques
    return FileResponse(artifact_path, media_type=media_type, filename=artifact_path.name)

