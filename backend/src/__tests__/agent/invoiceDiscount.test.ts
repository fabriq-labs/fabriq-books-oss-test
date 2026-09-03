import {
  applyHeaderDiscountToLines,
  normalizeLineDiscount,
  lineGrossBase,
  type DiscountExtractBlob,
} from '../../agent/invoiceDiscount';

describe('invoiceDiscount normalizeLineDiscount', () => {
  test('derives amount from % only', () => {
    const n = normalizeLineDiscount({
      rate: 100,
      invoice_qty: 2,
      discount_rate: 10,
    });
    expect(lineGrossBase({ rate: 100, invoice_qty: 2 })).toBe(200);
    expect(n.discount_amount).toBe(20);
    expect(n.discount_rate).toBe(10);
  });

  test('derives % from $ only', () => {
    const n = normalizeLineDiscount({
      rate: 100,
      invoice_qty: 1,
      discount_amount: 5,
    });
    expect(n.discount_rate).toBe(5);
    expect(n.discount_amount).toBe(5);
  });
});

describe('applyHeaderDiscountToLines', () => {
  test('no discounts → unchanged blob (no discount_allocated)', () => {
    const input: DiscountExtractBlob = {
      invoice: { invoice_number: 'A1' },
      line_items: [{ item_name: 'W', rate: 100, invoice_qty: 1 }],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out).toBe(input);
    expect(out.invoice?.discount_allocated).toBeUndefined();
  });

  test('already allocated → no-op', () => {
    const input: DiscountExtractBlob = {
      invoice: {
        discount_amount: 40,
        discount_allocated: true,
      },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1, discount_rate: 99 },
        { item_name: 'B', rate: 300, invoice_qty: 1, discount_rate: 99 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out).toBe(input);
    expect(out.line_items?.[0].discount_rate).toBe(99);
  });

  test('line % discount only → persisted discount_rate + amount', () => {
    const input: DiscountExtractBlob = {
      invoice: {},
      line_items: [
        {
          item_name: 'Widget',
          rate: 100,
          invoice_qty: 2,
          discount_rate: 10,
        },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.invoice?.discount_allocated).toBe(true);
    expect(out.line_items?.[0].discount_rate).toBe(10);
    expect(out.line_items?.[0].discount_amount).toBe(20);
    expect(out.line_items?.[0].rate).toBe(100);
  });

  test('line $ discount only → derived %', () => {
    const input: DiscountExtractBlob = {
      invoice: {},
      line_items: [
        {
          item_name: 'Widget',
          rate: 50,
          invoice_qty: 2,
          discount_amount: 5,
        },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.line_items?.[0].discount_amount).toBe(5);
    expect(out.line_items?.[0].discount_rate).toBe(5);
  });

  test('header $ only (two lines) → proportional shares; last gets remainder', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_amount: 40 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1 },
        { item_name: 'B', rate: 300, invoice_qty: 1 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    const a = out.line_items![0];
    const b = out.line_items![1];
    expect(a.discount_amount).toBe(10);
    expect(b.discount_amount).toBe(30);
    expect(roundish(Number(a.discount_rate))).toBe(10);
    expect(roundish(Number(b.discount_rate))).toBe(10);
    expect(round2(Number(a.discount_amount) + Number(b.discount_amount))).toBe(40);
    expect(out.invoice?.discount_amount).toBe(40);
    expect(out.invoice?.discount_allocated).toBe(true);
  });

  test('header % only → equivalent $ on remaining bases', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_rate: 10 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1 },
        { item_name: 'B', rate: 300, invoice_qty: 1 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.line_items?.[0].discount_amount).toBe(10);
    expect(out.line_items?.[1].discount_amount).toBe(30);
  });

  test('line + header stacked → header on remaining base', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_rate: 10 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1, discount_rate: 5 },
        { item_name: 'B', rate: 300, invoice_qty: 1 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    const a = out.line_items![0];
    const b = out.line_items![1];
    expect(a.discount_amount).toBe(14.5); // 5 + 9.5
    expect(b.discount_amount).toBe(30);
    expect(round2(Number(a.discount_amount) + Number(b.discount_amount))).toBe(44.5);
  });

  test('rounding remainder lands on last line', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_amount: 1 },
      line_items: [
        { item_name: 'A', rate: 10, invoice_qty: 1 },
        { item_name: 'B', rate: 10, invoice_qty: 1 },
        { item_name: 'C', rate: 10, invoice_qty: 1 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    const shares = out.line_items!.map((l) => Number(l.discount_amount));
    expect(round2(shares.reduce((s, x) => s + x, 0))).toBe(1);
    expect(shares[0]).toBe(0.33);
    expect(shares[1]).toBe(0.33);
    expect(shares[2]).toBe(0.34);
  });

  test('charges[] not in allocation base; product rates unchanged', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_amount: 40 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1 },
        { item_name: 'B', rate: 300, invoice_qty: 1 },
      ],
      charges: [{ label: 'Freight', amount: 50, tax_rate: 18 }],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.line_items?.[0].discount_amount).toBe(10);
    expect(out.line_items?.[1].discount_amount).toBe(30);
    expect(out.line_items?.[0].rate).toBe(100);
    expect(out.line_items?.[1].rate).toBe(300);
    expect((out.charges as any[])[0].amount).toBe(50);
  });

  test('item_type=charge in line_items excluded from allocation', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_amount: 10 },
      line_items: [
        { item_name: 'Goods', rate: 100, invoice_qty: 1 },
        { item_name: 'Freight', rate: 50, invoice_qty: 1, item_type: 'charge' },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.line_items?.[0].discount_amount).toBe(10);
    expect(out.line_items?.[1].discount_amount ?? 0).toBe(0);
    expect(out.line_items?.[1].discount_rate ?? 0).toBe(0);
  });

  test('leakage: every line same % as header → clear then allocate once', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_rate: 10, discount_amount: 40 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1, discount_rate: 10 },
        { item_name: 'B', rate: 300, invoice_qty: 1, discount_rate: 10 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.line_items?.[0].discount_amount).toBe(10);
    expect(out.line_items?.[1].discount_amount).toBe(30);
  });

  test('mixed per-line %s are kept (no leakage clear)', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_rate: 10 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1, discount_rate: 5 },
        { item_name: 'B', rate: 300, invoice_qty: 1, discount_rate: 10 },
      ],
    };
    const out = applyHeaderDiscountToLines(input);
    expect(out.line_items?.[0].discount_amount).toBe(14.5);
    expect(out.line_items?.[1].discount_amount).toBe(57);
  });

  test('second call is no-op after discount_allocated', () => {
    const input: DiscountExtractBlob = {
      invoice: { discount_amount: 40 },
      line_items: [
        { item_name: 'A', rate: 100, invoice_qty: 1 },
        { item_name: 'B', rate: 300, invoice_qty: 1 },
      ],
    };
    const first = applyHeaderDiscountToLines(input);
    const second = applyHeaderDiscountToLines(first);
    expect(second).toBe(first);
  });
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function roundish(n: number): number {
  return Math.round(n * 100) / 100;
}
