# Domain UI

Add sidebar entries in `navigation.ts`. Product screens go in `domain/<product>/` and are mounted from `routes.tsx`. Product import extensions are registered from `register.ts`. `App.tsx` renders `DomainRoutes` and does not import the product folder. Record screens use the kernel Master page (`/master/:category/:model`) once a view exists for the model.

See `docs/kernel/BUILDING_A_DOMAIN.md`.
