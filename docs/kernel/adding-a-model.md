# Adding a model

A Prisma model does not grow a custom CRUD route. After the table exists, a view, a permission, and a `role_view` row produce the API. The Master list reads that view. Create and edit screens are form components and routes you add in `frontend-0`. They call the same view API.

Follow [tenancy.md](./tenancy.md) and [examples.md](./examples.md). Put product models in `backend/prisma/schema/domain.prisma` and registrations in `backend/lib/domain.ts`. See [BUILDING_A_DOMAIN.md](./BUILDING_A_DOMAIN.md).

Do not run `prisma db push` or `prisma migrate`.

## 1. Model

Every model has `org_id`. Use a required `String` unless you are matching an older kernel column that is still `String?`. Audit fields are `created_at`, `modified_at`, `created_by`, `modified_by`. Ids use a prefixed `dbgenerated` default.

A Prisma relation has two sides. A relation to `user` needs the matching field on `user` in `backend/prisma/schema/metadata.prisma`.

```prisma
model note {
  id          String   @id @default(dbgenerated("'note_' || gen_random_uuid()"))
  title       String
  done        Boolean  @default(false)
  org_id      String
  created_by  String?
  modified_by String?
  created_at  DateTime @default(now())
  modified_at DateTime @updatedAt
  assignee_id String?
  assignee    user?    @relation("NoteAssignee", fields: [assignee_id], references: [id])

  @@index([org_id])
  @@map("note")
}
```

On `user`:

```prisma
notes note[] @relation("NoteAssignee")
```

If the model should start a workflow when a row is created, add its name to `DOMAIN_WORKFLOW_MODELS` in `backend/lib/domain.ts` after the flow exists. See [workflows.md](./workflows.md).

## 2. Table

`npm run setup:kernel` creates the database and applies the full schema only when `public.organizations` is missing. When that table already exists, the script leaves the schema in place and only re-runs the seed.

Apply the new table with a SQL diff. From `backend/`, with `DATABASE_URL` set:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema \
  --script > /tmp/kernel-diff.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/kernel-diff.sql
npx prisma generate
```

Review `/tmp/kernel-diff.sql` before applying it. The diff creates the new table and the foreign keys implied by `@relation`. It also emits `ALTER TABLE ... ALTER COLUMN id SET DEFAULT` for kernel models whose ids are `dbgenerated`. Those statements repeat the existing defaults. A nullability change, such as `view.data_graph SET NOT NULL`, fails while any row is still null. Fill those rows first, then apply that statement. Apply the file with `ON_ERROR_STOP`. A failure partway through still leaves earlier statements committed, so read the psql error before running the file again.

`npx prisma validate` should pass before the diff. Restart the backend process after `prisma generate`. Routes are registered once at startup from the schema files. A process that was already running keeps the old Prisma client, and `/api/{model}/view/...` stays 404 even when `GET /api/models` already lists the new model.

A brand-new database still uses `npm run setup:kernel`, which runs this diff from an empty schema and then seeds `org_system`.

## 3. View, permission, and role

The view name the generic list expects is `{model}_view`. For the model above that is `note_view`.

As `admin@example.com` (platform admin on org `org_kernel`):

`POST /api/view/view/view`

```json
{
  "name": "note_view",
  "model_name": "note",
  "org_id": "org_system",
  "description": "Notes",
  "data_graph": {
    "title": {
      "displayName": "Title",
      "datatype": "string",
      "permission": "update",
      "required": true,
      "isColumnShow": true,
      "orderNo": 1
    },
    "done": {
      "displayName": "Done",
      "datatype": "boolean",
      "permission": "update",
      "isColumnShow": true,
      "orderNo": 2,
      "tableProps": { "columnType": "checkbox" }
    }
  }
}
```

A platform admin may set `org_id` to `org_system` on a shareable model. The view screen is `/settings/views`.

`POST /api/permission/view/permission_view`

```json
{
  "view_id": "{viewId returned above}",
  "field_name": "*",
  "access": "write",
  "org_id": "org_system"
}
```

`permission` is unique on `(view_id, field_name)`. `access` is `read`, `write`, or `none`.

`data_graph` is required. Include every column you want on the list (`displayName` and `isColumnShow: true`) and every relation the row should return (`type: "table"` plus `select`). Copy the shape in `seedKernel.ts`. A domain seed already in this tree is `backend/src/utils/setup/seedTodo.ts`.

Write the view, permission, and `role_view` from an idempotent script. `POST /api/view/view/view` works for a one-off, and calling it twice inserts a second view: `view.name` is not unique. The script should `findFirst` on `name`, `model_name`, and `org_id`, then update `data_graph` in place.

Run it from `backend/` so Prisma sees `DATABASE_URL`:

```bash
npx ts-node --transpile-only -r dotenv/config src/utils/setup/seedNote.ts
```

The view named `role_view` is the role list (`model_name` `role`). The join table `role_view` has no view of its own, so there is no `/api/role_view/view/...` route. The script writes the link with Prisma, the same way `seedKernel.ts` does:

```ts
await prisma.role_view.upsert({
  where: { id: 'rovi_note' },
  update: { role_id: 'role_kernel_super_admin', view_id: viewId, org_id: 'org_system' },
  create: {
    id: 'rovi_note',
    role_id: 'role_kernel_super_admin',
    view_id: viewId,
    org_id: 'org_system',
  },
});
```

`role_view` is unique on `(role_id, view_id)`. The role form at `/settings/roles` is the screen that attaches views when you are not using SQL.

The list API is then `GET /api/note/view/note_view`. Create is `POST /api/note/view/note_view`. Search is `POST /api/note/view/note_view/search`. Login for a manual check is `POST /api/auth/login` with `admin@example.com` / `admin123`. The response is `{ user, token }`. Send `Authorization: Bearer` on the next call.

The caller org is stamped on create. Omit `org_id` from the body. A platform admin who sends `org_system` stores the row on the system org, and the tenant list will not show it. A private model returns only the caller org's rows. `org_id` is absent from the JSON unless `data_graph` selects it. The column is still set; read it from the table if you need to confirm.

`data_graph` keys are field names on the Prisma model. A key that is not a field makes the select fail. List columns are the keys with `displayName` and `isColumnShow: true`. A relation the API should load uses `type: "table"` and `select`. Put the visible dropdown on the foreign-key key, and keep the relation key if the cell should show the related label:

```json
"assignee": { "type": "table", "select": { "id": "read", "name": "read" }, "isColumnShow": false },
"assignee_id": {
  "displayName": "Assignee",
  "datatype": "string",
  "isColumnShow": true,
  "tableProps": {
    "columnType": "select",
    "selectProps": {
      "instanceType": "user",
      "instanceKey": "id",
      "instanceLabel": "name",
      "instanceSourceKey": "assignee_id"
    }
  }
}
```

`instanceType` is searched through the view `{instanceType}_view`. `user_view` already exists. A parent model you add, such as a list that a child points at, needs its view seeded before the dropdown or the list cell can show a name. Properties are listed in [metadata.md](./metadata.md).

## 4. List

`/master/app/note` renders `DomainMaster`, which mounts Master with `view="note_view"`. Add a sidebar entry in `frontend-0/src/domain/navigation.ts`:

```ts
{
  label: 'Notes',
  items: [{ label: 'Notes', path: '/master/app/note' }],
}
```

Master loads rows with `viewAPI.getAll` and `viewAPI.search` from `frontend-0/src/api/metadataApi.ts`. Columns come from `data_graph`. The New and row actions navigate to `/{model}/view/{viewId}` and `/{model}/{id}/view/{viewId}`.

## 5. Form

Those two URLs are not generated from the view. `frontend-0/src/App.tsx` has form routes for kernel models only (user, role, view, permission, prompt template, LLM trace). A new model 404s until you add routes and a component.

```tsx
<Route path="note/:id/view/:viewId" element={<NoteForm />} />
<Route path="note/view/:viewId" element={<NoteForm />} />
```

The form reads and writes through `viewAPI`:

```tsx
const { id, viewId } = useParams();

useEffect(() => {
  if (id && viewId) {
    viewAPI.getById("note", id, viewId).then((res) => setInitialValues(res.data));
  }
}, [id, viewId]);

const onSubmit = async (data) => {
  if (id) await viewAPI.update("note", id, viewId, data);
  else await viewAPI.create("note", viewId, data);
};
```

Register both routes. Master sends the view **name** (`note_view`), not the view id. Put the component under `frontend-0/src/domain/` or `frontend-0/src/components/forms/`. `viewAPI` returns `{ success, data, metaData }`. Read `res.data`.

Do not send `id`, `org_id`, `created_at`, `created_by`, `modified_at`, or `modified_by`. The data access layer stamps those. Optional strings, dates, and foreign keys must be `null` when empty. `""` fails Prisma validation on `DateTime?` and on an optional relation id. A date input value `2026-10-17` is sent as `2026-10-17T00:00:00.000Z`. A checkbox `onCheckedChange` must store a boolean. The indeterminate state is not a boolean.

`SearchDropDown` (`frontend-0/src/components/search_dropdown/dropdown.tsx`) calls `onSelectItem(instanceSourceKey, instanceKey, record)`. The id is `record[instanceKey]`. Pass `instanceValue` as the related object from `getById` (`row.assignee`), not the raw id, or the closed dropdown shows a blank instead of the name. Pass `placeholder` when the default `Select a {model}` text is too terse. The related model needs its `{model}_view` before the search returns rows.

```tsx
<SearchDropDown
  instanceType="user"
  instanceSourceKey="assignee_id"
  instanceKey="id"
  instanceLabel="name"
  searchParams="name"
  placeholder="Select a user"
  instanceValue={assignee}
  onSelectItem={(_source, key, record) => form.setValue("assignee_id", record?.[key] || "")}
  onClear={() => form.setValue("assignee_id", "")}
/>
```

After a successful save, navigate to `/master/app/note`.

## Checklist

- `npx prisma validate` passes, and both sides of every new relation are in the schema.
- `/tmp/kernel-diff.sql` has been read and applied. The new table is in the database.
- The backend was restarted after `prisma generate`.
- The seed script is idempotent and has been run. `GET /api/note/view/note_view` returns 200 for `admin@example.com`.
- `POST` without `org_id` stores `org_kernel` for that user.
- `/master/app/note` shows the `data_graph` columns, including relation labels.
- `/note/view/note_view` creates a row and `/note/{id}/view/note_view` loads it.

Workflow detail screens use `/{model}/{id}/state/{stateId}` and `/{model}/state/{stateId}`. Add those routes when the model is in `DOMAIN_WORKFLOW_MODELS`. Starting an instance is described in [workflows.md](./workflows.md): `POST /api/workflow/instances` currently treats `flow_id` as the flow's `model_name`.
