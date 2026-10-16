# Authentication and authorization

Authentication answers who the caller is. Authorization answers which fields they may read or write. Tenancy answers which org's rows those fields come from. Tenancy is [tenancy.md](./tenancy.md). Field grants are [metadata.md](./metadata.md).

Code: `backend/src/auth/middleware.ts`, `publicPaths.ts`, `platformAdmin.ts`, `adapters/`.

## Public paths

`authMiddleware` returns 401 unless the path is public or the caller authenticates. The public set is exact:

- `/api/auth/login`
- `/api/health`
- `/api/agent/health`

## How a request becomes a user

1. If the request has `x-api-key`, the middleware bcrypt-compares it to `user.api_key` and requires `user.org_id`.
2. Otherwise the adapter selected by `AUTH_PROVIDER` (default `local`) validates the token and returns an external id.
3. The middleware loads `user` where `external_id` matches. Missing user or null `org_id` is 401.
4. `PermissionService.getUserPermissions` loads the role → `role_view` → `permission` chain.
5. `isSuperAdmin` is true when any of the user's roles has a name that contains `super admin`. The context is `{ user, isPlatformAdmin, permissions }`.

The seeded user is `admin@example.com` on `org_kernel`, with role `Super Admin` on `org_system` via `role_user` on `org_kernel`. That user is a platform admin.

`local` signs a JWT with `JWT_SECRET`. `clerk` is the other implemented adapter. `AUTH_PROVIDER` values `auth0` and `cognito` are named in the middleware type and are not the path this shell uses by default.

Logging in does not bypass tenancy. The caller's `org_id` is the scope, including when that org is `org_system`.

## Platform admin

`requirePlatformAdmin` returns 401 with no user and 403 when `isPlatformAdmin` is false.

It guards:

- Workflow definition writes: methods other than GET and HEAD on `/api/workflow/flows` and below
- `/api/agent/admin/*` (templates and model-tool assignment)

The shell hides the same pages behind `SuperAdminGuard` in `frontend-0`. The guard is not the enforcement. The API is.

## What a role grants

A role grants nothing until `role_view` points it at a view and that view has `permission` rows. Details and the merge rule are in [metadata.md](./metadata.md).
