"""Provider LLM Google Gemini (backend Agentic BI).

Utilise le SDK officiel ``google-generativeai`` pour appeler le modèle
Gemini Flash. La clé API est lue depuis le gestionnaire de configuration
LLM (runtime ou variable d'environnement GEMINI_API_KEY).
"""

from __future__ import annotations

import google.generativeai as genai

from backend.llm.base import GenerationResult, LLMProvider, LLMProviderError


class GeminiProvider(LLMProvider):
    """Provider LLM utilisant Google Gemini (modèle gemini-2.0-flash)."""

    name = "gemini"

    def generate(self, prompt: str) -> GenerationResult:
        """Génère du texte via l'API Google Gemini.

        Args:
            prompt: texte d'instruction envoyé à Gemini

        Returns:
            GenerationResult avec le texte généré

        Raises:
            LLMProviderError: si la clé est manquante, l'API échoue, ou la réponse est vide
        """
        # Import circulaire évité en important à la demande
        from backend.llm_config import LLMConfigManager

        # Récupération de la clé API depuis la config runtime
        api_key = LLMConfigManager.instance().get_api_key("gemini")
        if not api_key:
            raise LLMProviderError(
                "Clé API Gemini non configurée. Renseignez-la via l'interface ou GEMINI_API_KEY."
            )

        try:
            # Configuration du SDK avec la clé API
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt)
            text = response.text
        except Exception as exc:
            raise LLMProviderError(f"Erreur API Gemini : {exc}") from exc

        # Vérification que la réponse n'est pas vide
        if not text or not text.strip():
            raise LLMProviderError("Gemini a retourné une réponse vide.")

        return GenerationResult(text=text, provider_name=self.name)
