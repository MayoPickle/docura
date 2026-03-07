from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./docura.db")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    # Ensure ORM models are imported so Base.metadata contains all tables.
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_schema_migrations(conn)


async def _run_schema_migrations(conn) -> None:
    if conn.dialect.name != "sqlite":
        return

    table_exists = await conn.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='document_type_preferences'"
        )
    )
    if not table_exists.scalar_one_or_none():
        return

    table_info = await conn.execute(text("PRAGMA table_info(document_type_preferences)"))
    existing_cols = {row[1] for row in table_info.fetchall()}

    if "icon_bg" not in existing_cols:
        await conn.execute(text("ALTER TABLE document_type_preferences ADD COLUMN icon_bg VARCHAR(16)"))
    if "icon_fg" not in existing_cols:
        await conn.execute(text("ALTER TABLE document_type_preferences ADD COLUMN icon_fg VARCHAR(16)"))
