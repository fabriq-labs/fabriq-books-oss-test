-- Idempotent patch for sales document auto-number generation
-- Applies trigger-based numbering for:
-- 1) credit_note.credit_note_number
-- 2) delivery_challan.challan_number
-- 3) quote.quote_number

SET search_path TO public;

-- Ensure sequences exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_sequences
        WHERE schemaname = 'public' AND sequencename = 'credit_note_number_seq'
    ) THEN
        CREATE SEQUENCE public.credit_note_number_seq START WITH 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_sequences
        WHERE schemaname = 'public' AND sequencename = 'challan_number_seq'
    ) THEN
        CREATE SEQUENCE public.challan_number_seq START WITH 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_sequences
        WHERE schemaname = 'public' AND sequencename = 'quote_number_seq'
    ) THEN
        CREATE SEQUENCE public.quote_number_seq START WITH 1;
    END IF;
END $$;

-- credit_note number generator
CREATE OR REPLACE FUNCTION public.generate_credit_note_number() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.credit_note_number IS NULL OR NEW.credit_note_number = '' THEN
        NEW.credit_note_number := 'CN' || LPAD(nextval('credit_note_number_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- delivery challan number generator
CREATE OR REPLACE FUNCTION public.generate_challan_number() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.challan_number IS NULL OR NEW.challan_number = '' THEN
        NEW.challan_number := 'CH' || LPAD(nextval('challan_number_seq')::text, 3, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- quote number generator
CREATE OR REPLACE FUNCTION public.generate_quote_number() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
        NEW.quote_number := 'QN' || nextval('quote_number_seq')::text;
    END IF;
    RETURN NEW;
END;
$$;

-- triggers
DROP TRIGGER IF EXISTS trg_generate_credit_note_number ON public.credit_note;
CREATE TRIGGER trg_generate_credit_note_number
BEFORE INSERT ON public.credit_note
FOR EACH ROW
EXECUTE FUNCTION public.generate_credit_note_number();

DROP TRIGGER IF EXISTS trg_generate_challan_number ON public.delivery_challan;
CREATE TRIGGER trg_generate_challan_number
BEFORE INSERT ON public.delivery_challan
FOR EACH ROW
EXECUTE FUNCTION public.generate_challan_number();

DROP TRIGGER IF EXISTS trg_generate_quote_number ON public.quote;
CREATE TRIGGER trg_generate_quote_number
BEFORE INSERT ON public.quote
FOR EACH ROW
EXECUTE FUNCTION public.generate_quote_number();
