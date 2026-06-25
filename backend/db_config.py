"""Configuration runtime de la base de données (backend Agentic BI).

La config peut être fournie de différentes façons, dans cet ordre de priorité :
1) Config runtime persistée par le frontend dans ``runtime/db_config.json``.
2) Variables d’environnement (``DB_TYPE``, ``DB_HOST``, ...).
3) Valeurs par défaut livrées avec le projet.

Le module expose :class:`DatabaseConfig` (dataclass) et un petit gestionnaire
style singleton, pour que tout le backend lise une seule source de vérité.
"""


from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


CONFIG_FILE = Path(os.getenv("DB_RUNTIME_CONFIG", "runtime/db_config.json"))


SUPPORTED_TYPES = ("postgresql", "mysql")


@dataclass
class DatabaseConfig:
    """Connection settings for the active database."""

    db_type: str = "postgresql"
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str = ""
    database: str = ""
    schema: str = "public"
    extra: dict[str, Any] = field(default_factory=dict)

    def masked(self) -> dict[str, Any]:
        """Retourne une version “masquée” (mot de passe caché)."""

        data = asdict(self)
        if data.get("password"):
            data["password"] = "********"
        return data

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DatabaseConfigError(RuntimeError):
    """Raised when a configuration cannot be applied."""


class DatabaseConfigManager:
    """Singleton thread-safe qui garde la config active."""


    _instance: "DatabaseConfigManager | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._state_lock = threading.Lock()
        # La config backend est pilotée par la config runtime venant du frontend
        # (/api/db-config/*). On garde la persistance disque, mais les variables
        # d’environnement sont ignorées.

        self._config: DatabaseConfig = self._load_from_disk() or DatabaseConfig()
        self._last_test: dict[str, Any] | None = None

    # ------------------------------------------------------------------ API
    @classmethod
    def instance(cls) -> "DatabaseConfigManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get(self) -> DatabaseConfig:
        with self._state_lock:
            return DatabaseConfig(**self._config.to_dict())

    def get_masked(self) -> dict[str, Any]:
        return self.get().masked()

    def update(self, payload: dict[str, Any], persist: bool = True) -> DatabaseConfig:
        with self._state_lock:
            data = self._config.to_dict()
            for key, value in payload.items():
                if key in {"db_type", "host", "user", "password", "database", "schema"}:
                    data[key] = "" if value is None else str(value)
                elif key == "port":
                    try:
                        data["port"] = int(value)
                    except (TypeError, ValueError) as exc:
                        raise DatabaseConfigError("port must be an integer") from exc
                elif key == "extra" and isinstance(value, dict):
                    data["extra"] = value
            if data["db_type"] not in SUPPORTED_TYPES:
                raise DatabaseConfigError(
                    f"Unsupported db_type '{data['db_type']}'. Use one of: {', '.join(SUPPORTED_TYPES)}."
                )
            self._config = DatabaseConfig(**data)
            if persist:
                self._save_to_disk()
        return self.get()

    def reset(self) -> DatabaseConfig:
        with self._state_lock:
            # Reset to project defaults (no env-based config).
            self._config = DatabaseConfig()
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

    # ----------------------------------------------------------- persistence
    def _load_from_disk(self) -> DatabaseConfig | None:
        if not CONFIG_FILE.exists():
            return None
        try:
            payload = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        try:
            return DatabaseConfig(**payload)
        except TypeError:
            return None

    def _load_from_env(self) -> DatabaseConfig:
        # Les variables d’environnement sont volontairement ignorées.
        # On les garde uniquement pour compatibilité avec des anciens parcours.
        return DatabaseConfig()


    def _save_to_disk(self) -> None:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(
            json.dumps(self._config.to_dict(), indent=2), encoding="utf-8"
        )


def get_db_config() -> DatabaseConfig:
    return DatabaseConfigManager.instance().get()
