# Domain UI

Add sidebar entries in `navigation.ts`. Record screens use the kernel Master page (`/master/:category/:model`) once a view exists for the model.

`register.ts` registers import extensions. `routes.tsx` exports `DomainRoutes` for `App.tsx`. Keep those file names. Put product screens in a subfolder and name that subfolder only from these two files.

See `docs/kernel/BUILDING_A_DOMAIN.md`.
