"""Configuration runtime de la base de données (backend Agentic BI).

La config peut être fournie de différentes façons, dans cet ordre de priorité :
1) Config runtime persistée par le frontend dans ``runtime/db_config.json``.
2) Variables d'environnement (``DB_TYPE``, ``DB_HOST``, ...) — ignorées volontairement.
3) Valeurs par défaut (PostgreSQL localhost).

Le module expose :class:`DatabaseConfig` (dataclass) et
:class:`DatabaseConfigManager` (singleton thread-safe), pour que tout le
backend lise une seule source de vérité.
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


# Fichier de configuration persisté par le frontend
CONFIG_FILE = Path(os.getenv("DB_RUNTIME_CONFIG", "runtime/db_config.json"))

# Types de bases de données supportés
SUPPORTED_TYPES = ("postgresql", "mysql")


@dataclass
class DatabaseConfig:
    """Paramètres de connexion à la base de données active."""

    db_type: str = "postgresql"   # Type : "postgresql" ou "mysql"
    host: str = "localhost"        # Adresse du serveur
    port: int = 5432               # Port (5432 pour PG, 3306 pour MySQL)
    user: str = "postgres"         # Utilisateur
    password: str = ""             # Mot de passe (jamais affiché en clair)
    database: str = ""             # Nom de la base par défaut
    schema: str = "public"         # Schéma par défaut (PostgreSQL)
    extra: dict[str, Any] = field(default_factory=dict)  # Paramètres additionnels

    def masked(self) -> dict[str, Any]:
        """Retourne une version masquée de la config (mot de passe remplacé par ******)."""
        data = asdict(self)
        if data.get("password"):
            data["password"] = "********"
        return data

    def to_dict(self) -> dict[str, Any]:
        """Retourne la config sous forme de dictionnaire brut (mot de passe en clair)."""
        return asdict(self)


class DatabaseConfigError(RuntimeError):
    """Levée quand une configuration invalide est appliquée."""


class DatabaseConfigManager:
    """Singleton thread-safe qui conserve la configuration DB active.

    La config est chargée depuis le disque au démarrage et peut être mise à
    jour via l'interface web. Toutes les opérations sont protégées par un verrou.
    """

    _instance: "DatabaseConfigManager | None" = None
    _lock = threading.Lock()  # Verrou pour l'initialisation du singleton

    def __init__(self) -> None:
        self._state_lock = threading.Lock()  # Verrou pour les accès concurrents
        # Priorité : fichier disque, sinon valeurs par défaut
        self._config: DatabaseConfig = self._load_from_disk() or DatabaseConfig()
        self._last_test: dict[str, Any] | None = None

    # ── Accès au singleton ────────────────────────────────────────────────────
    @classmethod
    def instance(cls) -> "DatabaseConfigManager":
        """Retourne l'instance unique du gestionnaire (création à la première demande)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get(self) -> DatabaseConfig:
        """Retourne une copie de la configuration active."""
        with self._state_lock:
            return DatabaseConfig(**self._config.to_dict())

    def get_masked(self) -> dict[str, Any]:
        """Retourne la configuration avec le mot de passe masqué."""
        return self.get().masked()

    def update(self, payload: dict[str, Any], persist: bool = True) -> DatabaseConfig:
        """Met à jour la configuration avec les valeurs fournies.

        Les champs inconnus sont ignorés silencieusement.
        Si persist=True, la configuration est sauvegardée sur disque.
        """
        with self._state_lock:
            data = self._config.to_dict()
            for key, value in payload.items():
                if key in {"db_type", "host", "user", "password", "database", "schema"}:
                    # Conversion en chaîne, None → chaîne vide
                    data[key] = "" if value is None else str(value)
                elif key == "port":
                    try:
                        data["port"] = int(value)
                    except (TypeError, ValueError) as exc:
                        raise DatabaseConfigError("le port doit être un entier") from exc
                elif key == "extra" and isinstance(value, dict):
                    data["extra"] = value

            # Validation du type de base de données
            if data["db_type"] not in SUPPORTED_TYPES:
                raise DatabaseConfigError(
                    f"db_type '{data['db_type']}' non supporté. Valeurs acceptées : {', '.join(SUPPORTED_TYPES)}."
                )
            self._config = DatabaseConfig(**data)
            if persist:
                self._save_to_disk()
        return self.get()

    def reset(self) -> DatabaseConfig:
        """Réinitialise la configuration aux valeurs par défaut et supprime le fichier disque."""
        with self._state_lock:
            self._config = DatabaseConfig()
            if CONFIG_FILE.exists():
                try:
                    CONFIG_FILE.unlink()
                except OSError:
                    pass
        return self.get()

    def record_test(self, success: bool, message: str) -> None:
        """Enregistre le résultat du dernier test de connexion."""
        with self._state_lock:
            self._last_test = {"success": success, "message": message}

    def last_test(self) -> dict[str, Any] | None:
        """Retourne le résultat du dernier test de connexion (ou None si jamais testé)."""
        with self._state_lock:
            return dict(self._last_test) if self._last_test else None

    # ── Persistance disque ────────────────────────────────────────────────────
    def _load_from_disk(self) -> DatabaseConfig | None:
        """Tente de charger la configuration depuis le fichier JSON runtime."""
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
        """Les variables d'environnement sont volontairement ignorées.

        Conservé pour compatibilité avec d'anciens parcours de déploiement.
        """
        return DatabaseConfig()

    def _save_to_disk(self) -> None:
        """Sauvegarde la configuration active dans le fichier JSON runtime."""
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(
            json.dumps(self._config.to_dict(), indent=2), encoding="utf-8"
        )


def get_db_config() -> DatabaseConfig:
    """Raccourci pour accéder à la configuration DB active depuis n'importe quel module."""
    return DatabaseConfigManager.instance().get()
