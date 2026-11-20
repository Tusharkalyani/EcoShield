"""EcoShield security layer.

Three pillars:
1. **AES-256 Symmetric Encryption** – Fernet-based field-level encryption
   for PII (phone numbers, GPS coordinates).
2. **Anti-Spoofing Webhook Signing** – HMAC-SHA256 payload signing and
   verification for inbound webhooks.
3. **Identity & Access (RBAC)** – bcrypt password hashing and JWT
   creation / decoding with role claims.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# =====================================================================
# 1.  AES-256 SYMMETRIC ENCRYPTION  (Fernet)
# =====================================================================

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Lazy-initialise and cache the Fernet cipher."""
    global _fernet
    if _fernet is None:
        key = get_settings().FERNET_KEY
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_field(plaintext: str) -> str:
    """Encrypt a plaintext string (e.g. phone number, GPS coordinate).

    Returns a URL-safe base64-encoded ciphertext that can be stored
    directly in a ``VARCHAR`` / ``TEXT`` column.
    """
    if not plaintext:
        raise ValueError("Cannot encrypt an empty string.")
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_field(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted field back to plaintext.

    Raises
    ------
    ValueError
        If the token is malformed, expired, or the key is wrong.
    """
    if not ciphertext:
        raise ValueError("Cannot decrypt an empty string.")
    try:
        return _get_fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError(
            "Decryption failed – invalid token or wrong key."
        ) from exc


# =====================================================================
# 2.  ANTI-SPOOFING WEBHOOK SIGNING  (HMAC-SHA256)
# =====================================================================


def generate_hmac_signature(payload: str, secret: str | None = None) -> str:
    """Create an HMAC-SHA256 hex digest for *payload*.

    Parameters
    ----------
    payload:
        The raw request body (or any string to sign).
    secret:
        Signing secret.  Falls back to ``settings.HMAC_SECRET`` when
        omitted.

    Returns
    -------
    Lowercase hex-encoded HMAC-SHA256 signature.
    """
    if secret is None:
        secret = get_settings().HMAC_SECRET
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_hmac_signature(
    payload: str,
    signature: str,
    secret: str | None = None,
) -> bool:
    """Verify an HMAC-SHA256 signature in constant time.

    Parameters
    ----------
    payload:
        The raw request body.
    signature:
        The hex signature to validate (typically from an
        ``X-Hub-Signature-256`` header).
    secret:
        Signing secret.  Falls back to ``settings.HMAC_SECRET``.

    Returns
    -------
    ``True`` if the signature is valid, ``False`` otherwise.
    """
    expected = generate_hmac_signature(payload, secret)
    return hmac.compare_digest(expected, signature)


# =====================================================================
# 3.  IDENTITY & ACCESS – Password hashing + JWT RBAC
# =====================================================================

# ── Password hashing (bcrypt) ────────────────────────────────────────

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of *plain_password*."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify *plain_password* against a stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ── Role-Based Access Control ────────────────────────────────────────


class Role(StrEnum):
    """Application roles embedded in JWT claims."""

    ADMIN = "admin"
    RANGER = "ranger"
    ANALYST = "analyst"
    VIEWER = "viewer"


# ── JWT creation & decoding ──────────────────────────────────────────

_JWT_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES = 60


def create_access_token(
    subject: str,
    role: Role | str = Role.VIEWER,
    *,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Issue a signed JWT access token.

    Parameters
    ----------
    subject:
        The ``sub`` claim – typically a user ID or username.
    role:
        The user's RBAC role (stored in a ``role`` claim).
    expires_delta:
        Custom expiry.  Defaults to 60 minutes.
    extra_claims:
        Arbitrary additional claims merged into the payload.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=_ACCESS_TOKEN_EXPIRE_MINUTES))

    payload: dict[str, Any] = {
        "sub": subject,
        "role": str(role),
        "iat": now,
        "exp": expire,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        get_settings().SECRET_KEY,
        algorithm=_JWT_ALGORITHM,
    )


class TokenPayload:
    """Decoded & validated JWT payload."""

    __slots__ = ("sub", "role", "iat", "exp", "extra")

    def __init__(
        self,
        sub: str,
        role: str,
        iat: datetime,
        exp: datetime,
        extra: dict[str, Any],
    ) -> None:
        self.sub = sub
        self.role = role
        self.iat = iat
        self.exp = exp
        self.extra = extra

    def has_role(self, *roles: Role | str) -> bool:
        """Return ``True`` if the token's role is in *roles*."""
        return self.role in {str(r) for r in roles}


def decode_access_token(token: str) -> TokenPayload:
    """Decode and validate a JWT access token.

    Raises
    ------
    ValueError
        If the token is expired, malformed, or the signature is invalid.
    """
    try:
        payload = jwt.decode(
            token,
            get_settings().SECRET_KEY,
            algorithms=[_JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise ValueError(f"Invalid or expired token: {exc}") from exc

    reserved_keys = {"sub", "role", "iat", "exp"}
    extra = {k: v for k, v in payload.items() if k not in reserved_keys}

    return TokenPayload(
        sub=payload["sub"],
        role=payload.get("role", Role.VIEWER),
        iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
        exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        extra=extra,
    )


def require_role(*allowed_roles: Role | str):
    """FastAPI dependency factory that enforces RBAC on a route.

    Usage::

        from fastapi import Depends

        @router.get("/admin/dashboard")
        def admin_dashboard(
            token: TokenPayload = Depends(require_role(Role.ADMIN)),
        ):
            ...
    """
    from fastapi import Depends, Header, HTTPException, status

    async def _dependency(
        authorization: str | None = Header(None, alias="Authorization"),
    ) -> TokenPayload:
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header missing.",
            )
        scheme, _, raw_token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not raw_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme. Use 'Bearer <token>'.",
            )
        try:
            token_data = decode_access_token(raw_token)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
            ) from exc

        if not token_data.has_role(*allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Role '{token_data.role}' is not authorised.  "
                    f"Required: {', '.join(str(r) for r in allowed_roles)}."
                ),
            )
        return token_data

    return _dependency
