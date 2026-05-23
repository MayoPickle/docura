#!/usr/bin/env python3
"""Copy Docura data from the legacy SQLite database into PostgreSQL."""

from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@dataclass(frozen=True)
class TableConfig:
    name: str
    columns: tuple[str, ...]
    optional_defaults: dict[str, Any]
    datetime_columns: tuple[str, ...] = ()
    required: bool = True


TABLES = (
    TableConfig(
        name="users",
        columns=("id", "name", "email", "hashed_password", "created_at"),
        optional_defaults={"created_at": None},
        datetime_columns=("created_at",),
    ),
    TableConfig(
        name="documents",
        columns=("id", "user_id", "title", "doc_type", "fields_json", "notes", "created_at", "updated_at"),
        optional_defaults={"fields_json": "{}", "notes": "", "created_at": None, "updated_at": None},
        datetime_columns=("created_at", "updated_at"),
    ),
    TableConfig(
        name="files",
        columns=("id", "document_id", "filename", "filepath", "content_type", "uploaded_at"),
        optional_defaults={"content_type": "application/octet-stream", "uploaded_at": None},
        datetime_columns=("uploaded_at",),
    ),
    TableConfig(
        name="document_type_preferences",
        columns=("id", "user_id", "doc_type_norm", "icon_key", "icon_bg", "icon_fg", "updated_at"),
        optional_defaults={"icon_bg": None, "icon_fg": None, "updated_at": None},
        datetime_columns=("updated_at",),
        required=False,
    ),
)


def normalize_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgresql://")
    return url


def parse_datetime(value: Any) -> datetime | None:
    if value is None or isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        parsed = datetime.fromisoformat(cleaned)
    else:
        raise ValueError(f"Unsupported datetime value: {value!r}")

    if parsed is None:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def read_table(conn: sqlite3.Connection, config: TableConfig) -> list[dict[str, Any]]:
    if not table_exists(conn, config.name):
        if config.required:
            raise RuntimeError(f"Source SQLite database is missing required table: {config.name}")
        return []

    existing_columns = table_columns(conn, config.name)
    selected_columns = [column for column in config.columns if column in existing_columns]
    missing_columns = [column for column in config.columns if column not in existing_columns]
    unsupported_missing = [
        column for column in missing_columns if column not in config.optional_defaults
    ]
    if unsupported_missing:
        joined = ", ".join(unsupported_missing)
        raise RuntimeError(f"Source table {config.name} is missing required column(s): {joined}")

    rows = conn.execute(
        f"SELECT {', '.join(selected_columns)} FROM {config.name} ORDER BY id"
    ).fetchall()

    normalized_rows: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        for column in missing_columns:
            item[column] = config.optional_defaults[column]
        for column in config.datetime_columns:
            item[column] = parse_datetime(item[column])
        normalized_rows.append({column: item[column] for column in config.columns})
    return normalized_rows


def read_sqlite(sqlite_path: Path) -> dict[str, list[dict[str, Any]]]:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {sqlite_path}")

    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        return {config.name: read_table(conn, config) for config in TABLES}
    finally:
        conn.close()


def resolve_source_file(stored_path: str, source_uploads: Path) -> Path:
    stored = Path(stored_path)
    if stored.is_absolute() and stored.exists():
        return stored
    return source_uploads / stored.name


def same_file(source: Path, destination: Path) -> bool:
    try:
        return source.samefile(destination)
    except FileNotFoundError:
        return False


def copy_uploads(
    file_rows: list[dict[str, Any]],
    source_uploads: Path,
    target_uploads: Path,
    stored_upload_dir: str,
    skip_file_copy: bool,
) -> tuple[int, list[Path]]:
    target_uploads.mkdir(parents=True, exist_ok=True)
    copied = 0
    missing: list[Path] = []

    for row in file_rows:
        original_path = str(row["filepath"])
        filename = Path(original_path).name
        if not filename:
            raise RuntimeError(f"File row {row['id']} has an invalid filepath: {original_path!r}")

        source = resolve_source_file(original_path, source_uploads)
        destination = target_uploads / filename
        row["filepath"] = f"{stored_upload_dir.rstrip('/')}/{filename}"

        if skip_file_copy:
            continue
        if not source.exists():
            missing.append(source)
            continue
        if same_file(source, destination):
            continue
        shutil.copy2(source, destination)
        copied += 1

    return copied, missing


def load_metadata(postgres_url: str):
    os.environ["DATABASE_URL"] = postgres_url
    from app.database import Base
    from app import models  # noqa: F401

    return Base.metadata


async def ensure_empty_or_replace(conn, replace: bool) -> None:
    counts = {}
    for config in TABLES:
        result = await conn.execute(text(f"SELECT COUNT(*) FROM {config.name}"))
        counts[config.name] = result.scalar_one()

    populated = {table: count for table, count in counts.items() if count}
    if populated and not replace:
        details = ", ".join(f"{table}={count}" for table, count in populated.items())
        raise RuntimeError(
            "Target PostgreSQL database is not empty. "
            f"Found rows: {details}. Re-run with --replace to overwrite it."
        )

    if replace:
        await conn.execute(
            text(
                "TRUNCATE TABLE document_type_preferences, files, documents, users "
                "RESTART IDENTITY CASCADE"
            )
        )


async def insert_rows(conn, table_name: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    columns = tuple(rows[0].keys())
    column_sql = ", ".join(columns)
    values_sql = ", ".join(f":{column}" for column in columns)
    await conn.execute(
        text(f"INSERT INTO {table_name} ({column_sql}) VALUES ({values_sql})"),
        rows,
    )


async def reset_sequence(conn, table_name: str) -> None:
    await conn.execute(
        text(
            f"""
            SELECT setval(
                pg_get_serial_sequence('{table_name}', 'id'),
                COALESCE((SELECT MAX(id) FROM {table_name}), 1),
                (SELECT EXISTS(SELECT 1 FROM {table_name}))
            )
            """
        )
    )


async def migrate(args: argparse.Namespace) -> None:
    postgres_url = normalize_postgres_url(args.postgres_url or os.getenv("DATABASE_URL", ""))
    if not postgres_url:
        raise RuntimeError("Set DATABASE_URL or pass --postgres-url.")

    source_uploads = Path(args.source_uploads).resolve()
    target_uploads = Path(args.target_uploads).resolve()
    stored_upload_dir = args.stored_upload_dir or os.getenv("UPLOAD_DIR") or str(target_uploads)

    sqlite_rows = read_sqlite(Path(args.sqlite_path).resolve())
    copied, missing = copy_uploads(
        file_rows=sqlite_rows["files"],
        source_uploads=source_uploads,
        target_uploads=target_uploads,
        stored_upload_dir=stored_upload_dir,
        skip_file_copy=args.skip_file_copy,
    )

    if missing and not args.allow_missing_files:
        sample = "\n".join(f"  - {path}" for path in missing[:10])
        raise RuntimeError(
            f"{len(missing)} upload file(s) referenced by SQLite were not found:\n{sample}\n"
            "Fix the upload directory or re-run with --allow-missing-files."
        )

    metadata = load_metadata(postgres_url)
    engine = create_async_engine(postgres_url)
    try:
        async with engine.begin() as conn:
            if conn.dialect.name != "postgresql":
                raise RuntimeError("Target database must be PostgreSQL.")

            await conn.run_sync(metadata.create_all)
            await ensure_empty_or_replace(conn, replace=args.replace)

            for config in TABLES:
                await insert_rows(conn, config.name, sqlite_rows[config.name])
            for config in TABLES:
                await reset_sequence(conn, config.name)
    finally:
        await engine.dispose()

    row_counts = ", ".join(f"{table}={len(rows)}" for table, rows in sqlite_rows.items())
    print(f"Migration complete. Rows copied: {row_counts}. Upload files copied: {copied}.")
    if missing:
        print(f"Warning: {len(missing)} upload file(s) were missing and skipped.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite-path", default="docura.db", help="Path to the existing SQLite database.")
    parser.add_argument("--postgres-url", help="PostgreSQL URL. Defaults to DATABASE_URL.")
    parser.add_argument("--source-uploads", default="uploads", help="Directory containing existing upload files.")
    parser.add_argument("--target-uploads", default="uploads", help="Directory where upload files should be copied.")
    parser.add_argument(
        "--stored-upload-dir",
        help="Upload directory path to store in PostgreSQL file records. Defaults to UPLOAD_DIR or target uploads.",
    )
    parser.add_argument("--replace", action="store_true", help="Overwrite existing target PostgreSQL rows.")
    parser.add_argument("--skip-file-copy", action="store_true", help="Only migrate database rows.")
    parser.add_argument(
        "--allow-missing-files",
        action="store_true",
        help="Continue even when SQLite references upload files that are missing from disk.",
    )
    return parser.parse_args()


def main() -> int:
    try:
        asyncio.run(migrate(parse_args()))
    except Exception as exc:
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
