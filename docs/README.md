# Kernel

The kernel is the domain-neutral metadata engine in this repo. A screen and an API appear from metadata: a view names a model and its fields, a permission grants read or write on those fields to a role, and the generic REST API and the Master screen render from that metadata.

In scope:

- View-driven CRUD, the data access layer, and tenancy
- Auth and the platform-admin check
- The workflow engine
- The agent runtime: sessions, tools, prompts, pending actions, and supervised mode
- The app shell, `frontend-0`

A future domain's files go in the folders listed in [kernel/BUILDING_A_DOMAIN.md](./kernel/BUILDING_A_DOMAIN.md). This documentation does not describe a domain.

Application tenancy is in the data access layer, auth middleware, workflow engine, and agent runtime. Postgres row-level security is not implemented. Phases 1–4 of the earlier implementation plan are in this tree. Phase 5, row-level security, is not started.

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` on org `org_kernel` |

Do not run `prisma db push` or `prisma migrate`. Setup applies generated schema SQL and seeds `org_system`.

## Kernel

| Document | What it teaches |
|---|---|
| [kernel/metadata.md](./kernel/metadata.md) | How a view, a permission, and a role produce an API and a screen. Request path from HTTP to the data access layer. |
| [kernel/tenancy.md](./kernel/tenancy.md) | Org scope, shareable and private reads, platform-admin writes, and the row-level security sketch to review. |
| [kernel/examples.md](./kernel/examples.md) | Worked steps on tables and routes that exist: model, view, permission, role, workflow, instance. |
| [kernel/workflows.md](./kernel/workflows.md) | States, actions, assignment, history, and who may write a definition. |
| [kernel/auth.md](./kernel/auth.md) | Login, public paths, and the platform-admin check. |
| [kernel/frontend.md](./kernel/frontend.md) | The shell: home, Super Admin navigation, the profile menu, and a metadata list. |
| [kernel/DESIGN_SYSTEM.md](./kernel/DESIGN_SYSTEM.md) | Colors, type, and spacing used by the shell. |
| [kernel/agent/README.md](./kernel/agent/README.md) | Sessions, tools, prompts, pending actions, supervised mode. |
| [kernel/BUILDING_A_DOMAIN.md](./kernel/BUILDING_A_DOMAIN.md) | Where a future domain's files go. |

## Infrastructure

Build, deploy, and host notes. These are not part of the kernel contract.

| Document | What it covers |
|---|---|
| [infrastructure/DEPLOYMENT.md](./infrastructure/DEPLOYMENT.md) | Environment, setup, and deployment |
| [infrastructure/BUILD_AND_DEPLOY.md](./infrastructure/BUILD_AND_DEPLOY.md) | Root Dockerfile, GHCR, and the image workflow |
| [infrastructure/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md](./infrastructure/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md) | Railway image and Vertex credentials |
| [infrastructure/UBUNTU_DOCKER_COMPOSE_SETUP.md](./infrastructure/UBUNTU_DOCKER_COMPOSE_SETUP.md) | Docker Compose on Ubuntu |
| [infrastructure/VM_REMOTE_DEV.md](./infrastructure/VM_REMOTE_DEV.md) | Remote VM development |
| [infrastructure/WORKTREE_CLOUD_AGENT_SETUP.md](./infrastructure/WORKTREE_CLOUD_AGENT_SETUP.md) | Cloud agent worktrees |
| [infrastructure/AGENT_PROMPT_CLOUD_VM.md](./infrastructure/AGENT_PROMPT_CLOUD_VM.md) | Prompt for an agent on the cloud VM |

## Security

Policy PDFs in [security/](./security/): `DATA_POLICY.pdf` and `INFORMATION_SECURITY_POLICY.pdf`.
