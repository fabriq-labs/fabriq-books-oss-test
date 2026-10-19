"""Typed settings for sync_service and dbt runners.

Canonical source: process environment (Railway / Docker / repo-root `.env`).
Already-set process env always wins over any file load.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote, urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_repo_root_env() -> Path | None:
    """Walk up from this file for a repo-root `.env` (…/backend/integrations/shared → repo)."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / ".env"
        if candidate.is_file() and (parent / "backend").is_dir():
            return candidate
    return None


def apply_env_file(path: Path) -> bool:
    if not path.is_file():
        return False
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if key and key not in os.environ:
                os.environ[key] = value
    return True


def load_dotenv_files() -> None:
    """Load optional env files without overriding existing process env."""
    explicit = os.getenv("ENV_FILE")
    if explicit:
        apply_env_file(Path(explicit))
        return
    root = find_repo_root_env()
    if root:
        apply_env_file(root)
    # Optional package-local overrides (still non-overriding)
    here = Path(__file__).resolve().parent.parent
    for name in (".env", "env"):
        apply_env_file(here / name)
        apply_env_file(here / "sync_service" / name)
        apply_env_file(here / "quickbooks" / name)


def ensure_db_env_from_database_url(*, force: bool = True) -> None:
    """Derive DB_* for dbt profiles.yml from DATABASE_URL.

    When force=True (default), DATABASE_URL always overwrites stale DB_* from a
    prior local session so dbt cannot target the wrong database.
    """
    url = os.getenv("DATABASE_URL")
    if not url:
        return
    if not force and os.getenv("DB_HOST"):
        return
    p = urlparse(url)
    if p.hostname:
        os.environ["DB_HOST"] = p.hostname
    os.environ["DB_PORT"] = str(p.port or 5432)
    if p.username:
        os.environ["DB_USER"] = unquote(p.username)
    if p.password:
        os.environ["DB_PASSWORD"] = unquote(p.password)
    path = (p.path or "").lstrip("/")
    if path:
        os.environ["DB_NAME"] = path.split("?")[0]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    erp_config_encryption_key: str | None = Field(
        default=None, alias="ERP_CONFIG_ENCRYPTION_KEY"
    )
    skip_airbyte: bool = Field(default=False, alias="SKIP_AIRBYTE")
    dbt_threads: int = Field(default=2, alias="DBT_THREADS")
    dbt_subprocess_timeout_sec: int = Field(default=7200, alias="DBT_SUBPROCESS_TIMEOUT_SEC")
    force_process_all: bool = Field(default=False, alias="FORCE_PROCESS_ALL")
    org_id: str | None = Field(default=None, alias="ORG_ID")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: str = Field(default="text", alias="LOG_FORMAT")  # text | json
    pgsslmode: str = Field(default="prefer", alias="PGSSLMODE")
    sync_port: int = Field(default=8090, alias="SYNC_PORT")


@lru_cache
def get_settings() -> Settings:
    load_dotenv_files()
    ensure_db_env_from_database_url()
    return Settings()
