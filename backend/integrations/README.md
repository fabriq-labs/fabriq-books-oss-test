# Fabriq Books — integrations

Python/dbt forward-sync for ERP connectors. Lives next to the Node API under `backend/integrations/`.

## Layout

| Path | Role |
|------|------|
| `shared/` | Encryption, DB helpers, settings |
| `sync_service/` | FastAPI: Airbyte trigger + dbt runner |
| `quickbooks/` | QBO staging + normalized dbt + `run_dbt.py` |

## Tooling

```bash
# from backend/integrations
uv sync
uv run uvicorn sync_service.main:app --host 127.0.0.1 --port 8090
ORG_ID=org_xxx uv run python quickbooks/run_dbt.py
```

Shared runtime env comes from the **repo-root `.env`** (same keys as Docker/Railway). Prefer `DATABASE_URL` + `ERP_CONFIG_ENCRYPTION_KEY`.

For single-tenant deploys, sync runs **inside the main app container** on loopback (`SYNC_PORT=8090`). See `docs/domain/QUICKBOOKS_FORWARD_SYNC.md`.
