# Building a domain on the kernel

Give this file, plus [README.md](./README.md), to an agent that is adding a new application on the shell branch. The books product is not in this tree. Domain code belongs only in the folders below.

## Folders

| Path | What goes here |
|---|---|
| `backend/prisma/schema/domain.prisma` | Domain models |
| `backend/src/domain/actions.ts` | Post-write hooks and workflow side-effect handlers |
| `backend/src/domain/workflowModels.ts` | Model names that participate in workflow |
| `backend/src/domain/reports.ts` | Report handlers keyed by report id |
| `frontend-1/src/domain/navigation.ts` | Sidebar entries |
| `frontend-1/src/domain/home.tsx` | Home screen rendered at `/` |

The kernel calls these files. It does not contain product behavior.

## Platform models

`backend/prisma/schema/platform.prisma` is not a place for domain reference data. A model stays there only when both are true:

1. Kernel code reads or writes it when no domain is installed.
2. It is not a catalog of product objects.

Shared rows live on `org_system`, and the kernel seed inserts only the rows the engine needs.

| Model | In the kernel | Seed |
|---|---|---|
| `currency` | Yes. `org.basecurrency_id` points at it. | One USD row, `curr_kernel_usd`, owned by `org_system`. Both seeded orgs point at it. |
| `attachment` | Yes. The upload and download routes write it. | None. A row is a file a tenant uploaded. |

A domain that needs more currencies inserts more `currency` rows. It does not add a new model. A product catalog (accounts, tax codes, units) goes in `domain.prisma` and in that domain's own seed.

## Rules that already apply

- Every model has `org_id`. Use a required `String` once the tenancy migration has run. Until then, `String?` matches the current kernel models.
- Shared defaults use org id `org_system`, seeded by setup. A tenant row uses the caller's org.
- Audit fields on every model: `created_at`, `modified_at`, `created_by`, `modified_by`.
- Ids use a prefixed `dbgenerated` default, for example `'todo_' || gen_random_uuid()`.
- A Prisma relation has two sides. Adding `assignee user? @relation(...)` on a domain model requires the matching array on `user` in `metadata.prisma`.
- Do not run `prisma db push`. Add the table and its foreign keys to the setup script, then run `npx prisma generate`.

## Walkthrough: a todo list

1. Add the model to `backend/prisma/schema/domain.prisma`.

```prisma
model todo {
  id          String   @id @default(dbgenerated("'todo_' || gen_random_uuid()"))
  title       String
  notes       String?
  done        Boolean  @default(false)
  org_id      String
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  assignee_id String?
  assignee    user?    @relation("TodoAssignee", fields: [assignee_id], references: [id])

  @@index([org_id, done])
  @@map("todo")
}
```

2. Add the other side on `user` in `backend/prisma/schema/metadata.prisma`:

```prisma
todos todo[] @relation("TodoAssignee")
```

3. Generate the client: `cd backend && npx prisma generate`.

4. Add the table and the assignee foreign key in the setup script. The script also inserts `org_system` if it is missing.

5. Insert a `view` row for model `todo` and `permission` rows for the fields the role may read or write. The generic REST API is `GET/POST /api/todo` and `POST /api/todo/search`. The list screen is `/master/app/todo`, which renders the kernel Master page for view `todo_view`.

6. Optional workflow. Append `'todo'` in `backend/src/domain/workflowModels.ts`. Create a `workflow_flow` whose `model_name` is `todo`. A system-wide default uses `org_id = 'org_system'`. A tenant-only flow uses that tenant's org.

7. Optional side effect. Register a handler in `workflowActionMap` inside `backend/src/domain/actions.ts`. The workflow action's `side_effects` JSON names that handler.

8. Optional nav item in `frontend-1/src/domain/navigation.ts`.

## Home screen

`/` is the default page after login. `frontend-1/src/App.tsx` mounts it as the index route inside the app layout:

```tsx
<Route index element={<DomainHome />} />
```

`DomainHome` is exported from `frontend-1/src/domain/home.tsx`. The kernel ships a dashboard there: counts of users, roles, views, permissions, currencies, and workflows.

To make another page the home screen, replace the component in `domain/home.tsx`. Keep the `DomainHome` export. The index route stays pointed at that export, so `App.tsx` does not need a change. Add a sidebar link in `domain/navigation.ts` if the page should also appear in the nav. The kernel Dashboard link points at `/`.

9. Run `cd backend && npx tsc --noEmit --pretty false` and the kernel tests once they exist (`npm test -- --testPathPattern=kernel`).

## What the kernel already does

Creating a `todo` row through `POST /api/todo` checks the view permissions, stamps `org_id` from the caller, and runs `execute_Action` from `domain/actions.ts` when a hook is registered for that model. No books module is involved.
