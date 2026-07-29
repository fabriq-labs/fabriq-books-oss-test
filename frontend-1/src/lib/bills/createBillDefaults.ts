import { viewAPI } from '@/api/api';
import { billTypeAndPoMode, DEFAULT_BILL_PO_MODE } from '@/lib/bills/poMode';

export type NewBillCreateOptions = {
  /** Prefer global entity switcher selection; falls back to HQ when omitted/null. */
  preferredLegalEntityId?: string | null;
};

async function fetchEntityById(id: string): Promise<any | null> {
  try {
    const res: any = await viewAPI.getById('entity', id, 'entity_view');
    return res?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchHeadquartersEntity(): Promise<any | null> {
  const res: any = await viewAPI.search(
    'entity',
    'entity_view',
    1,
    1,
    '',
    { is_it_headquartres: { eq: 'Yes' } },
    {},
  );
  return Array.isArray(res?.data) ? res.data[0] : null;
}

/** Default payload fields for a new purchase bill (Without PO + legal entity). */
export async function buildNewBillCreatePayload(
  extras: Record<string, unknown> = {},
  options: NewBillCreateOptions = {},
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    status: '9',
    ...billTypeAndPoMode(DEFAULT_BILL_PO_MODE),
    ...extras,
  };

  try {
    const preferredId =
      typeof options.preferredLegalEntityId === 'string' &&
      options.preferredLegalEntityId.trim()
        ? options.preferredLegalEntityId.trim()
        : null;

    let entity: any | null = null;
    if (preferredId) {
      entity = await fetchEntityById(preferredId);
    }
    if (!entity?.id) {
      entity = await fetchHeadquartersEntity();
    }

    if (entity?.id) {
      payload.legal_entity_id = entity.id;
      if (entity.default_tax_region_id) {
        payload.tax_region_id = entity.default_tax_region_id;
      }
      if (entity.basecurrency_id) {
        payload.currency_id = entity.basecurrency_id;
        payload.exchange_rate = 1;
      }
    }
  } catch (e) {
    console.error('Failed to resolve legal entity for new bill:', e);
  }

  return payload;
}
