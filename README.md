# Fabriq Workspace

This is a multi-repository workspace that contains multiple git repositories:

- **Root workspace** - Contains shared documentation, scripts, and workspace configuration
- **backend/** - Backend API repository (Node.js/Express, PostgreSQL/Prisma)
- **frontend-1/** - Frontend application repository (React/Vite)

## Getting Started

### For New Developers

1. Clone this repository:
   ```bash
   git clone <repository-url> fabriq
   cd fabriq
   ```

2. Clone the nested repositories:
   ```bash
   # Clone backend repo into backend/ directory
   git clone <backend-repo-url> backend
   
   # Clone frontend repo into frontend-1/ directory
   git clone <frontend-repo-url> frontend-1
   ```

3. Open the workspace in Cursor/VS Code:
   - **Option 1**: Double-click `fabriq.code-workspace`
   - **Option 2**: File → Open Workspace from File... → Select `fabriq.code-workspace`

4. The workspace will automatically recognize all three git repositories in the Source Control view.

### Workspace Benefits

- **Multi-repo support**: All git repositories (root, backend, frontend-1) are visible in Source Control
- **Unified development**: Work across all repositories in a single window
- **Shared settings**: Common IDE settings are shared via `.vscode/settings.json`
- **Documentation**: All project documentation is in the `docs/` folder

## Repository Structure

```
fabriq/
├── fabriq.code-workspace  # Workspace configuration (open this file!)
├── .gitignore             # Root repository gitignore
├── docs/                  # Shared documentation
├── scripts/               # Shared utility scripts
├── backend/              # Backend repository (separate git repo)
└── frontend-1/           # Frontend repository (separate git repo)
```

## Important Notes

- Each repository (`backend/`, `frontend-1/`) manages its own git history
- The root repository tracks workspace configuration and shared documentation
- The nested `.git` folders are ignored by the root repo but remain intact
- Always commit changes to the appropriate repository (root, backend, or frontend-1)

## Development Workflow

1. Make changes in the appropriate repository
2. Commit to that repository's git history
3. The workspace file ensures all repos are visible in Source Control

For more information, see [CLAUDE.md](./CLAUDE.md) and the documentation in `docs/`.
