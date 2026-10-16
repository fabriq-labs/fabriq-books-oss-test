# Building a domain on the kernel

This file says where a future domain's files go. It does not document a domain. Behavior of the engine is in [../README.md](../README.md).

The kernel calls these files. Product behavior stays inside them.

| Path | What goes here |
|---|---|
| `backend/prisma/schema/domain.prisma` | Domain models |
| `backend/src/domain/actions.ts` | Post-write hooks and workflow side-effect handlers |
| `backend/src/domain/workflowModels.ts` | Model names that participate in workflow |
| `backend/src/domain/reports.ts` | Report handlers keyed by report id |
| `frontend-0/src/domain/navigation.ts` | Sidebar entries |
| `frontend-0/src/domain/home.tsx` | Home screen rendered at `/` |

The app UI is `frontend-0` (port 5174). `/` mounts `DomainHome` from `home.tsx`. Keep that export if you replace the page. See [../frontend.md](../frontend.md).

## Platform models

`backend/prisma/schema/platform.prisma` is not a place for a product catalog. A model stays there only when both are true:

1. Kernel code reads or writes it when no domain is installed.
2. It is not a catalog of product objects.

| Model | Why it is here | Seed |
|---|---|---|
| `currency` | `org.basecurrency_id` points at it. | One USD row, `curr_kernel_usd`, on `org_system`. |
| `attachment` | Upload and download routes write it. | None. |

Further currencies are more rows on `currency`, not a new model.

## Rules the engine already applies

Follow [../tenancy.md](../tenancy.md) and [../examples.md](../examples.md).

- Put `org_id` on the model. Match the Prisma nullability you intend. Several kernel metadata models still use `String?`. `currency` and `workflow_instance` use a required `String`.
- Shared defaults use `org_system`. A tenant row uses the caller org.
- A Prisma relation has two sides. The existing example is `org.currency` and `currency.orgs`.
- Do not run `prisma db push`. Add the table and its foreign keys through setup, then run `npx prisma generate`.
- The generic API is `/api/{model}/view/{viewId}`, not a bare `/api/{model}`.
