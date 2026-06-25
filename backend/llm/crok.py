"""Provider LLM Groq via l'interface OpenAI-compatible (backend Agentic BI).

Utilise ``urllib`` (sans dépendance externe) pour appeler l'API Groq.
Le provider est nommé "crok" dans l'application pour éviter la confusion
avec le mot-clé "groq" et permettre une URL personnalisable.

La clé API est lue depuis le gestionnaire de configuration LLM
(runtime ou variable d'environnement CROK_API_KEY).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from backend.llm.base import GenerationResult, LLMProvider, LLMProviderError

# URL de base Groq (interface compatible OpenAI)
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Modèle Groq utilisé par défaut pour toutes les générations
GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"


class CrokProvider(LLMProvider):
    """Provider LLM utilisant l'API Groq (interface OpenAI-compatible)."""

    name = "crok"

    def generate(self, prompt: str) -> GenerationResult:
        """Génère du texte via l'API Groq.

        Args:
            prompt: texte d'instruction envoyé au modèle

        Returns:
            GenerationResult avec le texte généré

        Raises:
            LLMProviderError: si la clé est manquante, l'API échoue, ou la réponse est vide
        """
        # Import circulaire évité en important à la demande
        from backend.llm_config import LLMConfigManager

        mgr = LLMConfigManager.instance()
        api_key = mgr.get_api_key("crok")

        if not api_key:
            raise LLMProviderError(
                "Clé API Groq non configurée. Renseignez-la via l'interface ou CROK_API_KEY."
            )

        # URL configurable (utile pour les proxies ou instances privées)
        api_url = mgr.get_api_url("crok") or GROQ_BASE_URL
        endpoint = api_url.rstrip("/") + "/chat/completions"

        # Construction de la requête JSON (format chat OpenAI)
        payload = {
            "model": GROQ_DEFAULT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,  # Température basse pour des réponses déterministes
        }
        data = json.dumps(payload).encode()

        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; AgenticBI/1.0)",
            },
        )

        try:
            # Timeout de 120s pour les prompts longs (génération SQL complexe)
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            raise LLMProviderError(f"Erreur API Groq {exc.code} : {body}") from exc
        except urllib.error.URLError as exc:
            raise LLMProviderError(f"Impossible de joindre Groq : {exc.reason}") from exc

        # Extraction du texte depuis la réponse JSON
        try:
            text = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMProviderError(f"Réponse Groq inattendue : {result}") from exc

        # Vérification que la réponse n'est pas vide
        if not text.strip():
            raise LLMProviderError("Groq a retourné une réponse vide.")

        return GenerationResult(text=text, provider_name=self.name)
