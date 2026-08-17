# NRI personal books (`--demo-data=nri`)

Rajesh Menon — **Canadian tax resident**, **NRI in India**, still an **Indian taxpayer on India-source income only**.

Additive on prod: does not replace `org_indian_demo` / `org_techflow_us`. Safe with `--demo-data-only`.

## Story

Lives in Milton, Ontario (Shopify T4 + Carnatic violin studio + Milton basement suite).  
Keeps a Kochi flat (Panampilly Nagar) rented to Arjun & Meera Nair. Files **ITR-2 as NRI** (rent, NRO interest, Indian CG/dividends). **NRE interest is exempt in India**. Canada salary is not India-source.

Canada books: calendar year 2024–2025 (`JAN_DEC`).  
India books: FY Apr 2024–Mar 2026 (`APR_MAR`).

## IDs

| Item | Value |
|------|--------|
| Org | `org_rajesh` — Maple Leaf NRI Holdings (reporting CAD) |
| Canada entity | `ent_rajesh_canada` — personal, Milton, CAD |
| India entity | `ent_rajesh_india` — personal, Kochi, INR |
| Login | `rajesh.menon@gmail.com` / `admin123` (Super Admin) |
| Login | `kavya.menon@gmail.com` / `admin123` (Finance Team) |
| Banks | TD Canada Trust Chequing · ICICI NRE · ICICI NRO |
| Chequing | `acco_ent_rajesh_canada_1110` |
| ICICI NRE | `acco_ent_rajesh_india_1110` |
| ICICI NRO | `acco_ent_rajesh_india_1120` |

## Load (existing DB, no schema wipe)

```bash
cd backend
node setup-db.js --demo-data-only --demo-data=nri --skip-tests --env=test
```

Or directly:

```bash
cd backend/prisma/setup-NRI
npx ts-node setup-nri-demo.ts
```

## Verify reports

```bash
cd backend/prisma/setup-NRI
npx ts-node verify-nri-reports.ts
```

Filter reports by legal entity. India P&L is India-source (NRI). Canada P&L is T1-style resident income. Org-level CAD reports convert INR via seeded AVERAGE rates.
