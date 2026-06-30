"""Repository config LLM globale — gérée par l'admin, partagée pour tous."""

from __future__ import annotations

from backend.auth.database import get_connection


def get_llm_config() -> dict:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT gemini_api_key, groq_api_key, groq_api_url FROM llm_config LIMIT 1")
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    return row if row else {}


def save_llm_config(gemini_api_key: str = "", groq_api_key: str = "", groq_api_url: str = "") -> None:
    """Upsert partiel — ne met à jour que les clés fournies, préserve les autres."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM llm_config")
        (count,) = cur.fetchone()

        if count == 0:
            cur.execute(
                "INSERT INTO llm_config (gemini_api_key, groq_api_key, groq_api_url) VALUES (%s, %s, %s)",
                (gemini_api_key, groq_api_key, groq_api_url),
            )
        else:
            updates = []
            values  = []
            if gemini_api_key:
                updates.append("gemini_api_key = %s")
                values.append(gemini_api_key)
            if groq_api_key:
                updates.append("groq_api_key = %s")
                values.append(groq_api_key)
            if groq_api_url is not None:
                updates.append("groq_api_url = %s")
                values.append(groq_api_url)
            if updates:
                cur.execute(f"UPDATE llm_config SET {', '.join(updates)}", values)

        conn.commit()
    finally:
        cur.close()
        conn.close()


def get_available_providers() -> list[str]:
    cfg = get_llm_config()
    providers = []
    if cfg.get("gemini_api_key"):
        providers.append("gemini")
    if cfg.get("groq_api_key"):
        providers.append("groq")
    return providers
