#!/usr/bin/env python3
"""Run QuickBooks dbt stages: staging → integrations → normalized.

Env (repo-root `.env` or process):
  DATABASE_URL (preferred) or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME
  ORG_ID (required) — also accepts legacy lowercase org_id
  FORCE_PROCESS_ALL, DBT_THREADS, DBT_SOURCE_TABLE_PREFIX
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Allow `python quickbooks/run_dbt.py` from integrations root
_INTEGRATIONS_ROOT = Path(__file__).resolve().parent.parent
if str(_INTEGRATIONS_ROOT) not in sys.path:
    sys.path.insert(0, str(_INTEGRATIONS_ROOT))

from shared.db import table_exists  # noqa: E402
from shared.settings import (  # noqa: E402
    ensure_db_env_from_database_url,
    get_settings,
    load_dotenv_files,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def resolve_org_id() -> str | None:
    return os.getenv("ORG_ID") or os.getenv("org_id")


def validate_environment() -> bool:
    required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        logger.error("Missing required database env: %s", missing)
        return False
    if not resolve_org_id():
        logger.error("ORG_ID (or legacy org_id) is required")
        return False
    return True


def is_first_run() -> bool:
    """Detect cold start: key public tables empty-of-sync or missing."""
    markers = [
        ("customer", "public"),
        ("account", "public"),
    ]
    for table, schema in markers:
        if not table_exists(table, schema=schema):
            logger.info("First run: %s.%s missing", schema, table)
            return True
    return False


def resolve_dbt_argv() -> list[str]:
    """Return argv prefix to invoke dbt from the active interpreter's environment.

    Do not resolve() sys.executable before taking .parent — venv ``python`` is
    often a symlink to /usr/bin/python3, and resolve() would leave the venv.
    ``python -m dbt`` is not supported (no dbt.__main__).
    """
    candidates: list[Path] = []
    # 1) Same directory as the running interpreter (…/venv/bin/dbt)
    candidates.append(Path(sys.executable).parent / "dbt")
    # 2) VIRTUAL_ENV / sys.prefix bin
    for prefix in (os.environ.get("VIRTUAL_ENV"), sys.prefix):
        if prefix:
            candidates.append(Path(prefix) / "bin" / "dbt")
    # 3) Integrations tree baked by Docker
    candidates.append(Path(_INTEGRATIONS_ROOT) / ".venv" / "bin" / "dbt")

    seen: set[str] = set()
    for venv_dbt in candidates:
        key = str(venv_dbt)
        if key in seen:
            continue
        seen.add(key)
        if venv_dbt.is_file() and os.access(venv_dbt, os.X_OK):
            return [str(venv_dbt)]

    # Local/dev only: uv when explicitly available.
    if shutil.which("uv") and (Path(_INTEGRATIONS_ROOT) / "uv.lock").exists():
        return ["uv", "run", "dbt"]

    which = shutil.which("dbt")
    if which:
        return [which]

    raise FileNotFoundError(
        "dbt console script not found in venv bin, via uv, or on PATH. "
        f"sys.executable={sys.executable!r} candidates={list(seen)}"
    )


def run_dbt_command(argv: list[str], stage_name: str, dbt_dir: Path) -> bool:
    logger.info("Starting %s: %s", stage_name, " ".join(argv))
    try:
        result = subprocess.run(
            argv,
            check=True,
            capture_output=True,
            text=True,
            cwd=str(dbt_dir),
        )
        logger.info("%s completed successfully", stage_name)
        if result.stdout.strip():
            logger.info("Output:\n%s", result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        logger.error("%s failed (exit %s)", stage_name, e.returncode)
        if e.stderr:
            logger.error("stderr:\n%s", e.stderr)
        if e.stdout:
            logger.info("stdout:\n%s", e.stdout)
        return False


def main() -> None:
    logger.info("=" * 60)
    logger.info("DBT Pipeline Started (QuickBooks → universal sales)")
    logger.info("=" * 60)

    load_dotenv_files()
    ensure_db_env_from_database_url()
    settings = get_settings()
    logging.getLogger().setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    if not validate_environment():
        sys.exit(1)

    org_id = resolve_org_id()
    assert org_id
    # Keep legacy var name for dbt models
    os.environ["org_id"] = org_id
    os.environ["ORG_ID"] = org_id

    dbt_dir = Path(__file__).parent / "dbt"
    if not dbt_dir.exists():
        logger.error("DBT directory not found: %s", dbt_dir)
        sys.exit(1)

    force = settings.force_process_all or (
        os.getenv("FORCE_PROCESS_ALL", "").lower() in ("1", "true", "yes")
    )
    vars_dict: dict = {"org_id": org_id}
    if force:
        vars_dict["force_process_all"] = True
        logger.info("FORCE_PROCESS_ALL=true")
    first_run = is_first_run()
    threads = 1 if first_run else int(os.getenv("DBT_THREADS", str(settings.dbt_threads)))
    logger.info("Using %s dbt threads (first_run=%s)", threads, first_run)

    # Runtime contract: use the baked venv (same as start.sh → python -m uvicorn).
    # `uv` is build-only; never require it on PATH in the container.
    dbt_bin = resolve_dbt_argv()
    logger.info("dbt launcher: %s", " ".join(dbt_bin))

    def stage(name: str, select: str, with_vars: bool = False) -> list[str]:
        cmd = [
            *dbt_bin,
            "run",
            "--select",
            select,
            "--profiles-dir",
            ".",
            "--threads",
            str(threads),
        ]
        if with_vars:
            cmd.extend(["--vars", json.dumps(vars_dict)])
        return cmd

    stages = [
        ("staging", stage("staging", "staging.*")),
        ("integrations", stage("integrations", "integrations.*", with_vars=True)),
        ("normalized", stage("normalized", "normalized.*", with_vars=True)),
    ]

    completed: list[str] = []
    success = True
    for name, argv in stages:
        if not run_dbt_command(argv, name, dbt_dir):
            success = False
            break
        completed.append(name)

    if success:
        restore = _INTEGRATIONS_ROOT / "shared" / "restore_constraints.py"
        if restore.exists():
            try:
                subprocess.run(
                    [sys.executable, str(restore)],
                    cwd=str(Path(__file__).parent),
                    check=True,
                    capture_output=True,
                    text=True,
                )
                logger.info("Constraint restore finished")
            except subprocess.CalledProcessError as e:
                logger.warning("Constraint restore failed: %s", e.stderr or e)

        test_argv = [*dbt_bin, "test", "--profiles-dir", ".", "--vars", json.dumps(vars_dict)]
        if not run_dbt_command(test_argv, "tests", dbt_dir):
            logger.warning("dbt tests failed; pipeline stages succeeded")

    logger.info("=" * 60)
    if success:
        logger.info("DBT Pipeline Completed: %s", ", ".join(completed))
        sys.exit(0)
    logger.error("DBT Pipeline Failed after: %s", ", ".join(completed))
    sys.exit(1)


if __name__ == "__main__":
    main()
