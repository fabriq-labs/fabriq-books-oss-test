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

`data_graph` is a required JSON object on `view`. The column is `NOT NULL`. A create that omits it fails. Keys are field names. `ModelService.getSelectFromView` turns the object into the Prisma `select` that `DataAccessLayer.search` passes to `findMany`. `LegacyDataGraphParser` does that conversion: a key with `type: "table"` and `select` becomes a nested select; every other key is selected as a scalar (`true`). A relation key that is missing `type: "table"` is selected as `true`, and Prisma rejects the query.

The search response `metaData` is that same `data_graph`. Master does not invent columns from the row. `generateColumns` skips a key with no `displayName`. A normal column is shown only when `isColumnShow` is `true`. A `listProps` badge is shown when `isColumnShow` is not `false`. Create and edit forms are not generated from the graph. See [adding-a-model.md](./adding-a-model.md).

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

`backend/src/utils/setup/seedKernel.ts` writes a `data_graph` for each shell view. Those graphs were copied from the matching files in `backend/prisma/metadata/views/` (the catalog `setup-db.js` on the books branch loads). Fields that are not on the kernel models were left out. `setup:kernel` does not load that folder. Most of those JSON files name models that are not in this schema. Do not sync the whole catalog into this database.

Routes are registered once, when the process starts, by parsing `backend/prisma/schema/`. After a model is added, restart the backend. Until then `GET /api/models` can list the model while `/api/{model}/view/...` returns 404.

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
