# Frontend shell

The kernel UI is `frontend-0`. Dev server port is 5174 (`frontend-0/vite.config.ts`). The API base is the backend on port 4000.

## Home

`/` is the index route inside the authenticated layout in `frontend-0/src/App.tsx`:

```tsx
<Route index element={<DomainHome />} />
```

`DomainHome` is exported from `frontend-0/src/domain/home.tsx`. It shows counts for users, roles, views, permissions, currencies, and workflows, and links to those screens. To replace the home page, replace the component in `home.tsx` and keep the `DomainHome` export. The Dashboard item in the sidebar points at `/`.

## Navigation

`frontend-0/src/components/layout/sidebar/SidebarNavigation.tsx` renders three kernel items, then whatever `frontend-0/src/domain/navigation.ts` exports. That file is an empty list.

Super Admin routes, each wrapped in `SuperAdminGuard`:

| Label | Path |
|---|---|
| Users | `/settings/users` |
| Roles | `/settings/roles` |
| Workflows | `/settings/workflows` |
| Views | `/settings/views` |
| Permissions | `/settings/permissions` |
| AI Templates | `/settings/ai-templates` |
| LLM Traces | `/settings/llm-traces` |
| Currency | `/accounting/currency` |

Workbench is `/workbench`.

## Profile menu

The avatar in `frontend-0/src/components/layout/TopBar.tsx` opens a menu with the user's name, email, and organization, then My Profile, and Logout. My Profile opens `MyProfileModal` (name and password). A chat toggle is rendered when `VITE_ENABLE_AI` is `true`.

## A metadata list

`/master/:category/:model` renders `DomainMaster`, which mounts `Master` with `view={`${model}_view`}`. For currency that is view `currency_view`, so `/master/app/currency` is the same Master page as `/accounting/currency`.

Master loads rows with `GET /api/{model}/view/{viewId}` and searches with `POST /api/{model}/view/{viewId}/search`. Filters on that page are sent as that search body. Column choice comes from the view's `data_graph` when the view has one. See [metadata.md](./metadata.md).

New and row click navigate to `/{model}/view/{viewId}` and `/{model}/{id}/view/{viewId}`. Those routes are not created from the view. `App.tsx` registers them per model. Kernel models with forms are user, role, view, permission, prompt template, and LLM trace. A domain model needs its own form component and those two routes, calling `viewAPI` in `frontend-0/src/api/metadataApi.ts`. The steps are in [adding-a-model.md](./adding-a-model.md).

Sign-in is `/sign-in`. An authenticated user who opens it is sent back into the app.
