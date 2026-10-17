# Metadata engine

A Prisma model does not grow a custom CRUD route. The model registry reads the Prisma schema and registers one set of routes per model. A view names the model. Permissions grant read or write on fields. The generic REST API and the Master screen both use that view.

Code:

- Routes: `backend/src/rest/routes.ts`, mounted at `/api` from `backend/src/index.ts`
- Handlers: `backend/src/rest/RestService.ts`
- Writes and reads: `backend/src/services/dal/DataAccessLayer.ts`
- Org predicate: `backend/src/tenancy/orgScope.ts`
- Field grants: `backend/src/services/permissions/PermissionService.ts`

## Views, permissions, roles

A **view** is one lens on one model. `view.model_name` is the Prisma model. `view.name` is the name the UI passes, such as `currency_view`. `view.data_graph` is required JSON. It selects fields and relations and tells the Master list which columns to show.

A **permission** row belongs to one view. `field_name` plus `access` (`read`, `write`, or `none`). `field_name` `*` is a wildcard. The kernel seed writes one `*` permission with `access` `write` on each seeded view.

A **role** does not grant a model by itself. `role_view` links a role to a view. `role_user` links a user to a role. A user may hold several roles. Permissions merge per model and field, and the highest access wins: `write` over `read` over `none`.

`role.name` is globally unique. See [tenancy.md](./tenancy.md).

`data_graph` is a JSON object on `view`. Keys are field names. The backend turns it into the Prisma `select` (`LegacyDataGraphParser`: a key with `type: "table"` and `select` becomes a relation select; every other key is a scalar). The same object comes back as `metaData` and drives Master columns. Create and edit forms are not generated from it. See [adding-a-model.md](./adding-a-model.md).

| Property | Use |
|---|---|
| `displayName` | Column header and form label. Master builds a column from keys that have it. |
| `permission` | `read` or `update`. Field grants still come from `permission` rows. |
| `required` | Form validation hint. |
| `isColumnShow` | `true` shows the column. |
| `orderNo` | Column order. Lower first. |
| `datatype` or `dataType` | `string`, `boolean`, `int`, `date`, `datetime`. Relations use `table`. |
| `tableProps.columnType` | List cell: `text`, `select`, `date`, `checkbox`. |
| `tableProps.selectProps` | Dropdown: `instanceType` (model to search), `instanceKey` (usually `id`), `instanceLabel` (label field), `instanceSourceKey` (the foreign key on this model). Set `relationName` when the Prisma relation name is not the foreign key with `_id` removed. |
| `searchProps` | `{ isSearch: true, operation: "contains" }` marks a search field. |
| `listProps` | `{ type: "badge" }` renders the cell as a badge. |

A relation the API should return:

```json
"assignee": { "type": "table", "select": { "id": "read", "name": "read" }, "isColumnShow": false }
```

`select` values are `read` or `update`. Both become `true` in the Prisma select.

`seedKernel.ts` writes a `data_graph` for each shell view. Columns appear for keys that have `displayName` and `isColumnShow`.

## Request path

```
HTTP /api/{model}/view/{viewId}
  → authMiddleware
  → RestService (getAll, getById, create, update, delete, search)
  → PermissionService for that user and view
  → DataAccessLayer
  → org scope merged into the Prisma where
  → Prisma
```

Public paths skip `authMiddleware`: `/api/auth/login`, `/api/health`, `/api/agent/health`. Every other `/api` route needs a user with an `org_id`. See [auth.md](./auth.md).

After auth, the handler loads the view, checks the caller's permissions for `model_name`, and calls the data access layer with the auth context. On create, the layer stamps `created_by`, `modified_by`, and `org_id` from the caller (`applyOrgOnWrite`). On read, `readOrgScope` adds the shareable or private predicate from [tenancy.md](./tenancy.md). A write that does not match the caller's scope returns not found.

Routes registered per model in `setupRestRoutes`:

| Method | Path | Action |
|---|---|---|
| GET | `/api/{model}/view/{viewId}` | List |
| POST | `/api/{model}/view/{viewId}` | Create |
| GET | `/api/{model}/{id}/view/{viewId}` | Read one |
| PUT | `/api/{model}/{id}/view/{viewId}` | Update |
| DELETE | `/api/{model}/{id}/view/{viewId}` | Delete |
| POST | `/api/{model}/view/{viewId}/search` | Search |
| PUT | `/api/{model}/view/{viewId}` | Update many |
| DELETE | `/api/{model}/view/{viewId}` | Delete many |

There is no `/api/{model}` route without a view. Search is POST on the view path. The same handlers exist with `state/{stateId}` instead of `view/{viewId}` for workflow screens.

The list screen for a model that follows the `{model}_view` name is `/master/{category}/{model}` in `frontend-0`. `DomainMaster` passes `view={`${model}_view`}`. The seeded view of the `view` model itself is named `view`, not `view_view`, and its screen is `/settings/views`. See [frontend.md](./frontend.md) and [examples.md](./examples.md).
