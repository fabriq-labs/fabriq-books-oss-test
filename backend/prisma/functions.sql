--
-- PostgreSQL database functions and triggers
-- This file contains only function and trigger definitions
-- Tables, schemas, types, and other objects are managed by Prisma
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- Must include public: empty search_path breaks ALTER TABLE "table_name" (does not resolve to public.*).
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- SEQUENCES
-- These sequences are used by the functions to generate sequential numbers
--

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'challan_number_seq') THEN
        CREATE SEQUENCE public.challan_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'coa_code_seq') THEN
        CREATE SEQUENCE public.coa_code_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'credit_note_number_seq') THEN
        CREATE SEQUENCE public.credit_note_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'gl_number_seq') THEN
        CREATE SEQUENCE public.gl_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'invoice_number_seq') THEN
        CREATE SEQUENCE public.invoice_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'item_code_seq') THEN
        CREATE SEQUENCE public.item_code_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'payment_receipt_seq') THEN
        CREATE SEQUENCE public.payment_receipt_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'po_number_seq') THEN
        CREATE SEQUENCE public.po_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'pr_number_seq') THEN
        CREATE SEQUENCE public.pr_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'quote_number_seq') THEN
        CREATE SEQUENCE public.quote_number_seq START WITH 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'so_number_seq') THEN
        CREATE SEQUENCE public.so_number_seq START WITH 1;
    END IF;
END $$;

--
-- PUBLIC SCHEMA FUNCTIONS
--

--
-- Name: generate_challan_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_challan_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN 'CH' || LPAD(nextval('challan_number_seq')::text, 3, '0');
END;
$$;


--
-- Name: generate_credit_note_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_credit_note_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN 'CN' || LPAD(nextval('credit_note_number_seq')::text, 4, '0');
END;
$$;


--
-- Name: generate_gl_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_gl_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only set if NULL or empty
    IF NEW.gl_number IS NULL OR NEW.gl_number = '' THEN
        NEW.gl_number := 'GL' || LPAD(nextval('gl_number_seq')::text, 3, '0')::varchar;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV' || LPAD(nextval('invoice_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_item_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_item_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.item_code IS NULL THEN
        NEW.item_code := 'ITM' || nextval('item_code_seq');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_item_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_item_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_number INTEGER;
BEGIN
    -- Only generate item_number if it's not already set or is invalid
    IF NEW.item_number IS NULL OR NEW.item_number = '' OR NEW.item_number !~ '^[0-9]+$' THEN
        -- Get the next sequential number for this purchase requisition
        SELECT COALESCE(
            (SELECT MAX(CAST(item_number AS INTEGER))
             FROM item 
             WHERE instance_id = NEW.instance_id 
             AND item_number IS NOT NULL 
             AND item_number != ''
             AND item_number ~ '^[0-9]+$'), 
            0
        ) + 1
        INTO next_number;
        
        -- Set the item_number to the next number
        NEW.item_number := next_number::TEXT;
    END IF;
    
    RETURN NEW;
END;
$_$;


--
-- Name: generate_payment_receipt_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_payment_receipt_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
        NEW.receipt_number := CONCAT('PAYR', nextval('payment_receipt_seq'));
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_po_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_po_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.po_number IS NULL THEN
    NEW.po_number := 'PO' || LPAD(nextval('po_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_pr_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_pr_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.pr_number IS NULL THEN
    NEW.pr_number := 'PR' || LPAD(nextval('pr_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_prefixed_uuid(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_prefixed_uuid(prefix text) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN prefix || uuid_generate_v4();
END;
$$;


--
-- Name: generate_purchase_order_item_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_purchase_order_item_no() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id INTEGER;
    formatted_id VARCHAR(10);
BEGIN
    -- Get the next sequence number
    SELECT COALESCE(MAX(SUBSTRING(purchase_order_item_no, 4)::INTEGER), 0) + 1 INTO next_id
    FROM purchase_order_item;
    
    -- Format the ID with leading zeros (POI0001, POI0002, etc.)
    formatted_id := 'POI' || LPAD(next_id::TEXT, 4, '0');
    
    -- Set the new ID
    NEW.purchase_order_item_no := formatted_id;
    
    RETURN NEW;
END;
$$;


--
-- Name: generate_quote_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_quote_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN 'QN' || nextval('quote_number_seq')::text;
END;
$$;


--
-- Name: generate_so_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_so_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        IF NEW.so_number IS NULL OR NEW.so_number = '' THEN
            NEW.so_number := 'SO' || nextval('public.so_number_seq');
        END IF;
        RETURN NEW;
    END;
    $$;


--
-- Name: generate_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.id := 'user_' || uuid_generate_v4();
    RETURN NEW;
END;
$$;


--
-- Name: generate_usr_uuid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_usr_uuid() RETURNS uuid
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN concat('usr_', uuid_generate_v4())::uuid;
END;
$$;


--
-- Name: renumber_items_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.renumber_items_after_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    item_record RECORD;
    counter INTEGER;
BEGIN
    -- Only proceed if we have a deleted row with instance_id
    IF OLD.instance_id IS NOT NULL THEN
        counter := 1;
        
        -- Renumber all remaining items for this PR
        FOR item_record IN 
            SELECT id FROM item 
            WHERE instance_id = OLD.instance_id 
            ORDER BY created_at, id
        LOOP
            UPDATE item 
            SET item_number = counter::TEXT
            WHERE id = item_record.id;
            
            counter := counter + 1;
        END LOOP;
    END IF;
    
    RETURN OLD;
END;
$$;


--
-- ID COLUMN DEFAULTS
-- Prisma db push doesn't reliably apply @default(dbgenerated(...)) for id columns.
-- This block ensures every table that should have a prefixed UUID default actually gets one.
--

ALTER TABLE public."entity" ALTER COLUMN id SET DEFAULT concat('ent_', gen_random_uuid());
ALTER TABLE public."budget_period" ALTER COLUMN id SET DEFAULT concat('bupe_', gen_random_uuid());
ALTER TABLE public."item_category" ALTER COLUMN id SET DEFAULT concat('item_', gen_random_uuid());
ALTER TABLE public."uom" ALTER COLUMN id SET DEFAULT concat('uom_', gen_random_uuid());
ALTER TABLE public."list_data" ALTER COLUMN id SET DEFAULT concat('uom_', gen_random_uuid());
ALTER TABLE public."user_master" ALTER COLUMN id SET DEFAULT concat('user_', gen_random_uuid());
ALTER TABLE public."shipping_method" ALTER COLUMN id SET DEFAULT concat('ship_', gen_random_uuid());
ALTER TABLE public."shipping_terms" ALTER COLUMN id SET DEFAULT concat('ship_', gen_random_uuid());
ALTER TABLE public."tax_master" ALTER COLUMN id SET DEFAULT concat('tax_', gen_random_uuid());
ALTER TABLE public."payment_terms" ALTER COLUMN id SET DEFAULT concat('pay_', gen_random_uuid());
ALTER TABLE public."business_unit" ALTER COLUMN id SET DEFAULT concat('busi_', gen_random_uuid());
ALTER TABLE public."attachment" ALTER COLUMN id SET DEFAULT concat('attach_', gen_random_uuid());
ALTER TABLE public."instance_email_ingest" ALTER COLUMN id SET DEFAULT concat('emig_', gen_random_uuid());
ALTER TABLE public."instance_email_ingest_item" ALTER COLUMN id SET DEFAULT concat('emig_item_', gen_random_uuid());
ALTER TABLE public."location" ALTER COLUMN id SET DEFAULT concat('loca_', gen_random_uuid());
ALTER TABLE public."supplier" ALTER COLUMN id SET DEFAULT concat('supp_', gen_random_uuid());
ALTER TABLE public."customers" ALTER COLUMN id SET DEFAULT concat('cust_', gen_random_uuid());
ALTER TABLE public."cost_center" ALTER COLUMN id SET DEFAULT concat('cost_', gen_random_uuid());
ALTER TABLE public."department" ALTER COLUMN id SET DEFAULT concat('dept_', gen_random_uuid());
ALTER TABLE public."budget_line" ALTER COLUMN id SET DEFAULT concat('buli_', gen_random_uuid());
ALTER TABLE public."item_master" ALTER COLUMN id SET DEFAULT concat('prod_', gen_random_uuid());
ALTER TABLE public."general_ledger" ALTER COLUMN id SET DEFAULT concat('gl_', gen_random_uuid());
ALTER TABLE public."employee_master" ALTER COLUMN id SET DEFAULT concat('emp_', gen_random_uuid());
ALTER TABLE public."supplier_items" ALTER COLUMN id SET DEFAULT concat('supp_', gen_random_uuid());
ALTER TABLE public."project_master" ALTER COLUMN id SET DEFAULT concat('proj_', gen_random_uuid());
ALTER TABLE public."purchase_requisition" ALTER COLUMN id SET DEFAULT concat('preq_', gen_random_uuid());
ALTER TABLE public."item" ALTER COLUMN id SET DEFAULT concat('item_', gen_random_uuid());
ALTER TABLE public."purchase_order" ALTER COLUMN id SET DEFAULT concat('po_', gen_random_uuid());
ALTER TABLE public."purchase_order_item" ALTER COLUMN id SET DEFAULT concat('po_item_', gen_random_uuid());
ALTER TABLE public."currency" ALTER COLUMN id SET DEFAULT concat('cur_', gen_random_uuid());
ALTER TABLE public."invoice" ALTER COLUMN id SET DEFAULT concat('invoice_', gen_random_uuid());
ALTER TABLE public."invoice_line_item" ALTER COLUMN id SET DEFAULT concat('in_item__', gen_random_uuid());
ALTER TABLE public."payment_receipt" ALTER COLUMN id SET DEFAULT concat('payr_', gen_random_uuid());

-- sales.prisma models
ALTER TABLE public."sales_order" ALTER COLUMN id SET DEFAULT concat('so_', gen_random_uuid());
ALTER TABLE public."sales_order_item" ALTER COLUMN id SET DEFAULT concat('so_item_', gen_random_uuid());
ALTER TABLE public."delivery_challan" ALTER COLUMN id SET DEFAULT concat('dc_', gen_random_uuid());
ALTER TABLE public."delivery_challan_item" ALTER COLUMN id SET DEFAULT concat('dc_item_', gen_random_uuid());
ALTER TABLE public."credit_note" ALTER COLUMN id SET DEFAULT concat('cn_', gen_random_uuid());
ALTER TABLE public."credit_note_item" ALTER COLUMN id SET DEFAULT concat('cn_item_', gen_random_uuid());
ALTER TABLE public."quote" ALTER COLUMN id SET DEFAULT concat('quote_', gen_random_uuid());
ALTER TABLE public."quote_item" ALTER COLUMN id SET DEFAULT concat('quote_item_', gen_random_uuid());

-- data.prisma models
ALTER TABLE public."account" ALTER COLUMN id SET DEFAULT concat('acco_', gen_random_uuid());
ALTER TABLE public."posting" ALTER COLUMN id SET DEFAULT concat('post_', gen_random_uuid());
ALTER TABLE public."instrument" ALTER COLUMN id SET DEFAULT concat('inst_', gen_random_uuid());
ALTER TABLE public."trade" ALTER COLUMN id SET DEFAULT concat('trad_', gen_random_uuid());
ALTER TABLE public."holding" ALTER COLUMN id SET DEFAULT concat('hold_', gen_random_uuid());
ALTER TABLE public."currency" ALTER COLUMN id SET DEFAULT concat('curr_', gen_random_uuid());
ALTER TABLE public."exchange_rate" ALTER COLUMN id SET DEFAULT concat('exrt_', gen_random_uuid());
ALTER TABLE public."expense_report" ALTER COLUMN id SET DEFAULT concat('expr_', gen_random_uuid());
ALTER TABLE public."ai_activity_log" ALTER COLUMN id SET DEFAULT concat('aial_', gen_random_uuid());
ALTER TABLE public."llm_trace" ALTER COLUMN id SET DEFAULT concat('llmt_', gen_random_uuid());
ALTER TABLE public."llm_trace_step" ALTER COLUMN id SET DEFAULT concat('llms_', gen_random_uuid());

-- metadata.prisma models (tables mapped in public schema)
ALTER TABLE public."organizations" ALTER COLUMN id SET DEFAULT concat('org_', gen_random_uuid());
ALTER TABLE public."user" ALTER COLUMN id SET DEFAULT concat('user_', gen_random_uuid());
ALTER TABLE public."role" ALTER COLUMN id SET DEFAULT concat('role_', gen_random_uuid());
ALTER TABLE public."view" ALTER COLUMN id SET DEFAULT concat('view_', gen_random_uuid());
ALTER TABLE public."role_view" ALTER COLUMN id SET DEFAULT concat('rovi_', gen_random_uuid());
ALTER TABLE public."role_user" ALTER COLUMN id SET DEFAULT concat('rous_', gen_random_uuid());
ALTER TABLE public."permission" ALTER COLUMN id SET DEFAULT concat('perm_', gen_random_uuid());
ALTER TABLE public."base_model" ALTER COLUMN id SET DEFAULT concat('base_', gen_random_uuid());
ALTER TABLE public."workflow_flow" ALTER COLUMN id SET DEFAULT concat('flow_', gen_random_uuid());
ALTER TABLE public."workflow_state" ALTER COLUMN id SET DEFAULT concat('wsta_', gen_random_uuid());
ALTER TABLE public."workflow_action" ALTER COLUMN id SET DEFAULT concat('wact_', gen_random_uuid());
ALTER TABLE public."workflow_instance" ALTER COLUMN id SET DEFAULT concat('wins_', gen_random_uuid());
ALTER TABLE public."workflow_history" ALTER COLUMN id SET DEFAULT concat('whis_', gen_random_uuid());
ALTER TABLE public."comment" ALTER COLUMN id SET DEFAULT concat('comm_', gen_random_uuid());
ALTER TABLE public."prompt_template" ALTER COLUMN id SET DEFAULT concat('ptem_', gen_random_uuid());
ALTER TABLE public."source_system" ALTER COLUMN id SET DEFAULT concat('srcsys_', gen_random_uuid());


--
-- TRIGGERS
--

--
-- Name: invoice trg_generate_invoice_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON public.invoice;
CREATE TRIGGER trg_generate_invoice_number BEFORE INSERT ON public.invoice FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();


--
-- Name: purchase_order trg_generate_po_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trg_generate_po_number ON public.purchase_order;
CREATE TRIGGER trg_generate_po_number BEFORE INSERT ON public.purchase_order FOR EACH ROW EXECUTE FUNCTION public.generate_po_number();


--
-- Name: purchase_requisition trg_generate_pr_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trg_generate_pr_number ON public.purchase_requisition;
CREATE TRIGGER trg_generate_pr_number BEFORE INSERT ON public.purchase_requisition FOR EACH ROW EXECUTE FUNCTION public.generate_pr_number();


--
-- Name: general_ledger trigger_generate_gl_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trigger_generate_gl_number ON public.general_ledger;
CREATE TRIGGER trigger_generate_gl_number BEFORE INSERT ON public.general_ledger FOR EACH ROW EXECUTE FUNCTION public.generate_gl_number();


--
-- Name: item_master trigger_generate_item_code; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trigger_generate_item_code ON public.item_master;
CREATE TRIGGER trigger_generate_item_code BEFORE INSERT ON public.item_master FOR EACH ROW EXECUTE FUNCTION public.generate_item_code();


--
-- Name: item trigger_generate_item_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trigger_generate_item_number ON public.item;
CREATE TRIGGER trigger_generate_item_number BEFORE INSERT ON public.item FOR EACH ROW EXECUTE FUNCTION public.generate_item_number();


--
-- Name: payment_receipt trigger_generate_payment_receipt_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trigger_generate_payment_receipt_number ON public.payment_receipt;
CREATE TRIGGER trigger_generate_payment_receipt_number BEFORE INSERT ON public.payment_receipt FOR EACH ROW EXECUTE FUNCTION public.generate_payment_receipt_number();


--
-- Name: sales_order trigger_generate_so_number; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trigger_generate_so_number ON public.sales_order;
CREATE TRIGGER trigger_generate_so_number BEFORE INSERT ON public.sales_order FOR EACH ROW EXECUTE FUNCTION public.generate_so_number();


--
-- Name: item trigger_renumber_items_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trigger_renumber_items_after_delete ON public.item;
CREATE TRIGGER trigger_renumber_items_after_delete AFTER DELETE ON public.item FOR EACH ROW EXECUTE FUNCTION public.renumber_items_after_delete();
