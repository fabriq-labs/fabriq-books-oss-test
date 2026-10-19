-- Universal sales model delta (Module 2 Phase A).
-- Reviewed script: creates sales/tax tables and extends stubs.
-- Does not drop product data. Apply only to local/dev after review.
-- See docs/domain/SALES_MODEL.md.

-- CreateEnum
CREATE TYPE "invoice_direction" AS ENUM ('sales', 'purchase');

-- CreateEnum
CREATE TYPE "sales_document_status" AS ENUM ('draft', 'posted', 'void');

-- CreateEnum
CREATE TYPE "payment_type" AS ENUM ('full', 'partial', 'advance');

-- DropIndex
DROP INDEX "invoice_org_id_idx";

-- AlterTable
ALTER TABLE "entity" ADD COLUMN     "default_tax_region_id" TEXT,
ADD COLUMN     "tax_treatment" TEXT;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "adjustment_amount" DECIMAL(19,4),
ADD COLUMN     "balance_amount" DECIMAL(19,4),
ADD COLUMN     "bill_to" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "currency_id" TEXT,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "direction" "invoice_direction" NOT NULL DEFAULT 'sales',
ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "exchange_rate" DECIMAL(19,6) NOT NULL DEFAULT 1,
ADD COLUMN     "ingest_batch_id" TEXT,
ADD COLUMN     "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "net_amount" DECIMAL(19,4),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "payment_terms_id" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "seller_tax_region_id" TEXT,
ADD COLUMN     "ship_to" TEXT,
ADD COLUMN     "shipping_amount" DECIMAL(19,4),
ADD COLUMN     "source_record_id" TEXT,
ADD COLUMN     "source_system_id" TEXT,
ADD COLUMN     "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "sales_document_status" NOT NULL DEFAULT 'draft',
ADD COLUMN     "supplier_id" TEXT,
ADD COLUMN     "tax_amount" DECIMAL(19,4),
ADD COLUMN     "tax_region_id" TEXT,
ADD COLUMN     "tax_responsibility" TEXT,
ADD COLUMN     "total_amount" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "payment_receipt" ADD COLUMN     "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "base_amount" DECIMAL(19,4),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "currency_id" TEXT,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "exchange_rate" DECIMAL(19,6) NOT NULL DEFAULT 1,
ADD COLUMN     "ingest_batch_id" TEXT,
ADD COLUMN     "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "payment_reference" TEXT,
ADD COLUMN     "payment_type" "payment_type",
ADD COLUMN     "receipt_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source_record_id" TEXT,
ADD COLUMN     "source_system_id" TEXT,
ADD COLUMN     "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "sales_document_status" NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE "credit_note" ADD COLUMN     "balance_amount" DECIMAL(19,4),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "credit_note_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency_id" TEXT,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "exchange_rate" DECIMAL(19,6) NOT NULL DEFAULT 1,
ADD COLUMN     "ingest_batch_id" TEXT,
ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "net_amount" DECIMAL(19,4),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "source_record_id" TEXT,
ADD COLUMN     "source_system_id" TEXT,
ADD COLUMN     "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "sales_document_status" NOT NULL DEFAULT 'draft',
ADD COLUMN     "tax_amount" DECIMAL(19,4),
ADD COLUMN     "total_amount" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "item_master" ADD COLUMN     "classification_code" TEXT,
ADD COLUMN     "classification_scheme" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "currency_id" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "ingest_batch_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_stockable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "item_tax_category" TEXT,
ADD COLUMN     "item_type" TEXT,
ADD COLUMN     "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modified_by" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "preferred_supplier_id" TEXT,
ADD COLUMN     "source_record_id" TEXT,
ADD COLUMN     "source_system_id" TEXT,
ADD COLUMN     "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tax_group_id" TEXT,
ADD COLUMN     "tax_master_id" TEXT,
ADD COLUMN     "unit_price" DECIMAL(19,4),
ADD COLUMN     "uom_id" TEXT;

-- CreateTable
CREATE TABLE "customer" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'cust_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "currency_id" TEXT,
    "payment_terms_id" TEXT,
    "entity_id" TEXT,
    "receivable_account_id" TEXT,
    "tax_treatment" TEXT,
    "default_tax_region_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'supp_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "currency_id" TEXT,
    "payment_terms_id" TEXT,
    "entity_id" TEXT,
    "payable_account_id" TEXT,
    "tax_treatment" TEXT,
    "default_tax_region_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'loca_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "entity_id" TEXT,
    "customer_id" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'payt_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "days" INTEGER,
    "entity_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'uom_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_item" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'invl_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL DEFAULT 1,
    "item_master_id" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discount_rate" DECIMAL(9,6),
    "discount_amount" DECIMAL(19,4),
    "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "tax_group_id" TEXT,
    "classification_code" TEXT,
    "classification_scheme" TEXT,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "invoice_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipt_application" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'payra_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "payment_receipt_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_applied" DECIMAL(19,4) NOT NULL,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipt_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_item" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'cni_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL DEFAULT 1,
    "item_master_id" TEXT,
    "invoice_line_item_id" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(19,4),
    "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "tax_group_id" TEXT,
    "created_by" TEXT,
    "modified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_note_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_region" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'txreg_' || gen_random_uuid(),
    "country_code" VARCHAR(2) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "region_type" VARCHAR(32),
    "org_id" TEXT NOT NULL DEFAULT 'org_system',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_tax_registration" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'ptxr_' || gen_random_uuid(),
    "party_type" TEXT NOT NULL,
    "party_id" VARCHAR(50) NOT NULL,
    "scheme" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "tax_region_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "org_id" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_tax_registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_master" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'tax_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "component_type" TEXT,
    "is_recoverable" BOOLEAN,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "liability_account_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "tax_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_group" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'txgrp_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "country_code" VARCHAR(2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "source_system_id" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ingest_batch_id" TEXT,

    CONSTRAINT "tax_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_group_component" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'txgc_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "tax_group_id" TEXT NOT NULL,
    "tax_master_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_group_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_tax" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'inltx_' || gen_random_uuid(),
    "org_id" TEXT NOT NULL,
    "invoice_line_item_id" TEXT NOT NULL,
    "tax_master_id" TEXT NOT NULL,
    "tax_group_id" TEXT,
    "rate" DECIMAL(9,6) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "component_type" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_tax_settings" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'enttax_' || gen_random_uuid(),
    "entity_id" VARCHAR(50) NOT NULL,
    "org_id" TEXT NOT NULL,
    "tax_country_pack" TEXT NOT NULL DEFAULT 'GENERIC',
    "require_classification_on_taxable" BOOLEAN NOT NULL DEFAULT false,
    "enable_tax_responsibility" BOOLEAN NOT NULL DEFAULT false,
    "default_tax_payable_account_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT,
    "modified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_tax_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_org_id_idx" ON "customer"("org_id");

-- CreateIndex
CREATE INDEX "customer_entity_id_idx" ON "customer"("entity_id");

-- CreateIndex
CREATE INDEX "customer_currency_id_idx" ON "customer"("currency_id");

-- CreateIndex
CREATE INDEX "customer_payment_terms_id_idx" ON "customer"("payment_terms_id");

-- CreateIndex
CREATE INDEX "customer_receivable_account_id_idx" ON "customer"("receivable_account_id");

-- CreateIndex
CREATE INDEX "customer_default_tax_region_id_idx" ON "customer"("default_tax_region_id");

-- CreateIndex
CREATE INDEX "customer_source_system_id_source_record_id_idx" ON "customer"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_org_id_source_system_id_source_record_id_key" ON "customer"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "supplier_org_id_idx" ON "supplier"("org_id");

-- CreateIndex
CREATE INDEX "supplier_entity_id_idx" ON "supplier"("entity_id");

-- CreateIndex
CREATE INDEX "supplier_currency_id_idx" ON "supplier"("currency_id");

-- CreateIndex
CREATE INDEX "supplier_payment_terms_id_idx" ON "supplier"("payment_terms_id");

-- CreateIndex
CREATE INDEX "supplier_payable_account_id_idx" ON "supplier"("payable_account_id");

-- CreateIndex
CREATE INDEX "supplier_default_tax_region_id_idx" ON "supplier"("default_tax_region_id");

-- CreateIndex
CREATE INDEX "supplier_source_system_id_source_record_id_idx" ON "supplier"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_org_id_source_system_id_source_record_id_key" ON "supplier"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "location_org_id_idx" ON "location"("org_id");

-- CreateIndex
CREATE INDEX "location_entity_id_idx" ON "location"("entity_id");

-- CreateIndex
CREATE INDEX "location_customer_id_idx" ON "location"("customer_id");

-- CreateIndex
CREATE INDEX "location_source_system_id_source_record_id_idx" ON "location"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_org_id_source_system_id_source_record_id_key" ON "location"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_org_id_code_key" ON "location"("org_id", "code");

-- CreateIndex
CREATE INDEX "payment_terms_org_id_idx" ON "payment_terms"("org_id");

-- CreateIndex
CREATE INDEX "payment_terms_entity_id_idx" ON "payment_terms"("entity_id");

-- CreateIndex
CREATE INDEX "payment_terms_source_system_id_source_record_id_idx" ON "payment_terms"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_org_id_source_system_id_source_record_id_key" ON "payment_terms"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "uom_org_id_idx" ON "uom"("org_id");

-- CreateIndex
CREATE INDEX "uom_source_system_id_source_record_id_idx" ON "uom"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "uom_org_id_source_system_id_source_record_id_key" ON "uom"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "uom_org_id_code_key" ON "uom"("org_id", "code");

-- CreateIndex
CREATE INDEX "invoice_line_item_invoice_id_idx" ON "invoice_line_item"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_item_master_id_idx" ON "invoice_line_item"("item_master_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_account_id_idx" ON "invoice_line_item"("account_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_tax_group_id_idx" ON "invoice_line_item"("tax_group_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_org_id_idx" ON "invoice_line_item"("org_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_source_system_id_source_record_id_idx" ON "invoice_line_item"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_item_org_id_source_system_id_source_record_id_key" ON "invoice_line_item"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "payment_receipt_application_org_id_idx" ON "payment_receipt_application"("org_id");

-- CreateIndex
CREATE INDEX "payment_receipt_application_invoice_id_idx" ON "payment_receipt_application"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipt_application_payment_receipt_id_invoice_id_key" ON "payment_receipt_application"("payment_receipt_id", "invoice_id");

-- CreateIndex
CREATE INDEX "credit_note_item_credit_note_id_idx" ON "credit_note_item"("credit_note_id");

-- CreateIndex
CREATE INDEX "credit_note_item_item_master_id_idx" ON "credit_note_item"("item_master_id");

-- CreateIndex
CREATE INDEX "credit_note_item_invoice_line_item_id_idx" ON "credit_note_item"("invoice_line_item_id");

-- CreateIndex
CREATE INDEX "credit_note_item_account_id_idx" ON "credit_note_item"("account_id");

-- CreateIndex
CREATE INDEX "credit_note_item_tax_group_id_idx" ON "credit_note_item"("tax_group_id");

-- CreateIndex
CREATE INDEX "credit_note_item_org_id_idx" ON "credit_note_item"("org_id");

-- CreateIndex
CREATE INDEX "tax_region_country_code_idx" ON "tax_region"("country_code");

-- CreateIndex
CREATE INDEX "tax_region_org_id_idx" ON "tax_region"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_region_country_code_code_org_id_key" ON "tax_region"("country_code", "code", "org_id");

-- CreateIndex
CREATE INDEX "party_tax_registration_party_type_party_id_idx" ON "party_tax_registration"("party_type", "party_id");

-- CreateIndex
CREATE INDEX "party_tax_registration_org_id_idx" ON "party_tax_registration"("org_id");

-- CreateIndex
CREATE INDEX "party_tax_registration_tax_region_id_idx" ON "party_tax_registration"("tax_region_id");

-- CreateIndex
CREATE INDEX "tax_master_org_id_idx" ON "tax_master"("org_id");

-- CreateIndex
CREATE INDEX "tax_master_source_system_id_source_record_id_idx" ON "tax_master"("source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "tax_master_liability_account_id_idx" ON "tax_master"("liability_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_master_org_id_code_key" ON "tax_master"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_master_org_id_source_system_id_source_record_id_key" ON "tax_master"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "tax_group_org_id_idx" ON "tax_group"("org_id");

-- CreateIndex
CREATE INDEX "tax_group_source_system_id_source_record_id_idx" ON "tax_group"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_group_org_id_code_key" ON "tax_group"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_group_org_id_source_system_id_source_record_id_key" ON "tax_group"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "tax_group_component_tax_group_id_idx" ON "tax_group_component"("tax_group_id");

-- CreateIndex
CREATE INDEX "tax_group_component_tax_master_id_idx" ON "tax_group_component"("tax_master_id");

-- CreateIndex
CREATE INDEX "tax_group_component_org_id_idx" ON "tax_group_component"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_group_component_tax_group_id_tax_master_id_key" ON "tax_group_component"("tax_group_id", "tax_master_id");

-- CreateIndex
CREATE INDEX "invoice_line_tax_invoice_line_item_id_idx" ON "invoice_line_tax"("invoice_line_item_id");

-- CreateIndex
CREATE INDEX "invoice_line_tax_tax_master_id_idx" ON "invoice_line_tax"("tax_master_id");

-- CreateIndex
CREATE INDEX "invoice_line_tax_tax_group_id_idx" ON "invoice_line_tax"("tax_group_id");

-- CreateIndex
CREATE INDEX "invoice_line_tax_org_id_idx" ON "invoice_line_tax"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_tax_settings_entity_id_key" ON "entity_tax_settings"("entity_id");

-- CreateIndex
CREATE INDEX "entity_tax_settings_org_id_idx" ON "entity_tax_settings"("org_id");

-- CreateIndex
CREATE INDEX "entity_tax_settings_default_tax_payable_account_id_idx" ON "entity_tax_settings"("default_tax_payable_account_id");

-- CreateIndex
CREATE INDEX "entity_default_tax_region_id_idx" ON "entity"("default_tax_region_id");

-- CreateIndex
CREATE INDEX "invoice_org_id_direction_status_idx" ON "invoice"("org_id", "direction", "status");

-- CreateIndex
CREATE INDEX "invoice_org_id_invoice_date_idx" ON "invoice"("org_id", "invoice_date");

-- CreateIndex
CREATE INDEX "invoice_customer_id_idx" ON "invoice"("customer_id");

-- CreateIndex
CREATE INDEX "invoice_supplier_id_idx" ON "invoice"("supplier_id");

-- CreateIndex
CREATE INDEX "invoice_entity_id_idx" ON "invoice"("entity_id");

-- CreateIndex
CREATE INDEX "invoice_location_id_idx" ON "invoice"("location_id");

-- CreateIndex
CREATE INDEX "invoice_currency_id_idx" ON "invoice"("currency_id");

-- CreateIndex
CREATE INDEX "invoice_payment_terms_id_idx" ON "invoice"("payment_terms_id");

-- CreateIndex
CREATE INDEX "invoice_tax_region_id_idx" ON "invoice"("tax_region_id");

-- CreateIndex
CREATE INDEX "invoice_seller_tax_region_id_idx" ON "invoice"("seller_tax_region_id");

-- CreateIndex
CREATE INDEX "invoice_source_system_id_source_record_id_idx" ON "invoice"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_org_id_source_system_id_source_record_id_key" ON "invoice"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "payment_receipt_customer_id_idx" ON "payment_receipt"("customer_id");

-- CreateIndex
CREATE INDEX "payment_receipt_currency_id_idx" ON "payment_receipt"("currency_id");

-- CreateIndex
CREATE INDEX "payment_receipt_entity_id_idx" ON "payment_receipt"("entity_id");

-- CreateIndex
CREATE INDEX "payment_receipt_source_system_id_source_record_id_idx" ON "payment_receipt"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipt_org_id_source_system_id_source_record_id_key" ON "payment_receipt"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "credit_note_customer_id_idx" ON "credit_note"("customer_id");

-- CreateIndex
CREATE INDEX "credit_note_invoice_id_idx" ON "credit_note"("invoice_id");

-- CreateIndex
CREATE INDEX "credit_note_entity_id_idx" ON "credit_note"("entity_id");

-- CreateIndex
CREATE INDEX "credit_note_location_id_idx" ON "credit_note"("location_id");

-- CreateIndex
CREATE INDEX "credit_note_currency_id_idx" ON "credit_note"("currency_id");

-- CreateIndex
CREATE INDEX "credit_note_source_system_id_source_record_id_idx" ON "credit_note"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_org_id_source_system_id_source_record_id_key" ON "credit_note"("org_id", "source_system_id", "source_record_id");

-- CreateIndex
CREATE INDEX "item_master_uom_id_idx" ON "item_master"("uom_id");

-- CreateIndex
CREATE INDEX "item_master_tax_group_id_idx" ON "item_master"("tax_group_id");

-- CreateIndex
CREATE INDEX "item_master_tax_master_id_idx" ON "item_master"("tax_master_id");

-- CreateIndex
CREATE INDEX "item_master_preferred_supplier_id_idx" ON "item_master"("preferred_supplier_id");

-- CreateIndex
CREATE INDEX "item_master_currency_id_idx" ON "item_master"("currency_id");

-- CreateIndex
CREATE INDEX "item_master_source_system_id_source_record_id_idx" ON "item_master"("source_system_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_master_org_id_code_key" ON "item_master"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "item_master_org_id_source_system_id_source_record_id_key" ON "item_master"("org_id", "source_system_id", "source_record_id");

-- AddForeignKey
ALTER TABLE "entity" ADD CONSTRAINT "entity_default_tax_region_id_fkey" FOREIGN KEY ("default_tax_region_id") REFERENCES "tax_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_default_tax_region_id_fkey" FOREIGN KEY ("default_tax_region_id") REFERENCES "tax_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_payable_account_id_fkey" FOREIGN KEY ("payable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_default_tax_region_id_fkey" FOREIGN KEY ("default_tax_region_id") REFERENCES "tax_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_tax_master_id_fkey" FOREIGN KEY ("tax_master_id") REFERENCES "tax_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tax_region_id_fkey" FOREIGN KEY ("tax_region_id") REFERENCES "tax_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_seller_tax_region_id_fkey" FOREIGN KEY ("seller_tax_region_id") REFERENCES "tax_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_item_master_id_fkey" FOREIGN KEY ("item_master_id") REFERENCES "item_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipt" ADD CONSTRAINT "payment_receipt_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipt_application" ADD CONSTRAINT "payment_receipt_application_payment_receipt_id_fkey" FOREIGN KEY ("payment_receipt_id") REFERENCES "payment_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipt_application" ADD CONSTRAINT "payment_receipt_application_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_item" ADD CONSTRAINT "credit_note_item_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_item" ADD CONSTRAINT "credit_note_item_item_master_id_fkey" FOREIGN KEY ("item_master_id") REFERENCES "item_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_item" ADD CONSTRAINT "credit_note_item_invoice_line_item_id_fkey" FOREIGN KEY ("invoice_line_item_id") REFERENCES "invoice_line_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_item" ADD CONSTRAINT "credit_note_item_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_item" ADD CONSTRAINT "credit_note_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_tax_registration" ADD CONSTRAINT "party_tax_registration_tax_region_id_fkey" FOREIGN KEY ("tax_region_id") REFERENCES "tax_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_master" ADD CONSTRAINT "tax_master_liability_account_id_fkey" FOREIGN KEY ("liability_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_group_component" ADD CONSTRAINT "tax_group_component_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_group_component" ADD CONSTRAINT "tax_group_component_tax_master_id_fkey" FOREIGN KEY ("tax_master_id") REFERENCES "tax_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_tax" ADD CONSTRAINT "invoice_line_tax_invoice_line_item_id_fkey" FOREIGN KEY ("invoice_line_item_id") REFERENCES "invoice_line_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_tax" ADD CONSTRAINT "invoice_line_tax_tax_master_id_fkey" FOREIGN KEY ("tax_master_id") REFERENCES "tax_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_tax" ADD CONSTRAINT "invoice_line_tax_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_tax_settings" ADD CONSTRAINT "entity_tax_settings_default_tax_payable_account_id_fkey" FOREIGN KEY ("default_tax_payable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_tax_settings" ADD CONSTRAINT "entity_tax_settings_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
