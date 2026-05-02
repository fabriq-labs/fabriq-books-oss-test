# Worktree and Cloud Agent Setup

This guide documents the workflow for fixing one issue per worktree and the environment setup needed for local and cloud agents.

## Why this exists

- Keep each issue isolated (`one issue -> one branch -> one worktree`).
- Avoid accidental cross-issue changes.
- Make review/approval clean and independent.
- Avoid runtime failures from missing env files in new worktrees.

## Naming convention

Use a short slug with the issue number:

- Worktree: `worktrees/<issue-number>-<short-slug>`
- Branch: `issue-<issue-number>-<short-slug>`

Example:

- Worktree: `worktrees/12-remove-notifications-icon`
- Branch: `issue-12-remove-notifications-icon`

## Local workflow (developer machine)

1. Create a branch + worktree from repo root:

```bash
mkdir -p worktrees
git worktree add -b issue-12-remove-notifications-icon worktrees/12-remove-notifications-icon
```

2. Install dependencies in the new worktree:

```bash
cd worktrees/12-remove-notifications-icon
npm install
cd backend && npm install
cd ../frontend-1 && npm install
cd ..
```

3. Copy backend env into the worktree (recommended over symlink):

```bash
cp ../../backend/.env backend/.env
```

Why copy instead of symlink:

- Predictable behavior for tools/runners.
- No confusion when shell sessions change directories.
- Easy to version-ignore and replace safely.

4. Start both servers from worktree root:

```bash
npm run dev
```

This runs backend and frontend concurrently from the monorepo root script.

## Cloud agent workflow

Cloud agents should not rely on developer-specific secrets in `backend/.env`.
Use the test-safe template:

- Source template: `backend/.env.test.example`
- Agent runtime file: `backend/.env.test` (or copied to `backend/.env` if the process expects `.env`)

Recommended setup:

```bash
cp backend/.env.test.example backend/.env.test
```

If runtime expects `.env` only:

```bash
cp backend/.env.test.example backend/.env
```

Notes:

- `backend/.env.test.example` contains safe defaults/placeholders for cloud sessions.
- Change only values required by your cloud environment (typically `DATABASE_URL`).

## Common failure modes and fixes

- `PrismaClientInitializationError` during login:
  - Ensure the worktree has `backend/.env` (or correct env file loaded).
  - Verify `DATABASE_URL` points to a reachable database.
- `dotenv/config` not found:
  - Run `npm install` in `backend/` inside that worktree.
- `vite: command not found`:
  - Run `npm install` in `frontend-1/` inside that worktree.
- Port already in use (`4000` or `5173`):
  - Stop old dev processes or let frontend use next available port.

## Merge and cleanup checklist

After verification:

1. Commit only issue-specific files.
2. Push issue branch.
3. Open and merge PR in UI.
4. Remove local worktree and local branch.

```bash
git worktree remove worktrees/12-remove-notifications-icon
git branch -d issue-12-remove-notifications-icon
```

## Automation helper

Use `scripts/setup-worktree.sh` to automate setup:

```bash
scripts/setup-worktree.sh <issue-number> <short-slug>
```

Options:

- `--start-dev`: starts `npm run dev` from worktree root after setup
- `--env-source <path>`: defaults to `backend/.env`; for cloud-safe setup use `backend/.env.test.example`

Examples:

```bash
# Local developer setup
scripts/setup-worktree.sh 12 remove-notifications-icon

# Cloud-agent-style setup using safe env template
scripts/setup-worktree.sh 21 cloud-agent-check --env-source backend/.env.test.example
```

