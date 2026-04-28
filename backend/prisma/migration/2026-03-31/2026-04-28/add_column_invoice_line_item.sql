-- Align public.invoice_line_item with Prisma schema:
--   item_number String?  (maps to nullable TEXT in Postgres)
-- Safe to run multiple times.

ALTER TABLE public.invoice_line_item
  ADD COLUMN IF NOT EXISTS discount_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION;
