from __future__ import annotations

import json
import urllib.error
import urllib.request

from backend.llm.base import GenerationResult, LLMProvider, LLMProviderError

# URL de base Groq (OpenAI-compatible)
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"


class CrokProvider(LLMProvider):
    name = "crok"

    def generate(self, prompt: str) -> GenerationResult:
        from backend.llm_config import LLMConfigManager

        mgr = LLMConfigManager.instance()
        api_key = mgr.get_api_key("crok")

        if not api_key:
            raise LLMProviderError(
                "Clé API Groq non configurée. Renseignez-la via l'interface ou CROK_API_KEY."
            )

        # URL configurable, Groq par défaut
        api_url = mgr.get_api_url("crok") or GROQ_BASE_URL
        endpoint = api_url.rstrip("/") + "/chat/completions"

        payload = {
            "model": GROQ_DEFAULT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
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
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            raise LLMProviderError(f"Erreur API Groq {exc.code} : {body}") from exc
        except urllib.error.URLError as exc:
            raise LLMProviderError(f"Impossible de joindre Groq : {exc.reason}") from exc

        try:
            text = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMProviderError(f"Réponse Groq inattendue : {result}") from exc

        if not text.strip():
            raise LLMProviderError("Groq a retourné une réponse vide.")

        return GenerationResult(text=text, provider_name=self.name)
