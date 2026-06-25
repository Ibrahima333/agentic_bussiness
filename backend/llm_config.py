"""Runtime configuration for LLM providers (backend Agentic BI).

Configuration can be provided in this order of priority:
1) Runtime config persisted by frontend in ``runtime/llm_config.json``.
2) Environment variables (``GEMINI_API_KEY``, ``CROK_API_KEY``, etc).
3) Empty values (provider will fail if no key is available).
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

CONFIG_FILE = Path(os.getenv("LLM_RUNTIME_CONFIG", "runtime/llm_config.json"))

SUPPORTED_PROVIDERS = ("gemini", "crok")


@dataclass
class LLMConfig:
    """API key configuration for LLM providers."""

    gemini_api_key: str = ""
    crok_api_key: str = ""
    crok_api_url: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def masked(self) -> dict[str, Any]:
        """Return a masked version (API keys hidden)."""
        data = asdict(self)
        if data.get("gemini_api_key"):
            data["gemini_api_key"] = "********"
        if data.get("crok_api_key"):
            data["crok_api_key"] = "********"
        if data.get("crok_api_url") and not data.get("crok_api_key"):
            data["crok_api_url"] = "********"
        return data

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class LLMConfigError(RuntimeError):
    """Raised when a configuration cannot be applied."""


class LLMConfigManager:
    """Singleton thread-safe that keeps the active LLM config."""

    _instance: "LLMConfigManager | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._state_lock = threading.Lock()
        self._config: LLMConfig = self._load_from_disk() or self._load_from_env() or LLMConfig()
        self._last_test: dict[str, Any] | None = None

    @classmethod
    def instance(cls) -> "LLMConfigManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get(self) -> LLMConfig:
        with self._state_lock:
            return LLMConfig(**self._config.to_dict())

    def get_masked(self) -> dict[str, Any]:
        return self.get().masked()

    def update(self, payload: dict[str, Any], persist: bool = True) -> LLMConfig:
        with self._state_lock:
            data = self._config.to_dict()
            for key, value in payload.items():
                if key in {"gemini_api_key", "crok_api_key", "crok_api_url"}:
                    data[key] = "" if value is None else str(value)
                elif key == "extra" and isinstance(value, dict):
                    data["extra"] = value
            self._config = LLMConfig(**data)
            if persist:
                self._save_to_disk()
        return self.get()

    def get_api_key(self, provider: str) -> str:
        if provider not in SUPPORTED_PROVIDERS:
            raise LLMConfigError(f"Unsupported provider '{provider}'. Use one of: {', '.join(SUPPORTED_PROVIDERS)}.")
        config = self.get()
        key_map = {
            "gemini": config.gemini_api_key,
            "crok": config.crok_api_key,
        }
        key = key_map.get(provider, "")
        if not key:
            key = os.getenv(f"{provider.upper()}_API_KEY", "")
        return key

    def get_api_url(self, provider: str) -> str:
        if provider not in SUPPORTED_PROVIDERS:
            return ""
        config = self.get()
        url_map = {
            "crok": config.crok_api_url,
        }
        url = url_map.get(provider, "")
        if not url:
            url = os.getenv(f"{provider.upper()}_API_URL", "")
        return url

    def reset(self) -> LLMConfig:
        with self._state_lock:
            self._config = LLMConfig()
            if CONFIG_FILE.exists():
                try:
                    CONFIG_FILE.unlink()
                except OSError:
                    pass
        return self.get()

    def record_test(self, success: bool, message: str) -> None:
        with self._state_lock:
            self._last_test = {"success": success, "message": message}

    def last_test(self) -> dict[str, Any] | None:
        with self._state_lock:
            return dict(self._last_test) if self._last_test else None

    def _load_from_disk(self) -> LLMConfig | None:
        if not CONFIG_FILE.exists():
            return None
        try:
            payload = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        try:
            return LLMConfig(**payload)
        except TypeError:
            return None

    def _load_from_env(self) -> LLMConfig | None:
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        crok_key = os.getenv("CROK_API_KEY", "")
        crok_url = os.getenv("CROK_API_URL", "")
        if gemini_key or crok_key or crok_url:
            return LLMConfig(gemini_api_key=gemini_key, crok_api_key=crok_key, crok_api_url=crok_url)
        return None

    def _save_to_disk(self) -> None:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(
            json.dumps(self._config.to_dict(), indent=2), encoding="utf-8"
        )


def get_llm_config() -> LLMConfig:
    return LLMConfigManager.instance().get()