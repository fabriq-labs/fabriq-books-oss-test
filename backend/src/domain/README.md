# Domain

Product behavior lives in `backend/lib/<product>/`. `backend/lib/domain.ts` is the only file under `backend/lib` that the kernel imports. The files here re-export that module. A kernel file does not import the product folder.

Models live in `backend/prisma/schema/domain.prisma`.

See `docs/kernel/BUILDING_A_DOMAIN.md`.
