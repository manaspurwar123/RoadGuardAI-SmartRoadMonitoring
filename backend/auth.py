
import os
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "roadguard.db"

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)

JWT_SECRET = os.environ.get("ROADGUARD_JWT_SECRET")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60


def init_auth_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        """)


def create_admin(username, password):
    if not username.strip():
        raise ValueError("Username cannot be empty")

    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")

    hashed = password_hash.hash(password)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
            (username.strip(), hashed)
        )


def authenticate_admin(username, password):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row

        admin = conn.execute(
            "SELECT * FROM admins WHERE username = ?",
            (username,)
        ).fetchone()

    if not admin:
        return None

    if not password_hash.verify(
        password,
        admin["password_hash"]
    ):
        return None

    return dict(admin)


def create_access_token(username):
    if not JWT_SECRET:
        raise RuntimeError(
            "ROADGUARD_JWT_SECRET environment variable is missing"
        )

    expires = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": username,
        "role": "admin",
        "exp": expires,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )


def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(
        bearer_scheme
    )
):
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired admin token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise unauthorized

    if not JWT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured"
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )

        username = payload.get("sub")
        role = payload.get("role")

        if not username or role != "admin":
            raise unauthorized

        with sqlite3.connect(DB_PATH) as conn:
            admin = conn.execute(
                "SELECT id FROM admins WHERE username = ?",
                (username,)
            ).fetchone()

        if admin is None:
            raise unauthorized

        return username

    except InvalidTokenError:
        raise unauthorized
