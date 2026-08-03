# Agent notes

## Cursor Cloud specific instructions

### Railway deploy debug (logs)

This monorepo deploys via root `Dockerfile` → GHCR → Railway Docker Image services.

To fetch **live logs** and debug a deployed service:

1. Ensure Cursor secret **`RAILWAY_TOKEN`** is set (Railway project token).
2. Follow [`.cursor/skills/railway-debug/SKILL.md`](.cursor/skills/railway-debug/SKILL.md).
3. Prefer non-streaming commands, e.g.:

```bash
npx -y @railway/cli@latest logs --service b82e07e5-9532-43f3-b15a-797403b7fc92 -n 200
```

- **dev** service: `b82e07e5-9532-43f3-b15a-797403b7fc92`
- **prod** service: `36f474f5-fc9f-4ab7-866b-61800eb3c318`

Do not redeploy/restart prod unless the user explicitly asks. Never commit or echo the token.
