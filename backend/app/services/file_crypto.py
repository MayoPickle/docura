import base64
import hashlib
import os
import binascii
from dataclasses import dataclass
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"DOCURAE1"
NONCE_SIZE = 12
KEY_ID_LEN_SIZE = 2


class FileCryptoError(RuntimeError):
    pass


@dataclass(frozen=True)
class FileCryptoConfig:
    enabled: bool
    active_key_id: str | None
    keys: dict[str, bytes]


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise FileCryptoError(f"Invalid boolean value: {value}")


def _decode_key(raw: str) -> bytes:
    token = raw.strip()
    if not token:
        raise FileCryptoError("Empty encryption key")
    padded = token + ("=" * (-len(token) % 4))
    try:
        # urlsafe decoder also accepts normal base64 tokens.
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8"))
    except (binascii.Error, ValueError) as exc:
        raise FileCryptoError("Could not decode encryption key (expected base64 or base64url)") from exc
    if len(decoded) not in {16, 24, 32}:
        raise FileCryptoError("AES-GCM key must be 128, 192, or 256 bits")
    return decoded


def _parse_key_ring(keys_env: str | None) -> dict[str, bytes]:
    if not keys_env:
        return {}

    ring: dict[str, bytes] = {}
    for part in keys_env.split(","):
        item = part.strip()
        if not item:
            continue
        if ":" not in item:
            raise FileCryptoError("FILE_ENCRYPTION_KEYS entries must be key_id:base64key")
        key_id, encoded_key = item.split(":", 1)
        key_id = key_id.strip()
        if not key_id:
            raise FileCryptoError("Encryption key id cannot be empty")
        ring[key_id] = _decode_key(encoded_key)
    return ring


@lru_cache(maxsize=1)
def get_file_crypto_config() -> FileCryptoConfig:
    key_ring = _parse_key_ring(os.getenv("FILE_ENCRYPTION_KEYS"))
    single_key = os.getenv("FILE_ENCRYPTION_KEY", "").strip()
    if single_key and not key_ring:
        single_id = os.getenv("FILE_ENCRYPTION_ACTIVE_KEY_ID", "").strip() or "default"
        key_ring[single_id] = _decode_key(single_key)

    enabled = _parse_bool(os.getenv("FILE_ENCRYPTION_ENABLED"), default=bool(key_ring))
    active_key_id = os.getenv("FILE_ENCRYPTION_ACTIVE_KEY_ID", "").strip() or None
    if not active_key_id and key_ring:
        active_key_id = next(iter(key_ring))

    if enabled and not key_ring:
        raise FileCryptoError(
            "File encryption is enabled but no key is configured. "
            "Set FILE_ENCRYPTION_KEY or FILE_ENCRYPTION_KEYS."
        )
    if enabled and (not active_key_id or active_key_id not in key_ring):
        raise FileCryptoError("Active file encryption key id is missing or not found in key ring")

    return FileCryptoConfig(enabled=enabled, active_key_id=active_key_id, keys=key_ring)


def ensure_file_crypto_ready() -> None:
    get_file_crypto_config()


def file_encryption_enabled() -> bool:
    return get_file_crypto_config().enabled


def _build_header(key_id: str, nonce: bytes) -> bytes:
    key_id_bytes = key_id.encode("utf-8")
    if len(key_id_bytes) > 65535:
        raise FileCryptoError("Encryption key id is too long")
    return MAGIC + len(key_id_bytes).to_bytes(KEY_ID_LEN_SIZE, "big") + key_id_bytes + nonce


def _parse_header(blob: bytes) -> tuple[str, bytes, bytes]:
    if len(blob) < len(MAGIC) + KEY_ID_LEN_SIZE + NONCE_SIZE + 1:
        raise FileCryptoError("Encrypted payload is too short")
    if not blob.startswith(MAGIC):
        raise FileCryptoError("Payload is not encrypted with Docura format")

    offset = len(MAGIC)
    key_id_len = int.from_bytes(blob[offset:offset + KEY_ID_LEN_SIZE], "big")
    offset += KEY_ID_LEN_SIZE

    key_id_end = offset + key_id_len
    nonce_end = key_id_end + NONCE_SIZE
    if nonce_end > len(blob):
        raise FileCryptoError("Encrypted payload header is malformed")

    key_id = blob[offset:key_id_end].decode("utf-8")
    nonce = blob[key_id_end:nonce_end]
    ciphertext = blob[nonce_end:]
    return key_id, nonce, ciphertext


def is_encrypted_blob(blob: bytes) -> bool:
    return blob.startswith(MAGIC)


def encrypt_for_storage(plaintext: bytes) -> bytes:
    config = get_file_crypto_config()
    if not config.enabled:
        return plaintext

    key_id = config.active_key_id
    if key_id is None:
        raise FileCryptoError("Active encryption key id is not configured")

    key = config.keys[key_id]
    nonce = os.urandom(NONCE_SIZE)
    aad = MAGIC + key_id.encode("utf-8")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, aad)
    return _build_header(key_id, nonce) + ciphertext


def decrypt_from_storage(payload: bytes) -> bytes:
    if not is_encrypted_blob(payload):
        return payload

    key_id, nonce, ciphertext = _parse_header(payload)
    config = get_file_crypto_config()
    key = config.keys.get(key_id)
    if key is None:
        raise FileCryptoError(f"Missing decryption key for key id: {key_id}")

    aad = MAGIC + key_id.encode("utf-8")
    try:
        return AESGCM(key).decrypt(nonce, ciphertext, aad)
    except Exception as exc:
        raise FileCryptoError("Failed to decrypt file payload") from exc


def read_plaintext_file(path: str) -> bytes:
    with open(path, "rb") as f:
        stored = f.read()
    return decrypt_from_storage(stored)


def plaintext_sha256_file(path: str) -> str | None:
    try:
        plaintext = read_plaintext_file(path)
    except OSError:
        return None
    digest = hashlib.sha256(plaintext).hexdigest()
    return digest
