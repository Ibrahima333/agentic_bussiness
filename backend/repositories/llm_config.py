"""Repository config LLM globale — gérée par l'admin, partagée pour tous."""

from __future__ import annotations

from backend.auth.database import get_connection


def get_llm_config() -> dict:
    """Retourne la config LLM depuis MySQL. Retourne un dict vide si non configurée."""
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    cur.execute("SELECT gemini_api_key, groq_api_key, groq_api_url FROM llm_config LIMIT 1")
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row if row else {}


def save_llm_config(gemini_api_key: str = "", groq_api_key: str = "", groq_api_url: str = "") -> None:
    """Upsert la config LLM (une seule ligne en base)."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM llm_config")
    (count,) = cur.fetchone()
    if count == 0:
        cur.execute(
            "INSERT INTO llm_config (gemini_api_key, groq_api_key, groq_api_url) VALUES (%s, %s, %s)",
            (gemini_api_key, groq_api_key, groq_api_url),
        )
    else:
        cur.execute(
            "UPDATE llm_config SET gemini_api_key=%s, groq_api_key=%s, groq_api_url=%s",
            (gemini_api_key, groq_api_key, groq_api_url),
        )
    conn.commit()
    cur.close()
    conn.close()


def get_available_providers() -> list[str]:
    """Retourne la liste des providers dont la clé est configurée."""
    cfg = get_llm_config()
    providers = []
    if cfg.get("gemini_api_key"):
        providers.append("gemini")
    if cfg.get("groq_api_key"):
        providers.append("groq")
    return providers
