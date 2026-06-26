"""Service d'authentification — hash bcrypt + génération/vérification JWT."""

from __future__ import annotations

import os
import time
from typing import Any

import bcrypt
import jwt

_SECRET = os.getenv("JWT_SECRET", "changeme_en_production_secret_tres_long")
_ALGORITHM = "HS256"
_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", str(8 * 3600)))  # 8h par défaut


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(user_id: int, email: str, role: str) -> str:
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": int(time.time()) + _EXPIRE_SECONDS,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Décode et valide un JWT. Lève jwt.ExpiredSignatureError ou jwt.InvalidTokenError."""
    return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
