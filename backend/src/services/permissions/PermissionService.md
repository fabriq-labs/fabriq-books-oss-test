# PermissionService

Central service for **field-level** access control. Permissions come from the database: users are linked to roles; roles are linked to views; each view belongs to a model and has a set of per-field `read` / `write` / `none` rules. The service loads and merges that graph, then validates and filters at runtime.

**Source:** `PermissionService.ts`

## Configuration

| Environment variable         | Effect |
|-----------------------------|--------|
| `SKIP_PERMISSION_CHECKS=true` | Bypasses enforcement: `validatePermissions` returns full write for all fields; `checkFieldAccess` / `validateFieldPermissions` allow everything. **Do not use in production** for real security. |

## Permission shape

Consolidated permissions are keyed by **model name** (string), then by **field name** (or `*`), with access `read` | `write` | `none`.

```ts
{ [model: string]: { [field: string]: 'read' | 'write' | 'none' } }
```

### Wildcard (`*`)

- If a view’s permissions include a row with `field_name === '*'` and access `read` or `write`, that view contributes a single `'*'` entry for that model (with that access level) instead of listing every field.
- `write` is strictly more permissive than `read` when merging across multiple role views.
- `validatePermissions` treats `*` as covering the whole model for allowed operations: `read` only allows read operations; `write` allows read and write.

### Merging across roles

For each model, the service walks all `role_views` for all of the user’s roles. If there is **no** wildcard on a view, individual fields are merged by taking the **most permissive** level (`write` over `read` over `none`).

## API — every method

### 1. `getView(viewName, modelName)`

**What it does:** Fetches a single `view` record and its `permissions` rows from the database. Callers use this for **view metadata** (e.g. which view applies to a model, field lists on that view), not the merged in-memory `AuthContext.permissions` map.

**Parameters**

- `modelName` — `view.model_name` in the database.
- `viewName` — can be a concrete view name or `null` to get the “default” first match; also controls the special `workflow` exclusion.

**How the query is built**

- Always: `where.model_name = modelName`.
- If `viewName !== 'workflow'`, the where clause also has `NOT: { name: 'workflow' }`. So **unless** the caller is explicitly asking for the workflow view by passing `viewName === 'workflow'`, rows whose `name` is `workflow` are excluded. That applies both when `viewName` is `null` and when it is any other string (e.g. `"default"`).
- If `viewName` is not `null`, add `where.name = viewName`.

**Return value:** `findFirst` result: one `view` with nested `permissions`, or `null` if nothing matches.

**Used by:** upload, workflow engine, `ModelService`, `RelationshipResolverService`, REST, agent routes.

---

### 2. `getRoles(userId)`

**What it does:** Returns every `role` entity linked to the user, without loading views or field permissions.

**How it works:** `role_user` filtered by `user_id`, with `include: { role: true }`, then map each row to `ur.role`.

**Return value:** `role[]` in query order; not deduplicated by `role` id in code (repeated assignments would show repeated roles).

**Used by:** workflow engine and router.

---

### 3. `getUserPermissions(userId)`

**What it does:** This is the method that **materializes** the `AuthContext.permissions` object: for each model name, a map of `field` → `read` | `write` | `none`, plus optional `'*'` for wildcard.

**How data is loaded:** Deep include from `role_user` → `role` → `role_views` → `view` (each view has `model_name`) → `view.permissions` (rows with `field_name`, `access`).

**Per `role_view` / view**

- Ensure `permissions[view.model_name]` exists.
- If **any** permission on that view has `field_name === '*'` and `access` in `('read', 'write')`, then only the wildcard path runs: it sets `permissions[model_name]['*']` from the `find` of that `*` row. Per-field entries from that same view are **not** added in the `else` branch (entirely wildcard vs. entirely per-field for that view).
- If not wildcard for that view, for each field row, merge into the model map: if there is no `currentAccess` **or** `newAccess === 'write'`, set the field to `newAccess` (so `write` wins over a prior `read` for the same field from another view).

**Return value:** The merged `{ [model]: { [field]: 'read'|'write'|'none' } }`. Note: if several views set `*` for the same model, later loop iterations can overwrite `['*']` depending on order; per-field keys merge with the `write` preference rule.

**Used by:** auth middleware, Slack auth, `FunctionGenerator`, agent tests.

---

### 4. `validatePermissions(context, modelName, operation)`

**What it does:** **Coarse** authorization: “may this user touch this model at all for this operation?” On success, returns the **per-model** permission sub-object to pass into `filterFieldsByPermission` / `validateFieldPermissions`.

**When `SKIP_PERMISSION_CHECKS` is true:** Always returns `{ '*': 'write' }` and never reads `context`.

**Errors (when checks are on)**

- No `context.permissions` → `Unauthorized: No permissions found`.
- No `context.permissions[modelName]` → `Unauthorized: No permissions for model {modelName}`.

**If `modelPermissions['*']` is set (wildcard merge result)**

- `wildcardAccess === 'write'` → return `modelPermissions` (allowed for any `operation` in the branch sense).
- `wildcardAccess === 'read' && operation === 'read'` → return `modelPermissions`.
- `read` wildcard and `operation === 'write'` → do **not** return here; continues to the `values().some` check.
- `read` wildcard and `operation === undefined` → same: continues to `some` (so read-only `*` does not satisfy the wildcard shortcut).

**If wildcard did not authorize**

- `hasPermission =` some `access` in `Object.values(modelPermissions)` such that `access === operation` **or** `access === 'write'`.
- For `operation === 'read'`: allowed if at least one `read` or any `write`.
- For `operation === 'write'`: allowed if at least one `write` (a lone `read` is not enough).
- For `operation === undefined`: `access === operation` is false for all; you need at least one `write` in the model map to pass. That can reject read-only users in callers that use `operation === undefined` to fetch a field map (e.g. some REST helpers).

**Return value on success:** The `modelPermissions` object for that `modelName`.

**Used by:** `DataAccessLayer`, `ModelService`, `SchemaBuilder`, `RestService`.

---

### 5. `filterFieldsByPermission(data, permissions)`

**What it does:** **Redacts** an object to fields the user may use, using **one model’s** field map (not the full `AuthContext.permissions` top level).

**Step by step**

1. If `permissions` is falsy → return `data` unchanged.
2. If `permissions['*']` is `read` or `write` → return `data` unchanged (all keys pass).
3. If `data` is `{}` (no keys) → for each `field` in `Object.keys(permissions)` with `read` or `write`, set `result[field] = true` (a mask of allowed names, not a real row). Wildcard key `'*'` in the map, if present, is processed like a normal key in this empty-data branch.
4. Else → for each key in `data`, if `permissions[field]` is `read` or `write`, copy the value; missing or `none` (or not `read`/`write`) **drops** the key.

**`SKIP_PERMISSION_CHECKS`:** Not consulted here. Callers that disabled checks usually still pass a permissive `permissions` object (e.g. from `validatePermissions` when skip is on: `{ '*': 'write' }`).

**Used by:** `DataAccessLayer` and related read/write paths.

---

### 6. `checkFieldAccess(field, permission)`

**What it does:** Given a **single** access string for one logical field, returns whether that access allows use (`read` or `write`).

**Parameters:** `field` is not used in the function body; it exists for call-site documentation and to mirror `validateFieldPermissions`’ field loops.

**Rules:** If `SKIP_PERMISSION_CHECKS` → `true`. Else return `permission === 'read' || permission === 'write'`.

**Used by:** `validateFieldPermissions` internally; reusable elsewhere for one-off checks.

---

### 7. `validateFieldPermissions(requestedFields, permissions)`

**What it does:** Ensures every name in `requestedFields` (e.g. a `select` list) is **explicitly** allowed in `permissions` (same single-model map as in `filterFieldsByPermission`).

**When `SKIP_PERMISSION_CHECKS`:** Returns immediately; no field names are validated.

**When `permissions['*']` is `read` or `write`:** Returns; all requested fields are considered allowed.

**Otherwise:** For each string in `requestedFields`, if `!checkFieldAccess(field, permissions[field])`, the field is collected as unauthorized. If the list is non-empty, throws `Error` with `Unauthorized: No access to fields: a, b, ...`. Missing `permissions[field]` (undefined) fails the check.

**Return value:** `void` (success).

**Used by:** `DataAccessLayer`, `SchemaBuilder`, `ModelService`.

## Typical flow

1. On authentication, `getUserPermissions(userId)` populates `AuthContext.permissions`.
2. For an operation on a model, `validatePermissions` ensures the user may perform that operation.
3. For field lists (select, update, GraphQL, etc.), `validateFieldPermissions` and `filterFieldsByPermission` enforce and strip fields.

## Tests

Behavior is covered in `backend/src/__tests__/permissions/PermissionService.test.ts`.
