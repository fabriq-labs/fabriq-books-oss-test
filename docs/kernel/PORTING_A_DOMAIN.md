# Porting a domain onto the kernel

Use this when moving a feature from prod onto the shell. File locations are in [BUILDING_A_DOMAIN.md](./BUILDING_A_DOMAIN.md). This file is the rule for what may live in kernel code. The books module order is [../book-keeping/KERNEL_PORT.md](../book-keeping/KERNEL_PORT.md).

The kernel is one shell for every product. A todo app and the ledger call the same functions. The product fills the bodies. Kernel files never name the product folder.

## The test

Read the prod file and ask: does this behave correctly when the product models are absent?

- Yes. Add it once in the kernel. Import discard is this case. `import_run` is a shell model, and `POST /api/import_run/:id/discard` serves every product that opens the mapper.
- No. The file names product fields, product models, or a vendor. Put the implementation in `backend/lib/<product>/` or `frontend-0/src/domain/<product>/`, and register it from the hooks below.

A kernel file under `backend/src`, or under `frontend-0/src` outside `domain/`, imports `backend/lib/domain.ts` or the frontend domain entry. It does not import `backend/lib/<product>` or `frontend-0/src/domain/<product>`.

## Hooks

Keep these names. Replace the bodies. An unused hook stays an empty function, or `DomainRoutes` returns `null`.

| Hook | Kernel call site | Ledger example |
|---|---|---|
| `registerDomainImportExtensions()` | Backend import startup, and `frontend-0/src/features/import-extensions/init.ts` | Posting import extension |
| `registerDomainExtractors(registry)` | `ExtractorRegistry` constructor | Bank-statement extractor and its document types |
| `registerDomainAgentRoutes(router)` | End of `createAgentRouter`. Paths are under `/api/agent` | Statement categorization |
| `DomainRoutes()` | `App.tsx` inserts the fragment it returns | Account and transaction screens |

`registerDomainBuilders` in `backend/lib/domain.ts` is the same kind of hook for agent builders and report formatters.

Only these files name the product folder:

- `backend/lib/domain.ts`
- `frontend-0/src/domain/register.ts`
- `frontend-0/src/domain/routes.tsx`
- `frontend-0/src/domain/navigation.ts` and `frontend-0/src/domain/home.tsx` for the sidebar and the home page

`App.tsx` calls `DomainRoutes()`. React Router accepts a `Route` or a fragment as a child of `Routes`. A custom component child is rejected.

A seed command may import the product library. `backend/src/utils/setup/seed<Domain>.ts` is a script, run after `setup:kernel`. It is not a request path.

## Porting a prod feature

1. Find the prod handler, screen, and route. Apply the test above before copying any file.
2. For a kernel feature, extend the existing shell module. Register the route next to the other shell routes. Do not leave a handler implemented and unmounted.
3. For a product feature, copy the behavior into `backend/lib/<product>/` or `frontend-0/src/domain/<product>/`. Wire it by filling the hook. Do not add a `require` of that folder from `backend/src/agent/routes.ts`, `ExtractorRegistry`, or `initializeImportExtensions`.
4. Keep the HTTP path the existing UI already calls. Move the handler. The categorization screen still posts to `/api/agent/erp/categorize-transaction-batch`; the route is mounted from `registerDomainAgentRoutes`.
5. Screens go inside `DomainRoutes()`. Sidebar entries go in `navigation.ts`. A metadata list still needs a view, a permission, and a `role_view`. See [adding-a-model.md](./adding-a-model.md).
6. Write a domain seed. Do not load `backend/prisma/metadata/views/` and do not replay a prod view dump. `data_graph` is required.
7. Name columns with kernel norms: `snake_case`, and a foreign key `{relation}_id`. Update the product SQL to match. A shared platform concept uses a neutral name (`ext` for an external connection). The product folder may know the vendor. Kernel files do not.
8. A relation to a module you are not porting yet is a stub in `domain.prisma`: `id`, required `org_id`, and the connecting foreign keys. Leave the rest of that module out.
9. Leave `backend/integrations` and the prod `setup-db.js` on prod. Bring one feature across, through the hooks, when you are ready to port it.

## Worked split

| Prod behavior | Where it lives on the shell |
|---|---|
| Discard an import run from the mapper | Kernel. `RestService.discardImportRun` and `POST /api/import_run/:id/discard` |
| Right-hand AI Category column and the Categorize button | Domain UI. `frontend-0/src/domain/gl/`, registered from `domain/register.ts` |
| Score statement rows against the chart | Domain library. `backend/lib/gl/categorizeImportBatch.ts`, mounted from `registerDomainAgentRoutes` |
| Bank-statement PDF extract | Domain library. `backend/lib/gl/extractors/`, registered from `registerDomainExtractors` |
| Chart of accounts seed | Domain command. `npm run seed:coa` after `setup:kernel` |
