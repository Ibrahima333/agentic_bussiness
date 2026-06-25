from __future__ import annotations

import google.generativeai as genai

from backend.llm.base import GenerationResult, LLMProvider, LLMProviderError


class GeminiProvider(LLMProvider):
    name = "gemini"

    def generate(self, prompt: str) -> GenerationResult:
        from backend.llm_config import LLMConfigManager

        api_key = LLMConfigManager.instance().get_api_key("gemini")
        if not api_key:
            raise LLMProviderError(
                "Clé API Gemini non configurée. Renseignez-la via l'interface ou GEMINI_API_KEY."
            )

        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt)
            text = response.text
        except Exception as exc:
            raise LLMProviderError(f"Erreur API Gemini : {exc}") from exc

        if not text or not text.strip():
            raise LLMProviderError("Gemini a retourné une réponse vide.")

        return GenerationResult(text=text, provider_name=self.name)
