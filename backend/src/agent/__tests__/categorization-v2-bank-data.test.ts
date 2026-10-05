/**
 * Categorization V2 — Real Bank Description Tests
 *
 * Representative synthetic data based on actual ICICI and Kotak statement formats.
 * Covers savings accounts and credit cards for each bank.
 * No DB, no LLM — pure normalizeDescription tests (legacy merchant key path).
 */

import { normalizeDescription } from '../handlers/erp/utils/categorizationUtils';

// ─── ICICI Savings Account ────────────────────────────────────────────────────

describe('ICICI Savings — normalizeDescription', () => {
  it('UPI debit: strips rail + ref number, keeps vendor name', () => {
    const result = normalizeDescription('UPI/DR/423156789012/SWIGGY INDIA PVTLTD/OKICICI');
    expect(result).toContain('swiggy');
    expect(result).not.toContain('423156789012');
    expect(result).not.toContain('upi');
  });

  it('NEFT: strips TRF sub-prefix + IFSC code, keeps beneficiary', () => {
    const result = normalizeDescription('NEFT/TRF/ICIC22345678901234/AMAZON SELLER SERVICES');
    expect(result).toContain('amazon seller');
    expect(result).not.toContain('trf');
    expect(result).not.toContain('icic');
  });

  it('IMPS (MMT prefix): strips MMT + ref number, keeps vendor', () => {
    const result = normalizeDescription('MMT/IMPS/412345678901/ZOMATO LIMITED');
    expect(result).toContain('zomato');
    expect(result).not.toContain('mmt');
    expect(result).not.toContain('412345678901');
  });

  it('EBA (ICICI Direct): preserves eba token', () => {
    const result = normalizeDescription('EBA/20260315/ICICI DIRECT/SELL');
    expect(result).toContain('eba');
    expect(result).not.toContain('20260315');
  });
});

// ─── Kotak Savings Account ────────────────────────────────────────────────────

describe('Kotak Savings — normalizeDescription', () => {
  it('ATW (own ATM withdrawal): strips ATW + decimal amount, result is empty or whitespace', () => {
    const result = normalizeDescription('ATW 5000.00');
    expect(result).not.toContain('atw');
    expect(result).not.toContain('5000.00');
  });

  it('NEFT: strips Kotak IFSC code, keeps beneficiary name', () => {
    const result = normalizeDescription('NEFT-KKBK0001234/PRASANNA JAGANATHAN');
    expect(result).toContain('prasanna jaganathan');
    expect(result).not.toContain('kkbk');
  });

  it('ECS loan EMI: strips ECS + bank name, keeps purpose', () => {
    const result = normalizeDescription('ECS DR HDFC BANK LTD HOME LOAN EMI');
    expect(result).toContain('home loan');
    expect(result).not.toContain('hdfc bank');
    expect(result).not.toContain('ecs');
  });

  it('UPI with @handle: strips ref, keeps vendor portion of handle', () => {
    const result = normalizeDescription('UPI/DR/202410151234/ZOMATO@KOTAK');
    expect(result).toContain('zomato');
    expect(result).not.toContain('202410151234');
  });
});

// ─── US debit card (Truist-style) ─────────────────────────────────────────────

describe('US debit card — normalizeDescription', () => {
  it('PIN layout: Office Depot keeps merchant, not rail prefix', () => {
    const result = normalizeDescription(
      'DEBIT CARD PURCHASE-PIN 12-27-24 GERMANTOWN TN 2356 OFFICE DEPOT 00 1275 S GE'
    );
    expect(result).toContain('office depot');
    expect(result).not.toContain('debit card');
    expect(result).not.toContain('germantown');
  });

  it('PIN layout: Marathon gas key stays distinct from Office Depot', () => {
    const officeNorm = normalizeDescription(
      'DEBIT CARD PURCHASE-PIN 12-27-24 GERMANTOWN TN 2356 OFFICE DEPOT 00 1275 S GE'
    );
    const gasNorm = normalizeDescription(
      'DEBIT CARD PURCHASE-PIN 12-12-24 MEMPHIS 2356 SUMMER AVE MARAT'
    );
    expect(officeNorm).toContain('office depot');
    expect(gasNorm).not.toContain('office depot');
    expect(officeNorm).not.toBe(gasNorm);
  });

  it('non-PIN layout: Uber keeps merchant tokens', () => {
    const result = normalizeDescription(
      'DEBIT CARD PURCHASE UBER *TRIP 11-01 HELP.UBER.COM CA 2356'
    );
    expect(result).toContain('uber');
    expect(result).not.toContain('debit');
  });
});

// ─── Credit Card Descriptions (clean merchant names) ─────────────────────────

describe('Credit card — normalizeDescription', () => {
  it('ICICI CC: clean merchant POS entry passes through intact', () => {
    const result = normalizeDescription('SWIGGY FOOD DELIVERY BENGALURU');
    expect(result).toContain('swiggy food delivery');
  });

  it('Kotak CC: merchant with city suffix', () => {
    const result = normalizeDescription('ZOMATO ONLINE FOOD MUMBAI');
    expect(result).toContain('zomato online food');
  });
});
