-- Add adjustable columns to sales tables
ALTER TABLE public.delivery_challan
ADD COLUMN IF NOT EXISTS "adjustable_label" TEXT DEFAULT 'Adjustable',
ADD COLUMN IF NOT EXISTS "adjustable_value" DOUBLE PRECISION DEFAULT 0.00;

ALTER TABLE public.credit_note
ADD COLUMN IF NOT EXISTS "adjustable_label" TEXT DEFAULT 'Adjustable',
ADD COLUMN IF NOT EXISTS "adjustable_value" DOUBLE PRECISION DEFAULT 0.00;

ALTER TABLE public.sales_order
ADD COLUMN IF NOT EXISTS "adjustable_label" TEXT DEFAULT 'Adjustable',
ADD COLUMN IF NOT EXISTS "adjustable_value" DOUBLE PRECISION DEFAULT 0.00;

ALTER TABLE public.quote
ADD COLUMN IF NOT EXISTS "adjustable_label" TEXT DEFAULT 'Adjustable',
ADD COLUMN IF NOT EXISTS "adjustable_value" DOUBLE PRECISION DEFAULT 0.00;