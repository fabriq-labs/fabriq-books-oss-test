-- Align public.invoice_line_item with Prisma schema:
--   item_number String?  (maps to nullable TEXT in Postgres)
-- Safe to run multiple times.

ALTER TABLE public.item_master
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS discount DOUBLE PRECISION;
