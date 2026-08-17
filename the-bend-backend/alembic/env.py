import asyncio
import os
import re
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import all models so Alembic can detect them
from app.models import *  # noqa: F401, F403
from app.database import Base
from app.config import get_settings

# this is the Alembic Config object
config = context.config

# Set the database URL from settings
settings = get_settings()
ALEMBIC_SCHEMA = os.getenv("ALEMBIC_SCHEMA")
if ALEMBIC_SCHEMA is not None and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", ALEMBIC_SCHEMA):
    raise RuntimeError("ALEMBIC_SCHEMA must match [A-Za-z_][A-Za-z0-9_]*")
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# MetaData for autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=ALEMBIC_SCHEMA,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    if ALEMBIC_SCHEMA:
        connection.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{ALEMBIC_SCHEMA}"')
        connection.exec_driver_sql(f'SET search_path TO "{ALEMBIC_SCHEMA}"')
        connection.commit()
    context.configure(connection=connection, target_metadata=target_metadata, version_table_schema=ALEMBIC_SCHEMA)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
