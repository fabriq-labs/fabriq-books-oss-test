# Tax documentation

Country-agnostic structured tax for Fabriq Books (P0/P1). **Review before implementation.**

| Doc | Purpose |
|-----|---------|
| [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md) | RFC: data model, principles, API stance, UX/country pack |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Sales invoice phased build plan (P0/P1 progress) |
| [BILLS_TAX_ANALYSIS.md](./BILLS_TAX_ANALYSIS.md) | Purchase bills vs sales invoice — current state & gap analysis |
| [BILLS_TAX_IMPLEMENTATION_PLAN.md](./BILLS_TAX_IMPLEMENTATION_PLAN.md) | Bills + supplier + upload/extract — **BP-0…BP-3 done** (bill PDF skipped; posting deferred). Start at **Agent handoff**; end-user help source: **§13**. |
| [migrations/prod-bills-tax/](./migrations/prod-bills-tax/) | **Prod DDL/DML pack** for branch `agentc/bills-tax-analysis-e0b7` (supplier tax, `invoice.supplier_id`, `po_mode`, view metadata, extract prompt) |

## Reading order

1. Architecture (what and why)
2. Sales implementation plan (what shipped for invoices)
3. Bills analysis → bills implementation plan (Purchases → Bills / supplier / extract)
