"""Prompt builder pour le mode chat analytique (AskData).

Ce module construit le prompt système envoyé au LLM pour le mode
conversation rapide. Le LLM joue le rôle d'un data analyst consultant
qui connaît le schéma de la base mais ne génère pas de SQL.
"""

from pathlib import Path


def build_system_prompt(database: str, schema: str, schema_markdown: str) -> str:
    """Construit le prompt système du data analyst."""

    db_context = f"Base de données : **{database}**"
    if schema and schema != database:
        db_context += f" / Schéma : **{schema}**"

    schema_section = (
        f"\n\nVoici le schéma de la base :\n\n{schema_markdown}"
        if schema_markdown
        else "\n\n(Schéma non disponible — réponds sur la base des informations fournies.)"
    )

    return f"""Tu es un data analyst senior et consultant business expert.
Tu aides l'utilisateur à comprendre ses données, identifier des tendances,
formuler des recommandations et prendre de meilleures décisions.

{db_context}{schema_section}

Règles importantes :
- Réponds TOUJOURS en français, de façon claire et concise.
- NE génère JAMAIS de code SQL, Python ou autre code technique.
- Concentre-toi sur les insights business, les recommandations et les explications.
- Si l'utilisateur demande un graphique ou une requête SQL, rappelle-lui d'utiliser
  le mode "Analyse" (onglet dédié) et propose plutôt une analyse textuelle.
- Sois direct et actionnable : chaque réponse doit apporter de la valeur concrète.
- Utilise des bullet points et une structure claire quand c'est pertinent.
- Limite tes réponses à 300 mots maximum sauf si l'utilisateur demande plus de détails.
"""


def load_schema_markdown(database: str, schema: str) -> str:
    """Charge le fichier schéma déjà généré par le pipeline, si disponible."""
    # Chercher dans le dossier schema/ les fichiers générés
    schema_dir = Path("schema")
    candidates = [
        schema_dir / f"{database}__{schema}_schema.md",
        schema_dir / f"{database}__{database}_schema.md",
    ]
    for path in candidates:
        if path.exists():
            return path.read_text(encoding="utf-8")
    return ""


def build_messages(
    system_prompt: str,
    history: list[dict],
    user_message: str,
) -> list[dict]:
    """Construit la liste de messages pour l'appel LLM.

    Format compatible OpenAI (Groq) et Gemini.
    history : liste de { role: "user"|"assistant", content: str }
    """
    messages = [{"role": "system", "content": system_prompt}]
    # Limiter l'historique aux 10 derniers échanges pour ne pas dépasser le contexte
    for msg in history[-20:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages
