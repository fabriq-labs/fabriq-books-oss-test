# frontend-0

This package is the web shell. It is React and Vite. The dev server listens on port 5174 and proxies `/api` to the API on port 4000, so a local browser can leave `VITE_API_BASE_URL` unset.

Product screens are registered from `src/domain/` (`navigation.ts`, `routes.tsx`, `home.tsx`). A metadata list is the Master component. How the shell fits the engine is [docs/kernel/frontend.md](../docs/kernel/frontend.md).

```bash
npm install
npm run dev
```

The repository overview, the local login, and the Books screens are in the [root README](../README.md) and the [docs hub](../docs/README.md).
