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

Review `/tmp/kernel-diff.sql` before applying it. The diff creates the table and the foreign keys implied by `@relation`. Restart the backend after `prisma generate` so the model registry picks up the new model.

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

There is no seeded view for `role_view`, so the generic API cannot insert the link until that view exists. Insert the link the same way the kernel seed does:

```sql
INSERT INTO role_view (id, role_id, view_id, org_id)
VALUES (
  'rovi_note',
  'role_kernel_super_admin',
  '{viewId}',
  'org_system'
);
```

`role_view` is unique on `(role_id, view_id)`. The role form at `/settings/roles` is the screen that attaches views when you are not using SQL.

The list API is then `GET /api/note/view/note_view`. Create is `POST /api/note/view/note_view`. Search is `POST /api/note/view/note_view/search`. The caller org is stamped on create. A private model returns only that org's rows.

`data_graph` keys are field names. List columns are the keys with `displayName` and `isColumnShow`. Relation columns need `type: "table"` plus `select` on the relation, and `tableProps.columnType: "select"` plus `selectProps` on the foreign key. Properties are listed in [metadata.md](./metadata.md).

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

Put the component under `frontend-0/src/domain/` or `frontend-0/src/components/forms/`. Fields you show must be allowed by the view permission. Do not send `id`, `org_id`, `created_at`, `created_by`, `modified_at`, or `modified_by`. The data access layer stamps those.

Relation pickers use `SearchDropDown` (`frontend-0/src/components/search_dropdown/`). `instanceType` is the related model. The related model needs its own `{model}_view` before the dropdown search succeeds.

Workflow detail screens use `/{model}/{id}/state/{stateId}` and `/{model}/state/{stateId}`. Add those routes when the model is in `DOMAIN_WORKFLOW_MODELS`. Starting an instance is described in [workflows.md](./workflows.md): `POST /api/workflow/instances` currently treats `flow_id` as the flow's `model_name`.
