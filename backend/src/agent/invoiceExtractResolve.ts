/**
 * Resolve extracted bill PDF fields onto invoice / line FK payloads.
 * No new HTTP API — used by extractInvoiceFromFileTool (+ FE via resolved blob).
 */
import prisma from '../lib/prisma';
import { AuthContext } from '../auth/types';
import logger from '../utils/logger';
import { billTypeAndPoMode } from '../lib/bills/poMode';

const RATE_EPS = 0.01;

export type ExtractedTaxComponent = {
  name?: string | null;
  component_type?: string | null;
  rate?: number | null;
  amount?: number | null;
};

export type ExtractedLineItem = {
  item_name?: string | null;
  item_number?: string | null;
  item_description?: string | null;
  item_type?: string | null;
  rate?: number | null;
  ordered_quantity?: number | null;
  ordered_amount?: number | null;
  invoice_qty?: number | null;
  quantity?: number | null;
  line_total?: number | null;
  invoiced_amount?: number | null;
  tax_type?: string | null;
  tax_rate?: number | null;
  tax_rate_intra?: number | null;
  line_tax_amount?: number | null;
  po_number?: string | null;
  need_by_date?: string | Date | null;
  classification_code?: string | null;
  classification_scheme?: string | null;
  hsn_sac?: string | null;
  tax_components?: ExtractedTaxComponent[] | null;
  [key: string]: unknown;
};

/** Non-catalog fees (service charge, convenience fee, …) — taxable like product lines. */
export type ExtractedCharge = {
  charge_type?: string | null;
  label?: string | null;
  amount?: number | null;
  /**
   * Fee calculation % printed on the document (e.g. "Service Charge @ 10%").
   * Informational only — NEVER treat as GST/VAT tax_rate.
   */
  charge_percent?: number | null;
  taxable?: boolean | null;
  tax_rate?: number | null;
  line_tax_amount?: number | null;
  tax_components?: ExtractedTaxComponent[] | null;
  [key: string]: unknown;
};

/**
 * Drop tax_rate when it is clearly the fee % mis-copied as tax
 * (same number as charge_percent, no real tax_components).
 */
export function sanitizeChargeTaxFields(charge: ExtractedCharge): ExtractedCharge {
  const chargePct =
    charge.charge_percent != null && Number.isFinite(Number(charge.charge_percent))
      ? Number(charge.charge_percent)
      : null;
  const taxRate =
    charge.tax_rate != null && Number.isFinite(Number(charge.tax_rate))
      ? Number(charge.tax_rate)
      : null;
  const components = Array.isArray(charge.tax_components)
    ? charge.tax_components.filter(
        (c) =>
          c &&
          ((c.rate != null && Number.isFinite(Number(c.rate))) ||
            (c.amount != null && Number.isFinite(Number(c.amount)))),
      )
    : [];

  if (
    taxRate != null &&
    chargePct != null &&
    Math.abs(taxRate - chargePct) < 1e-6 &&
    components.length === 0
  ) {
    return {
      ...charge,
      tax_rate: null,
      line_tax_amount: null,
    };
  }

  // Infer charge_percent from label "… @ 10%" when LLM stuffed that % into tax_rate only
  if (taxRate != null && components.length === 0 && chargePct == null) {
    const label = String(charge.label || '');
    const m = label.match(/@\s*(\d+(?:\.\d+)?)\s*%/i);
    if (m && Math.abs(Number(m[1]) - taxRate) < 1e-6) {
      return {
        ...charge,
        charge_percent: taxRate,
        tax_rate: null,
        line_tax_amount: null,
        label: label.replace(/\s*@\s*\d+(?:\.\d+)?\s*%/i, '').trim() || charge.label,
      };
    }
  }

  return charge;
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  service_charge: 'Service charge',
  convenience_fee: 'Convenience fee',
  tip: 'Tip',
  freight: 'Freight',
  handling: 'Handling',
  misc: 'Miscellaneous charge',
  other: 'Charge',
  other_charge: 'Charge',
  fee: 'Fee',
};

/** Map extract `charges[]` into synthetic line items (`item_type = charge`). */
export function chargesToLineItems(
  charges: ExtractedCharge[] | null | undefined,
): ExtractedLineItem[] {
  return (charges || [])
    .map((raw) => {
      const c = sanitizeChargeTaxFields(raw);
      const amount = c.amount != null ? Number(c.amount) : NaN;
      if (!Number.isFinite(amount)) return null;
      const typeKey = String(c.charge_type || 'service_charge')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      const label =
        String(c.label || '').trim() ||
        CHARGE_TYPE_LABELS[typeKey] ||
        CHARGE_TYPE_LABELS.service_charge;
      return {
        item_name: label,
        item_description: label,
        item_type: 'charge',
        rate: amount,
        invoice_qty: 1,
        ordered_quantity: 1,
        ordered_amount: amount,
        line_total: amount,
        invoiced_amount: amount,
        tax_rate: c.tax_rate != null ? Number(c.tax_rate) : null,
        line_tax_amount: c.line_tax_amount != null ? Number(c.line_tax_amount) : null,
        tax_components: Array.isArray(c.tax_components) ? c.tax_components : null,
      } as ExtractedLineItem;
    })
    .filter((x): x is ExtractedLineItem => x != null);
}

export type ExtractedInvoice = {
  invoice_number?: string | null;
  invoice_date?: string | Date | null;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_gstin?: string | null;
  place_of_supply?: string | null;
  supplier_region?: string | null;
  reverse_charge?: boolean | string | null;
  tax_responsibility?: string | null;
  payment_terms?: string | null;
  shipping_terms?: string | null;
  shipping_method?: string | null;
  po_number?: string | null;
  remit_to?: string | null;
  ap_comment?: string | null;
  additional_tax?: number | null;
  shipping_cost?: number | null;
  invoice_net_total?: number | null;
  invoice_total?: number | null;
  terms_and_conditions?: string | null;
  [key: string]: unknown;
};

export type ExtractedContext = {
  currency?: string | null;
  [key: string]: unknown;
};

export type ResolveExtractedInvoiceInput = {
  invoice?: ExtractedInvoice | null;
  line_items?: ExtractedLineItem[] | null;
  /** Taxable fees (service charge, etc.) — not product line_items */
  charges?: ExtractedCharge[] | null;
  context?: ExtractedContext | null;
};

export type ResolvedLineItem = {
  tax_group_id?: string | null;
  tax_group_code?: string | null;
  tax_rate?: number | null;
  line_tax_amount?: number | null;
  classification_code?: string | null;
  classification_scheme?: string | null;
  match?: 'tax_group' | 'tax_rate' | 'none';
};

export type ResolvedInvoiceExtract = {
  supplier_id?: string | null;
  supplier_name?: string | null;
  currency_id?: string | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
  legal_entity_id?: string | null;
  tax_region_id?: string | null;
  seller_tax_region_id?: string | null;
  tax_responsibility?: string | null;
  supplier_tax_id?: string | null;
  place_of_supply?: string | null;
  /** Matched payment_terms master id when extracted text matches a term label */
  payment_terms_id?: string | null;
  /** Parallel to extracted.line_items */
  lines: ResolvedLineItem[];
  /** Parallel to extracted.charges (after chargesToLineItems tax resolve) */
  charges: ResolvedLineItem[];
};

/** Normalize printed tax labels to component_type-ish tokens (cgst/sgst/igst/…). */
export function normalizeTaxComponentType(raw?: string | null): string {
  const s = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!s) return 'other';
  if (s.includes('cgst') || s.includes('centralgst')) return 'cgst';
  if (s.includes('sgst') || s.includes('stategst')) return 'sgst';
  if (s.includes('igst') || s.includes('integratedgst')) return 'igst';
  if (s.includes('utgst')) return 'utgst';
  if (s.includes('hst') || s === 'gsthst') return 'hst';
  if (s.includes('qst')) return 'qst';
  if (s.includes('pst') || s.includes('rst')) return 'pst';
  if (s === 'gst' || s.includes('gst')) return 'other';
  return s;
}

export function ratesEqual(a: number, b: number, eps = RATE_EPS): boolean {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

/** Stable signature: sorted `type:rate` pairs (rates rounded to 2dp). */
export function componentSignature(
  components: Array<{ type: string; rate: number }>,
): string {
  return components
    .map((c) => `${c.type}:${Number(c.rate).toFixed(2)}`)
    .sort()
    .join('|');
}

export function matchTaxGroupIdByComponents(
  extracted: Array<{ name?: string | null; component_type?: string | null; rate?: number | null }>,
  groups: Array<{
    id: string;
    code?: string | null;
    status?: string | null;
    components: Array<{ type: string; rate: number }>;
  }>,
): { id: string; code?: string | null } | null {
  const extractedNorm = extracted
    .map((c) => ({
      type: normalizeTaxComponentType(c.component_type || c.name),
      rate: Number(c.rate),
    }))
    .filter((c) => Number.isFinite(c.rate));
  if (extractedNorm.length === 0) return null;

  const want = componentSignature(extractedNorm);
  const matches = groups.filter((g) => {
    if (!g.components?.length) return false;
    if (g.components.length !== extractedNorm.length) return false;
    return componentSignature(g.components) === want;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return { id: matches[0].id, code: matches[0].code };

  const active = matches.filter((g) => String(g.status || '').toLowerCase() === 'active');
  const pool = active.length ? active : matches;
  if (pool.length === 1) return { id: pool[0].id, code: pool[0].code };
  // Ambiguous — leave %
  return null;
}

/**
 * Flat single-rate match: only when group has exactly one component and rates equal.
 * Avoid matching multi-component groups (e.g. CGST+SGST) from a bare 18%.
 */
export function matchTaxGroupIdByFlatRate(
  rate: number,
  groups: Array<{
    id: string;
    code?: string | null;
    status?: string | null;
    components: Array<{ type: string; rate: number }>;
  }>,
): { id: string; code?: string | null } | null {
  if (!Number.isFinite(rate)) return null;
  const matches = groups.filter(
    (g) => g.components.length === 1 && ratesEqual(g.components[0].rate, rate),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return { id: matches[0].id, code: matches[0].code };
  const active = matches.filter((g) => String(g.status || '').toLowerCase() === 'active');
  if (active.length === 1) return { id: active[0].id, code: active[0].code };
  return null;
}

function parseReverseCharge(
  invoice?: ExtractedInvoice | null,
): string | null {
  if (!invoice) return null;
  if (invoice.tax_responsibility === 'recipient' || invoice.tax_responsibility === 'supplier') {
    return invoice.tax_responsibility;
  }
  const rc = invoice.reverse_charge;
  if (rc === true || String(rc).toLowerCase() === 'true' || String(rc).toLowerCase() === 'yes') {
    return 'recipient';
  }
  if (rc === false || String(rc).toLowerCase() === 'false' || String(rc).toLowerCase() === 'no') {
    return 'supplier';
  }
  return null;
}

function pickSupplierTaxId(invoice?: ExtractedInvoice | null): string | null {
  const raw =
    invoice?.supplier_tax_id ||
    invoice?.supplier_gstin ||
    (invoice as any)?.seller_gstin ||
    null;
  const s = String(raw || '').trim();
  return s || null;
}

function classificationFromLine(line: ExtractedLineItem): {
  classification_code: string | null;
  classification_scheme: string | null;
} {
  const code = String(line.classification_code || line.hsn_sac || '').trim() || null;
  let scheme = String(line.classification_scheme || '').trim() || null;
  if (code && !scheme) {
    // HSN typically numeric; SAC often service codes — default HSN when digits-only
    scheme = /^\d+$/.test(code) ? 'HSN' : 'HSN';
  }
  return { classification_code: code, classification_scheme: scheme };
}

async function loadTaxGroupsWithComponents(orgId: string) {
  const groups = await prisma.tax_group.findMany({
    where: {
      OR: [{ org_id: orgId }, { org_id: 'system' }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      tax_group_component: {
        select: {
          tax_master: {
            select: {
              component_type: true,
              tax_rate: true,
              tax_name: true,
            },
          },
        },
      },
    },
  });

  return groups.map((g) => ({
    id: g.id,
    code: g.code,
    status: g.status,
    components: (g.tax_group_component || [])
      .map((c) => ({
        type: normalizeTaxComponentType(
          c.tax_master?.component_type || c.tax_master?.tax_name,
        ),
        rate: Number(c.tax_master?.tax_rate ?? NaN),
      }))
      .filter((c) => Number.isFinite(c.rate)),
  }));
}

async function resolveCurrencyId(code?: string | null): Promise<{
  currency_id: string | null;
  currency_code: string | null;
}> {
  const raw = String(code || '').trim().toUpperCase();
  if (!raw) return { currency_id: null, currency_code: null };
  // Accept "USD", "US Dollar", "INR ₹" etc. — prefer 3-letter token
  const m = raw.match(/\b([A-Z]{3})\b/);
  const normalized = m ? m[1] : raw.slice(0, 3);
  const row = await prisma.currency.findFirst({
    where: {
      OR: [
        { code: { equals: normalized, mode: 'insensitive' } },
        { code: { equals: raw, mode: 'insensitive' } },
      ],
    },
    select: { id: true, code: true },
  });
  return {
    currency_id: row?.id ?? null,
    currency_code: row?.code ?? normalized,
  };
}

async function resolveLatestExchangeRate(
  fromCurrencyId: string,
  toCurrencyId: string,
  asOf?: Date | null,
): Promise<number> {
  if (fromCurrencyId === toCurrencyId) return 1;
  const asOfDate = asOf && !Number.isNaN(asOf.getTime()) ? asOf : new Date();

  const direct = await prisma.exchange_rate.findFirst({
    where: {
      from_currency_id: fromCurrencyId,
      to_currency_id: toCurrencyId,
      effective_date: { lte: asOfDate },
    },
    orderBy: { effective_date: 'desc' },
    select: { rate: true },
  });
  if (direct?.rate != null && Number(direct.rate) > 0) return Number(direct.rate);

  const inverse = await prisma.exchange_rate.findFirst({
    where: {
      from_currency_id: toCurrencyId,
      to_currency_id: fromCurrencyId,
      effective_date: { lte: asOfDate },
    },
    orderBy: { effective_date: 'desc' },
    select: { rate: true },
  });
  if (inverse?.rate != null && Number(inverse.rate) > 0) {
    return 1 / Number(inverse.rate);
  }
  return 1;
}

async function resolveHqLegalEntity(orgId: string) {
  const hq = await prisma.entity.findFirst({
    where: { org_id: orgId, is_it_headquartres: 'Yes' },
    select: {
      id: true,
      basecurrency_id: true,
      default_tax_region_id: true,
    },
  });
  return hq;
}

/** Match free-text payment terms from a bill to payment_terms master (case-insensitive). */
async function resolvePaymentTermsId(
  orgId: string,
  paymentTermsText?: string | null,
): Promise<string | null> {
  const label = String(paymentTermsText || '').trim();
  if (!label) return null;
  const term = await prisma.payment_terms.findFirst({
    where: {
      org_id: orgId,
      payment_terms: { equals: label, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return term?.id || null;
}

/** Prefer header/entity-selector LE when provided; else HQ. */
async function resolveBillLegalEntity(
  orgId: string,
  preferredLegalEntityId?: string | null,
) {
  const preferred = String(preferredLegalEntityId || '').trim();
  if (preferred) {
    const entity = await prisma.entity.findFirst({
      where: { id: preferred, org_id: orgId },
      select: {
        id: true,
        basecurrency_id: true,
        default_tax_region_id: true,
      },
    });
    if (entity) return entity;
  }
  return resolveHqLegalEntity(orgId);
}

async function resolveSupplier(
  orgId: string,
  taxId: string | null,
  supplierName: string | null,
): Promise<{
  supplier_id: string | null;
  supplier_name: string | null;
  default_tax_region_id: string | null;
  preferred_currency_id: string | null;
}> {
  if (taxId) {
    const reg = await prisma.party_tax_registration.findFirst({
      where: {
        org_id: orgId,
        party_type: 'supplier',
        registration_number: { equals: taxId, mode: 'insensitive' },
      },
      select: { party_id: true, tax_region_id: true },
    });
    if (reg?.party_id) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: reg.party_id, org_id: orgId },
        select: {
          id: true,
          supplier_name: true,
          default_tax_region_id: true,
          preferred_currency_id: true,
        },
      });
      if (supplier) {
        return {
          supplier_id: supplier.id,
          supplier_name: supplier.supplier_name,
          default_tax_region_id: supplier.default_tax_region_id || reg.tax_region_id,
          preferred_currency_id: supplier.preferred_currency_id,
        };
      }
    }
  }

  const name = String(supplierName || '').trim();
  if (name) {
    const supplier = await prisma.supplier.findFirst({
      where: {
        org_id: orgId,
        OR: [
          { supplier_name: { equals: name, mode: 'insensitive' } },
          { legal_name: { equals: name, mode: 'insensitive' } },
          { supplier_name: { contains: name, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        supplier_name: true,
        default_tax_region_id: true,
        preferred_currency_id: true,
      },
    });
    if (supplier) {
      return {
        supplier_id: supplier.id,
        supplier_name: supplier.supplier_name,
        default_tax_region_id: supplier.default_tax_region_id,
        preferred_currency_id: supplier.preferred_currency_id,
      };
    }
  }

  return {
    supplier_id: null,
    supplier_name: name || null,
    default_tax_region_id: null,
    preferred_currency_id: null,
  };
}

async function resolveTaxRegionId(
  text?: string | null,
): Promise<string | null> {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const row = await prisma.tax_region.findFirst({
    where: {
      OR: [
        { code: { equals: raw, mode: 'insensitive' } },
        { name: { equals: raw, mode: 'insensitive' } },
        { name: { contains: raw, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

type TaxGroupPool = Awaited<ReturnType<typeof loadTaxGroupsWithComponents>>;

function resolveLineTax(
  line: ExtractedLineItem,
  groups: TaxGroupPool,
): ResolvedLineItem {
  const { classification_code, classification_scheme } = classificationFromLine(line);
  const components = Array.isArray(line.tax_components) ? line.tax_components : [];
  let matched = components.length
    ? matchTaxGroupIdByComponents(components, groups)
    : null;

  // If LLM put a single component type on tax_type + tax_rate
  if (!matched && line.tax_type && line.tax_rate != null) {
    matched = matchTaxGroupIdByComponents(
      [{ name: String(line.tax_type), rate: Number(line.tax_rate) }],
      groups,
    );
  }

  if (!matched && components.length === 0 && line.tax_rate != null) {
    matched = matchTaxGroupIdByFlatRate(Number(line.tax_rate), groups);
  }

  if (matched) {
    return {
      tax_group_id: matched.id,
      tax_group_code: matched.code,
      tax_rate: line.tax_rate != null ? Number(line.tax_rate) : null,
      line_tax_amount:
        line.line_tax_amount != null ? Number(line.line_tax_amount) : null,
      classification_code,
      classification_scheme,
      match: 'tax_group',
    };
  }

  if (line.tax_rate != null && Number.isFinite(Number(line.tax_rate))) {
    return {
      tax_group_id: null,
      tax_rate: Number(line.tax_rate),
      line_tax_amount:
        line.line_tax_amount != null ? Number(line.line_tax_amount) : null,
      classification_code,
      classification_scheme,
      match: 'tax_rate',
    };
  }

  return {
    tax_group_id: null,
    tax_rate: null,
    line_tax_amount:
      line.line_tax_amount != null ? Number(line.line_tax_amount) : null,
    classification_code,
    classification_scheme,
    match: 'none',
  };
}

/**
 * Resolve extracted invoice fields to FK-ready values for bill create.
 * @param options.preferredLegalEntityId — global entity selector (falls back to HQ)
 */
export async function resolveExtractedInvoice(
  auth: AuthContext,
  extracted: ResolveExtractedInvoiceInput,
  options?: { preferredLegalEntityId?: string | null },
): Promise<ResolvedInvoiceExtract> {
  const orgId = auth.user?.org_id;
  if (!orgId) {
    return {
      lines: (extracted.line_items || []).map(() => ({ match: 'none' })),
      charges: chargesToLineItems(extracted.charges).map(() => ({ match: 'none' })),
    };
  }

  const invoice = extracted.invoice || {};
  const lines = extracted.line_items || [];
  const chargeLines = chargesToLineItems(extracted.charges);
  const context = extracted.context || {};

  const preferredFromContext =
    options?.preferredLegalEntityId ??
    (context as { preferredLegalEntityId?: string | null }).preferredLegalEntityId ??
    (context as { legal_entity_id?: string | null }).legal_entity_id ??
    null;

  const legalEntity = await resolveBillLegalEntity(orgId, preferredFromContext);
  const supplierTaxId = pickSupplierTaxId(invoice);
  const supplier = await resolveSupplier(orgId, supplierTaxId, invoice.supplier_name || null);

  const placeText = invoice.place_of_supply || invoice.supplier_region || null;
  const placeRegionId = await resolveTaxRegionId(placeText);

  // POS defaults: extracted region → supplier default → selected LE default
  const taxRegionId =
    placeRegionId ||
    supplier.default_tax_region_id ||
    legalEntity?.default_tax_region_id ||
    null;
  const sellerTaxRegionId = supplier.default_tax_region_id || placeRegionId || null;

  const currencyFromContext = await resolveCurrencyId(context.currency || null);
  let currencyId =
    currencyFromContext.currency_id ||
    supplier.preferred_currency_id ||
    legalEntity?.basecurrency_id ||
    null;
  let currencyCode = currencyFromContext.currency_code;
  if (currencyId && !currencyCode) {
    const c = await prisma.currency.findUnique({
      where: { id: currencyId },
      select: { code: true },
    });
    currencyCode = c?.code || null;
  }

  const invoiceDate = invoice.invoice_date
    ? new Date(invoice.invoice_date as string)
    : new Date();
  let exchangeRate = 1;
  if (currencyId && legalEntity?.basecurrency_id) {
    exchangeRate = await resolveLatestExchangeRate(
      currencyId,
      legalEntity.basecurrency_id,
      invoiceDate,
    );
  }

  const groups = await loadTaxGroupsWithComponents(orgId);
  const resolvedLines: ResolvedLineItem[] = lines.map((line) =>
    resolveLineTax(line, groups),
  );
  const resolvedCharges: ResolvedLineItem[] = chargeLines.map((line) =>
    resolveLineTax(line, groups),
  );

  const resolved: ResolvedInvoiceExtract = {
    supplier_id: supplier.supplier_id,
    supplier_name: supplier.supplier_name || invoice.supplier_name || null,
    currency_id: currencyId,
    currency_code: currencyCode,
    exchange_rate: exchangeRate,
    legal_entity_id: legalEntity?.id || null,
    tax_region_id: taxRegionId,
    seller_tax_region_id: sellerTaxRegionId,
    tax_responsibility: parseReverseCharge(invoice),
    supplier_tax_id: supplierTaxId,
    place_of_supply: placeText,
    payment_terms_id: await resolvePaymentTermsId(orgId, invoice.payment_terms),
    lines: resolvedLines,
    charges: resolvedCharges,
  };

  logger.debug('Resolved extracted invoice', {
    supplier_id: resolved.supplier_id,
    currency_id: resolved.currency_id,
    tax_region_id: resolved.tax_region_id,
    lineMatches: resolvedLines.map((l) => l.match),
    chargeMatches: resolvedCharges.map((l) => l.match),
  });

  return resolved;
}

/**
 * Build invoice + line create payloads merging extract + resolve (+ optional PO mapping).
 */
export function buildBillCreatePayloads(opts: {
  extracted: ResolveExtractedInvoiceInput;
  resolved: ResolvedInvoiceExtract;
  withPO?: boolean;
  purchaseOrderId?: string | null;
  poNumber?: string | null;
  poLineMapping?: Array<{ poLineItemId?: string | null } | null>;
  orgId?: string | null;
  userId?: string | null;
}): { invoicePayload: Record<string, unknown>; linePayloads: Record<string, unknown>[] } {
  const inv = opts.extracted.invoice || {};
  const lines = opts.extracted.line_items || [];
  const r = opts.resolved;
  const withPO = !!opts.withPO;

  const invoiceDate = inv.invoice_date
    ? typeof inv.invoice_date === 'string'
      ? new Date(inv.invoice_date)
      : inv.invoice_date
    : new Date();

  const invoicePayload: Record<string, unknown> = {
    ...billTypeAndPoMode(withPO ? 'With PO' : 'Without PO'),
    status: '9',
    invoice_number: inv.invoice_number ?? undefined,
    invoice_date: invoiceDate,
    supplier_name: r.supplier_name || inv.supplier_name || undefined,
    supplier_id: r.supplier_id || undefined,
    // Never pass free-text payment_terms — invoice.payment_terms is a relation.
    payment_terms_id: r.payment_terms_id || undefined,
    shipping_terms: inv.shipping_terms ?? undefined,
    shipping_method: inv.shipping_method ?? undefined,
    remit_to: inv.remit_to ?? undefined,
    ap_comment: inv.ap_comment ?? undefined,
    invoice_net_total: inv.invoice_net_total ?? inv.invoice_total ?? 0,
    invoice_total: inv.invoice_total ?? inv.invoice_net_total ?? 0,
    additional_tax: inv.additional_tax ?? 0,
    shipping_cost: inv.shipping_cost ?? 0,
    terms_and_conditions: inv.terms_and_conditions ?? undefined,
    legal_entity_id: r.legal_entity_id || undefined,
    currency_id: r.currency_id || undefined,
    exchange_rate: r.exchange_rate ?? 1,
    tax_region_id: r.tax_region_id || undefined,
    seller_tax_region_id: r.seller_tax_region_id || undefined,
    tax_responsibility: r.tax_responsibility || undefined,
  };

  if (withPO) {
    invoicePayload.po_number = opts.poNumber || inv.po_number || undefined;
    if (opts.purchaseOrderId) invoicePayload.purchase_order_id = opts.purchaseOrderId;
  }

  if (opts.orgId) invoicePayload.org_id = opts.orgId;
  if (opts.userId) {
    invoicePayload.created_by = opts.userId;
    invoicePayload.modified_by = opts.userId;
  }

  const toLinePayload = (
    line: ExtractedLineItem,
    lr: ResolvedLineItem,
    poLineItemId?: string | null,
  ): Record<string, unknown> => {
    const qty = line.invoice_qty ?? line.quantity ?? line.ordered_quantity ?? 0;
    const payload: Record<string, unknown> = {
      item_name: line.item_name ?? undefined,
      item_number: line.item_number ?? undefined,
      item_description: line.item_description ?? undefined,
      item_type: line.item_type ?? undefined,
      rate: line.rate ?? 0,
      ordered_quantity: line.ordered_quantity ?? line.quantity ?? line.invoice_qty ?? 0,
      ordered_amount: line.ordered_amount ?? line.line_total ?? line.invoiced_amount ?? 0,
      invoice_qty: qty,
      line_total: line.line_total ?? line.invoiced_amount ?? line.ordered_amount ?? undefined,
      tax_rate: lr.tax_rate ?? line.tax_rate ?? 0,
      line_tax_amount: lr.line_tax_amount ?? line.line_tax_amount ?? undefined,
      tax_group_id: lr.tax_group_id || undefined,
      classification_code: lr.classification_code || undefined,
      classification_scheme: lr.classification_scheme || undefined,
      need_by_date: line.need_by_date
        ? typeof line.need_by_date === 'string'
          ? new Date(line.need_by_date)
          : line.need_by_date
        : undefined,
    };
    if (withPO && poLineItemId) {
      payload.purchase_order_item_id = poLineItemId;
      payload.po_number = opts.poNumber || inv.po_number || undefined;
    }
    return payload;
  };

  const productPayloads = lines.map((line, i) =>
    toLinePayload(
      line,
      r.lines[i] || {},
      opts.poLineMapping?.[i]?.poLineItemId,
    ),
  );

  const chargeLines = chargesToLineItems(opts.extracted.charges);
  const chargePayloads = chargeLines.map((line, i) =>
    toLinePayload(line, r.charges?.[i] || {}, null),
  );

  return { invoicePayload, linePayloads: [...productPayloads, ...chargePayloads] };
}
