from __future__ import annotations

from backend.llm.base import GenerationResult, LLMProviderError
from backend.llm.crok import CrokProvider
from backend.llm.gemini import GeminiProvider


def normalize_provider_name(provider_name: str | None) -> str:
    if not provider_name:
        return "gemini"
    return provider_name.strip().lower()


def get_provider(provider_name: str | None):
    normalized_name = normalize_provider_name(provider_name)
    if normalized_name == "crok":
        return CrokProvider()
    return GeminiProvider()


def generate_with_fallback(prompt: str, provider_name: str | None = "gemini") -> GenerationResult:
    requested_provider = normalize_provider_name(provider_name)
    provider = get_provider(requested_provider)

    try:
        result = provider.generate(prompt)
        result.requested_provider = requested_provider
        return result
    except LLMProviderError as exc:
        if provider.name == "gemini":
            raise

        # Fallback vers Gemini si le provider principal échoue
        fallback_provider = GeminiProvider()
        fallback_result = fallback_provider.generate(prompt)
        fallback_result.requested_provider = requested_provider
        fallback_result.used_fallback = True
        fallback_result.fallback_reason = str(exc)
        fallback_result.warnings.append(
            f"Provider '{requested_provider}' a échoué. Gemini utilisé en fallback."
        )
        return fallback_result
