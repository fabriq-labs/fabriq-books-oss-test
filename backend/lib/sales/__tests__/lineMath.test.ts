import { Decimal } from '@prisma/client/runtime/library';
import { computeLineAmounts } from '../invoiceTotal/lineMath';

describe('computeLineAmounts', () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof computeLineAmounts>[0];
    expected: { base: string; discount_amount: string; taxable: string };
  }> = [
    {
      name: 'basic qty × price',
      input: { quantity: 2, unit_price: 50, discount_rate: null },
      expected: { base: '100.0000', discount_amount: '0.0000', taxable: '100.0000' },
    },
    {
      name: 'null qty/price treated as zero',
      input: { quantity: null, unit_price: null, discount_rate: null },
      expected: { base: '0.0000', discount_amount: '0.0000', taxable: '0.0000' },
    },
    {
      name: '10% discount',
      input: { quantity: 1, unit_price: 200, discount_rate: 10 },
      expected: { base: '200.0000', discount_amount: '20.0000', taxable: '180.0000' },
    },
    {
      name: 'discount cannot drive taxable below zero',
      input: { quantity: 1, unit_price: 10, discount_rate: 150 },
      expected: { base: '10.0000', discount_amount: '15.0000', taxable: '0.0000' },
    },
    {
      name: 'decimal inputs',
      input: {
        quantity: new Decimal('1.5'),
        unit_price: new Decimal('10'),
        discount_rate: new Decimal('5'),
      },
      expected: { base: '15.0000', discount_amount: '0.7500', taxable: '14.2500' },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = computeLineAmounts(c.input);
      expect(result.base.toFixed(4)).toBe(c.expected.base);
      expect(result.discount_amount.toFixed(4)).toBe(c.expected.discount_amount);
      expect(result.taxable.toFixed(4)).toBe(c.expected.taxable);
    });
  }
});
