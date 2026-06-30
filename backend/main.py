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

from fastapi import Depends, FastAPI, HTTPException, Query
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

# Auth
from backend.auth.database import init_db
from backend.auth.middleware import get_current_user, require_admin
from backend.auth.router import router as auth_router, seed_admin
from backend.repositories import analyses as analyses_repo
from backend.repositories import kpis as kpis_repo
from backend.repositories import dashboard as dashboard_repo
from backend.repositories import llm_config as llm_config_repo


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

# ── Initialisation auth au démarrage ─────────────────────────────────────────
@app.on_event("startup")
def on_startup() -> None:
    init_db()
    seed_admin()
    # Synchroniser la config LLM depuis MySQL → fichier runtime
    try:
        db_cfg = llm_config_repo.get_llm_config()
        if db_cfg:
            LLMConfigManager.instance().update({
                k: v for k, v in db_cfg.items() if v
            }, persist=True)
            print("[llm] Config LLM synchronisée depuis MySQL.")
    except Exception as exc:
        print(f"[llm] Sync MySQL→runtime ignorée : {exc}")

# ── Router auth ───────────────────────────────────────────────────────────────
app.include_router(auth_router)


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


@app.get("/api/schema/explore")
def schema_explore(
    database: str = Query(...),
    schema: str = Query(default=""),
) -> dict:
    """Retourne la liste des tables et leurs colonnes pour l'explorateur de schéma.

    Chaque table contient : nom, nombre de colonnes, et la liste des colonnes
    avec leur type, nullabilité et clé (PK/FK).
    """
    from backend.utils.db_utils import run_query, _db_type

    db_type = _db_type()
    target = schema if schema else database

    try:
        if db_type == "mysql":
            # Récupérer toutes les colonnes de toutes les tables en une requête
            _, rows = run_query(
                """
                SELECT table_name, column_name, column_type, is_nullable, column_key
                FROM information_schema.columns
                WHERE table_schema = %s
                ORDER BY table_name, ordinal_position
                """,
                target, (target,)
            )
        else:
            # PostgreSQL
            _, rows = run_query(
                """
                SELECT c.table_name, c.column_name, c.data_type,
                       c.is_nullable,
                       CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'PRI'
                            WHEN tc.constraint_type = 'FOREIGN KEY'  THEN 'MUL'
                            ELSE '' END AS column_key
                FROM information_schema.columns c
                LEFT JOIN information_schema.key_column_usage kcu
                  ON c.table_name = kcu.table_name
                 AND c.column_name = kcu.column_name
                 AND c.table_schema = kcu.table_schema
                LEFT JOIN information_schema.table_constraints tc
                  ON kcu.constraint_name = tc.constraint_name
                 AND kcu.table_schema = tc.constraint_schema
                WHERE c.table_schema = %s
                ORDER BY c.table_name, c.ordinal_position
                """,
                database, (schema or "public",)
            )

        # Regrouper les colonnes par table
        tables: dict = {}
        for table_name, col_name, col_type, nullable, col_key in rows:
            if table_name not in tables:
                tables[table_name] = []
            tables[table_name].append({
                "name": col_name,
                "type": str(col_type),
                "nullable": nullable == "YES",
                "key": str(col_key) if col_key else "",
            })

        return {
            "database": database,
            "schema": target,
            "tables": [
                {"name": t, "columns": cols}
                for t, cols in sorted(tables.items())
            ]
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/providers")
def providers() -> dict:
    """Retourne la liste des providers LLM supportés."""
    return {"providers": ["gemini", "groq"]}


# ── Routes de configuration LLM ──────────────────────────────────────────────
@app.get("/api/llm-config")
def llm_config_get(current_user: dict = Depends(get_current_user)) -> dict:
    """Retourne la config LLM.
    - Admin : clés masquées + lastTest
    - User  : uniquement la liste des providers disponibles
    """
    if current_user.get("role") == "admin":
        mgr = LLMConfigManager.instance()
        return {"config": mgr.get_masked(), "lastTest": mgr.last_test(), "isAdmin": True}
    # Pour les users : juste les providers disponibles (pas les clés)
    return {
        "availableProviders": llm_config_repo.get_available_providers(),
        "isAdmin": False,
    }


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


def _test_groq_key(api_key: str, api_url: str = "") -> tuple[bool, str]:
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
def llm_config_test(payload: dict, _: dict = Depends(require_admin)) -> dict:
    """Teste la clé API Gemini ou Groq fournie dans le payload. Admin uniquement."""
    mgr = LLMConfigManager.instance()
    try:
        gemini_key = str(payload.get("gemini_api_key", "") or "")
        groq_key = str(payload.get("groq_api_key", "") or "")

        # Test de la clé Gemini en priorité
        if gemini_key:
            ok, msg = _test_gemini_key(gemini_key)
            if ok:
                mgr.update({"gemini_api_key": gemini_key}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        # Sinon test de la clé Groq
        if groq_key:
            groq_url = str(payload.get("groq_api_url", "") or "")
            ok, msg = _test_groq_key(groq_key, groq_url)
            if ok:
                mgr.update({"groq_api_key": groq_key, "groq_api_url": groq_url}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        raise HTTPException(status_code=400, detail="Clé API manquante")

    except HTTPException:
        raise
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {"success": False, "message": str(exc), "lastTest": mgr.last_test()}


@app.post("/api/llm-config/save")
def llm_config_save(payload: dict, _: dict = Depends(require_admin)) -> dict:
    """Persiste la configuration LLM en base MySQL + fichier runtime. Admin uniquement."""
    mgr = LLMConfigManager.instance()
    try:
        mgr.update(payload, persist=True)
        # Sauvegarder aussi en MySQL pour persistance partagée
        # Passer uniquement les clés présentes dans le payload
        # Le repository fait un update partiel — les clés absentes restent intactes
        llm_config_repo.save_llm_config(
            gemini_api_key=str(payload.get("gemini_api_key") or ""),
            groq_api_key=str(payload.get("groq_api_key") or ""),
            groq_api_url=str(payload.get("groq_api_url") or ""),
        )
        # Synchroniser LLMConfigManager avec la config complète en base
        full_cfg = llm_config_repo.get_llm_config()
        if full_cfg:
            mgr.update({k: v for k, v in full_cfg.items() if v}, persist=True)
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


def _test_db_connection(payload: dict) -> tuple[bool, str]:
    """Tente une vraie connexion à la base de données avec les credentials fournis.

    Retourne (success, message). Ne propage jamais d'exception.
    """
    try:
        db_type = str(payload.get("db_type", "postgresql")).lower()
        host     = str(payload.get("host", "localhost"))
        raw_port = payload.get("port", 3306 if db_type == "mysql" else 5432)
        try:
            port = int(raw_port)
        except (TypeError, ValueError):
            return False, f"Port invalide : '{raw_port}' n'est pas un entier"
        user     = str(payload.get("user", ""))
        password = str(payload.get("password", ""))
        database = str(payload.get("database", "") or "")

        if not host:
            return False, "Hôte manquant"
        if not user:
            return False, "Utilisateur manquant"
        if not database:
            return False, "Nom de la base manquant"

        # Base cible pour le test : la base configurée ou une base système
        test_db = database if database else ("mysql" if db_type == "mysql" else "postgres")

        if db_type == "mysql":
            import mysql.connector
            conn = mysql.connector.connect(
                host=host, port=port, user=user, password=password,
                database=test_db, connect_timeout=5,
            )
            conn.close()
            return True, f"Connexion MySQL reussie ({host}:{port})"
        else:
            import psycopg2
            conn = psycopg2.connect(
                host=host, port=port, user=user, password=password,
                dbname=test_db, connect_timeout=5,
            )
            conn.close()
            return True, f"Connexion PostgreSQL reussie ({host}:{port})"

    except Exception as exc:
        msg = str(exc)
        # Simplifier les messages d'erreur courants
        if "Access denied" in msg or "password" in msg.lower():
            return False, "Mot de passe incorrect ou acces refuse"
        if "Unknown database" in msg or "does not exist" in msg:
            database = str(payload.get("database", "") or "")
            return False, f"Base de donnees '{database}' introuvable"
        if "Can't connect" in msg or "Connection refused" in msg or "nodename" in msg:
            host = str(payload.get("host", "?"))
            raw_port = payload.get("port", "?")
            return False, f"Impossible de joindre le serveur {host}:{raw_port}"
        if "timeout" in msg.lower():
            host = str(payload.get("host", "?"))
            raw_port = payload.get("port", "?")
            return False, f"Delai depasse - verifiez l'adresse {host}:{raw_port}"
        return False, msg[:300]


@app.post("/api/db-config/test")
def db_config_test(payload: dict) -> dict:
    """Teste la connexion a la base de donnees avec les credentials fournis."""
    mgr = DatabaseConfigManager.instance()
    ok, msg = _test_db_connection(payload)
    mgr.record_test(ok, msg)
    return {"success": ok, "message": msg}


@app.post("/api/db-config/save")
def db_config_save(payload: dict) -> dict:
    """Persiste la configuration DB sur disque."""
    mgr = DatabaseConfigManager.instance()
    try:
        cfg = mgr.update(payload, persist=True)
        mgr.record_test(True, "Configuration sauvegardee")
        return {"config": cfg.to_dict(), "lastTest": mgr.last_test()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/db-config/connect")
def db_config_connect(payload: dict) -> dict:
    """Teste la connexion puis persiste la configuration si elle reussit."""
    mgr = DatabaseConfigManager.instance()

    # 1. Tester la vraie connexion avant de sauvegarder
    ok, msg = _test_db_connection(payload)

    if ok:
        # 2. Sauvegarder uniquement si la connexion est etablie
        try:
            cfg = mgr.update(payload, persist=True)
        except Exception as exc:
            ok, msg = False, str(exc)
            mgr.record_test(ok, msg)
            return {"connection": {"success": False, "message": msg}, "lastTest": mgr.last_test()}

    mgr.record_test(ok, msg)
    return {
        "connection": {"success": ok, "message": msg},
        "lastTest": mgr.last_test(),
        "config": mgr.get_masked(),
    }


# ── Routes historique et résultats ────────────────────────────────────────────
@app.get("/api/results")
def results(current_user: dict = Depends(get_current_user)) -> dict:
    """Liste les résultats d'analyse de l'utilisateur connecté."""
    user_id = current_user["sub"]
    # Fichiers disque disponibles (source de vérité pour les artefacts)
    disk_results = {r["id"]: r for r in list_available_results()}
    db_history   = analyses_repo.list_analyses(user_id)
    db_names     = {r["question_name"] for r in db_history}

    # Priorité : résultats en base liés à ce user, complétés par les infos disque
    seen = set()
    history = []
    for r in db_history:
        name = r["question_name"]
        if name in disk_results and name not in seen:
            seen.add(name)
            history.append(disk_results[name])

    # Si aucun historique en base (première connexion), retourner tout le disque
    if not db_names:
        history = list(disk_results.values())

    return {"history": history}


@app.delete("/history")
@app.delete("/api/history")
def delete_history(current_user: dict = Depends(get_current_user)) -> dict[str, str]:
    """Supprime l'historique d'analyses de l'utilisateur connecté."""
    try:
        analyses_repo.delete_analyses(current_user["sub"])
        return clear_history()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/results/{question_name}")
def result_detail(question_name: str, _: dict = Depends(get_current_user)) -> dict:
    """Retourne le détail complet d'un résultat d'analyse."""
    try:
        return load_result(question_name)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── KPIs par user ─────────────────────────────────────────────────────────────

@app.get("/api/user/kpis")
def get_user_kpis(current_user: dict = Depends(get_current_user)) -> dict:
    return {"kpis": kpis_repo.get_kpis(current_user["sub"])}


@app.post("/api/user/kpis")
def pin_kpi(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    kpis_repo.upsert_kpi(current_user["sub"], payload)
    return {"kpis": kpis_repo.get_kpis(current_user["sub"])}


@app.delete("/api/user/kpis/{kpi_id}")
def unpin_kpi(kpi_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    kpis_repo.delete_kpi(current_user["sub"], kpi_id)
    return {"kpis": kpis_repo.get_kpis(current_user["sub"])}


# ── Dashboard par user ────────────────────────────────────────────────────────

@app.get("/api/user/dashboard")
def get_user_dashboard(current_user: dict = Depends(get_current_user)) -> dict:
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


@app.post("/api/user/dashboard")
def pin_chart(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    dashboard_repo.upsert_chart(current_user["sub"], payload)
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


@app.delete("/api/user/dashboard/{chart_id}")
def unpin_chart(chart_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    dashboard_repo.delete_chart(current_user["sub"], chart_id)
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


# ── Route principale : lancement du pipeline d'analyse ───────────────────────
@app.post("/api/pipeline/run")
def pipeline_run(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Lance le pipeline complet : génération SQL → exécution → dataviz → insights."""
    try:
        result = run_pipeline(
            question_text=str(payload.get("questionText", "")).strip(),
            artifact_name=str(payload.get("artifactName", "")),
            database_name=str(payload.get("databaseName", "")),
            schema_name=str(payload.get("schemaName", "")),
            provider_name=str(payload.get("providerName", "gemini")),
            overwrite_existing=bool(payload.get("overwriteExisting", False)),
        )
        # Sauvegarder l'analyse en base liée à l'utilisateur
        try:
            analyses_repo.save_analysis(current_user["sub"], {
                "questionName": result.get("questionName", ""),
                "questionText": str(payload.get("questionText", "")),
                "databaseName": str(payload.get("databaseName", "")),
                "schemaName":   str(payload.get("schemaName", "")),
                "providerName": str(payload.get("providerName", "")),
                "rowsReturned": result.get("metadata", {}).get("rows_returned", 0),
            })
        except Exception:
            pass  # Ne pas bloquer le pipeline si la sauvegarde en base échoue
        return result
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

    # Le graphique HTML doit être servi en inline pour s'afficher dans une iframe
    # (Content-Disposition: attachment forcerait le téléchargement)
    if artifact_type == "chart":
        return FileResponse(artifact_path, media_type=media_type)

    # Les autres artefacts (sql, csv, report) sont téléchargeables directement
    return FileResponse(artifact_path, media_type=media_type, filename=artifact_path.name)


# ── KPIs ──────────────────────────────────────────────────────────────────────

@app.post("/api/kpi/refresh/{question_name}")
def kpi_refresh(question_name: str, _: dict = Depends(get_current_user)) -> dict:
    """Ré-exécute le SQL persisté et retourne la valeur KPI mise à jour.

    Ne fait aucun appel LLM : lit le fichier SQL existant et le rejoue
    directement sur la base configurée. Idéal pour rafraîchir un KPI
    sans re-générer toute l'analyse.
    """
    from pathlib import Path
    from backend.utils.db_utils import run_query

    sql_file = Path(f"sql/{question_name}.sql")
    if not sql_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"SQL introuvable pour '{question_name}'. Relancez l'analyse une fois."
        )

    sql = sql_file.read_text(encoding="utf-8").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="Fichier SQL vide.")

    # Lire la base active depuis la config runtime
    db_cfg = DatabaseConfigManager.instance().get()
    db_name = db_cfg.database
    if not db_name:
        raise HTTPException(status_code=400, detail="Aucune base de données configurée.")

    try:
        columns, rows = run_query(sql, db_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur SQL : {exc}") from exc

    if not rows:
        return {"columns": columns, "values": {}, "rowCount": 0}

    first_row = dict(zip(columns, rows[0]))
    return {
        "columns": list(columns),
        "values": first_row,
        "rowCount": len(rows),
    }



# ── Mode Chat Analytique ──────────────────────────────────────────────────────

@app.post("/api/chat/message")
def chat_message(payload: dict, _: dict = Depends(get_current_user)) -> dict:
    """Endpoint du chat analytique conversationnel.

    Reçoit un message utilisateur + historique de conversation,
    retourne une réponse du data analyst IA sans générer de SQL.

    Body attendu :
        message  : str  — dernier message de l'utilisateur
        database : str  — base de données active
        schema   : str  — schéma actif
        provider : str  — provider LLM ("gemini" ou "groq")
        history  : list — [{ role: "user"|"assistant", content: str }, ...]
    """
    from backend.scripts.chat_analyst import (
        build_messages,
        build_system_prompt,
        load_schema_markdown,
    )

    message  = str(payload.get("message", "")).strip()
    database = str(payload.get("database", "")).strip()
    schema   = str(payload.get("schema", "")).strip()
    provider = str(payload.get("provider", "gemini")).strip()
    history  = payload.get("history", [])

    if not message:
        raise HTTPException(status_code=400, detail="Message vide")

    # Chargement du schéma (fichier existant ou vide)
    schema_md = load_schema_markdown(database, schema)

    # Construction du prompt
    system_prompt = build_system_prompt(database, schema, schema_md)
    messages = build_messages(system_prompt, history, message)

    # Appel LLM — on passe directement les messages au provider
    try:
        from backend.llm.factory import get_provider
        prov = get_provider(provider)

        # Construire un prompt texte à partir des messages
        # (nos providers utilisent une API texte simple)
        full_prompt = "\n\n".join(
            f"[{m['role'].upper()}]\n{m['content']}"
            for m in messages
        )
        result = prov.generate(full_prompt)
        response_text = result.text.strip()

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"response": response_text}
