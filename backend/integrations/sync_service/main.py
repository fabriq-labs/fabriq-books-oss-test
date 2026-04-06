"""
HTTP sync service for Railway: API key auth → Airbyte sync → run_dbt.py.

Both Zoho Books and QuickBooks use each integration’s `run_dbt.py` (not sync_and_transform).
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from psycopg2.extras import Json
from pydantic import BaseModel

from sync_service.airbyte_client import run_airbyte_sync
from sync_service.user_api_key_validator import _connect, validate_org_api_key_hash

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Fabriq integration sync", version="1.0.0")

# Repo layout inside Docker: /app/zoho_books, /app/quickbooks
ROOT = Path(__file__).resolve().parent.parent


def _ensure_db_env_from_database_url() -> None:
    """If DB_* are missing, parse DATABASE_URL (postgres:// or postgresql://)."""
    if os.getenv("DB_HOST"):
        return
    url = os.getenv("DATABASE_URL")
    if not url:
        return
    try:
        p = urlparse(url)
        if p.hostname:
            os.environ["DB_HOST"] = p.hostname
        if p.port:
            os.environ["DB_PORT"] = str(p.port)
        else:
            os.environ.setdefault("DB_PORT", "5432")
        if p.username:
            os.environ["DB_USER"] = p.username
        if p.password:
            os.environ["DB_PASSWORD"] = p.password
        path = (p.path or "").lstrip("/")
        if path:
            dbname = path.split("?")[0]
            if dbname:
                os.environ["DB_NAME"] = dbname
    except Exception as e:
        logger.warning("Could not parse DATABASE_URL for DB_*: %s", e)


class SyncRequest(BaseModel):
    org_id: str
    system_type: str  # zoho_books | quickbooks
    connection_id: Optional[str] = None
    # full_sync | transform_only | extract_only
    sync_mode: Optional[str] = "full_sync"


def _require_api_key_for_org(x_api_key: Optional[str], org_id: str) -> None:
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    try:
        ok = validate_org_api_key_hash(org_id=org_id, api_key_hash=x_api_key.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API key validation failed: {e}")
    if not ok:
        raise HTTPException(status_code=401, detail="API key is not valid for this organization")


def _run_dbt_for_system(system_type: str, org_id: str) -> dict[str, Any]:
    _ensure_db_env_from_database_url()
    if system_type == "zoho_books":
        cwd = Path(os.getenv("ZOHO_BOOKS_ROOT", str(ROOT / "zoho_books")))
        script = cwd / "run_dbt.py"
    elif system_type == "quickbooks":
        cwd = Path(os.getenv("QUICKBOOKS_ROOT", str(ROOT / "quickbooks")))
        script = cwd / "run_dbt.py"
    else:
        raise ValueError(f"Unsupported system_type: {system_type}")

    if not script.is_file():
        raise FileNotFoundError(f"run_dbt.py not found at {script}")

    env = os.environ.copy()
    env["org_id"] = org_id

    start = time.monotonic()
    timeout_sec = int(os.getenv("DBT_SUBPROCESS_TIMEOUT_SEC", "7200"))
    logger.info("Starting DBT runner: %s (org_id=%s)", script, org_id)

    # Stream DBT logs live to service stdout so they appear in Uvicorn/Railway logs.
    proc = subprocess.Popen(
        [sys.executable, str(script)],
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    tail_lines: deque[str] = deque(maxlen=120)
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            clean = line.rstrip("\n")
            if clean:
                logger.info("[dbt:%s] %s", system_type, clean)
            tail_lines.append(line)
        rc = proc.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RuntimeError(f"run_dbt.py timed out after {timeout_sec}s")

    elapsed_ms = int((time.monotonic() - start) * 1000)
    stdout_tail = "".join(tail_lines)[-8000:]
    out = {
        "exit_code": rc,
        "duration_ms": elapsed_ms,
        "stdout_tail": stdout_tail,
        "stderr_tail": "",
    }
    if rc != 0:
        raise RuntimeError(f"run_dbt.py failed: {out}")
    logger.info("DBT runner finished successfully in %sms", elapsed_ms)
    return out


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_source_system_status(
    *,
    org_id: str,
    connection_id: Optional[str],
    status_payload: dict[str, Any],
) -> None:
    if not connection_id:
        logger.warning("Skipping source_system status update: missing connection_id")
        return
    conn = _connect()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE source_system
                SET last_sync_status = %s::jsonb,
                    last_sync_at = NOW()
                WHERE id = %s
                  AND org_id = %s
                """,
                (Json(status_payload), connection_id, org_id),
            )
    finally:
        conn.close()


def _run_sync_workflow(body: SyncRequest, sync_mode: str) -> dict[str, Any]:
    t0 = time.monotonic()
    result: dict[str, Any] = {
        "status": "success",
        "system_type": body.system_type,
        "org_id": body.org_id,
        "connection_id": body.connection_id,
        "sync_mode": sync_mode,
    }
    if sync_mode in ("full_sync", "extract_only"):
        airbyte_info = run_airbyte_sync(body.org_id, body.connection_id)
        result["airbyte"] = airbyte_info
    else:
        result["airbyte"] = {"skipped": True, "reason": "sync_mode=transform_only"}

    if sync_mode in ("full_sync", "transform_only"):
        dbt_info = _run_dbt_for_system(body.system_type, body.org_id)
        result["dbt"] = dbt_info
    else:
        result["dbt"] = {"skipped": True, "reason": "sync_mode=extract_only"}

    result["total_duration_ms"] = int((time.monotonic() - t0) * 1000)
    return result


def _run_sync_in_background(body: SyncRequest, sync_mode: str) -> None:
    try:
        result = _run_sync_workflow(body, sync_mode)
        ok_status = {
            "status": "success",
            "message": "Sync completed",
            "sync_mode": sync_mode,
            "synced_at": _iso_now(),
            "detail": result,
        }
        _update_source_system_status(
            org_id=body.org_id,
            connection_id=body.connection_id,
            status_payload=ok_status,
        )
    except Exception as e:
        logger.exception("Sync workflow failed")
        err_status = {
            "status": "error",
            "message": str(e),
            "sync_mode": sync_mode,
            "synced_at": _iso_now(),
        }
        _update_source_system_status(
            org_id=body.org_id,
            connection_id=body.connection_id,
            status_payload=err_status,
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sync")
def sync(
    body: SyncRequest,
    background_tasks: BackgroundTasks,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> dict[str, Any]:
    _ensure_db_env_from_database_url()
    _require_api_key_for_org(x_api_key, body.org_id)
    if body.system_type not in ("zoho_books", "quickbooks"):
        raise HTTPException(status_code=400, detail="system_type must be zoho_books or quickbooks")
    if not body.org_id:
        raise HTTPException(status_code=400, detail="org_id is required")
    sync_mode = body.sync_mode or "full_sync"
    if sync_mode not in ("full_sync", "transform_only", "extract_only"):
        raise HTTPException(
            status_code=400,
            detail="sync_mode must be full_sync | transform_only | extract_only",
        )

    in_progress_status = {
        "status": "in_progress",
        "message": "Sync in progress",
        "sync_mode": sync_mode,
        "started_at": _iso_now(),
    }
    _update_source_system_status(
        org_id=body.org_id,
        connection_id=body.connection_id,
        status_payload=in_progress_status,
    )
    background_tasks.add_task(_run_sync_in_background, body, sync_mode)
    return {
        "status": "accepted",
        "message": "Sync queued",
        "connection_id": body.connection_id,
        "org_id": body.org_id,
        "system_type": body.system_type,
        "sync_mode": sync_mode,
        "detail": in_progress_status,
    }
