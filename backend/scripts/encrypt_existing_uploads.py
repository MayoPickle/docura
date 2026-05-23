#!/usr/bin/env python3
"""Encrypt existing plaintext upload files in place."""

from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session  # noqa: E402
from app.models import File as DocumentFile  # noqa: E402
from app.services.file_crypto import (  # noqa: E402
    decrypt_from_storage,
    encrypt_for_storage,
    get_file_crypto_config,
    is_encrypted_blob,
)


@dataclass
class EncryptSummary:
    scanned: int = 0
    encrypted: int = 0
    already_encrypted: int = 0
    missing: int = 0
    failed: int = 0


def resolve_file_path(stored_path: str) -> Path:
    path = Path(stored_path)
    if path.exists():
        return path

    upload_dir = os.getenv("UPLOAD_DIR")
    if upload_dir:
        fallback = Path(upload_dir) / path.name
        if fallback.exists():
            return fallback

    return path


def backup_file(path: Path, backup_dir: Path, file_id: int) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"{file_id}-{path.name}"
    shutil.copy2(path, backup_path)


def encrypt_file(path: Path, backup_dir: Path | None, file_id: int) -> bool:
    payload = path.read_bytes()
    if is_encrypted_blob(payload):
        return False

    encrypted = encrypt_for_storage(payload)
    if decrypt_from_storage(encrypted) != payload:
        raise RuntimeError(f"Encryption round trip failed for {path}")

    if backup_dir:
        backup_file(path=path, backup_dir=backup_dir, file_id=file_id)

    tmp_path = path.with_name(f".{path.name}.encrypting")
    tmp_path.write_bytes(encrypted)
    os.replace(tmp_path, path)
    return True


async def run(args: argparse.Namespace) -> EncryptSummary:
    config = get_file_crypto_config()
    if not config.enabled:
        raise RuntimeError(
            "File encryption is not enabled. Set FILE_ENCRYPTION_ENABLED=true "
            "and configure FILE_ENCRYPTION_KEY or FILE_ENCRYPTION_KEYS."
        )

    backup_dir = Path(args.backup_dir).resolve() if args.backup_dir else None
    summary = EncryptSummary()

    async with async_session() as session:
        result = await session.execute(select(DocumentFile).order_by(DocumentFile.id))
        rows = result.scalars().all()

    for row in rows:
        summary.scanned += 1
        path = resolve_file_path(row.filepath)
        if not path.exists():
            summary.missing += 1
            print(f"missing file_id={row.id} path={row.filepath}", file=sys.stderr)
            continue

        try:
            payload = path.read_bytes()
            if is_encrypted_blob(payload):
                summary.already_encrypted += 1
                continue

            if not args.write:
                summary.encrypted += 1
                print(f"would encrypt file_id={row.id} path={path}")
                continue

            encrypt_file(path=path, backup_dir=backup_dir, file_id=row.id)
            summary.encrypted += 1
            print(f"encrypted file_id={row.id} path={path}")
        except Exception as exc:
            summary.failed += 1
            print(f"failed file_id={row.id} path={path}: {exc}", file=sys.stderr)
            if not args.keep_going:
                raise

        if args.limit and summary.scanned >= args.limit:
            break

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Encrypt files in place. Without this flag, the script only reports what would change.",
    )
    parser.add_argument(
        "--backup-dir",
        help="Optional directory for plaintext backups before in-place encryption.",
    )
    parser.add_argument(
        "--keep-going",
        action="store_true",
        help="Continue after individual file failures.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Only scan the first N database file rows.",
    )
    return parser.parse_args()


def main() -> int:
    try:
        summary = asyncio.run(run(parse_args()))
    except Exception as exc:
        print(f"Encryption failed: {exc}", file=sys.stderr)
        return 1

    mode = "written" if "--write" in sys.argv else "dry-run"
    print(
        f"Upload encryption {mode}: scanned={summary.scanned}, "
        f"plaintext={summary.encrypted}, already_encrypted={summary.already_encrypted}, "
        f"missing={summary.missing}, failed={summary.failed}"
    )
    if mode == "dry-run":
        print("Re-run with --write to encrypt plaintext files.")
    return 0 if summary.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
