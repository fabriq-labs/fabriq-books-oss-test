import { computeHeaderTotals } from '../invoiceTotal/headerMath';

describe('computeHeaderTotals', () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof computeHeaderTotals>[0];
    expected: { net: string; tax: string; total: string };
  }> = [
    {
      name: 'lines only',
      input: { lineTaxables: [100, 50], lineTaxes: [18, 9] },
      expected: { net: '150.0000', tax: '27.0000', total: '177.0000' },
    },
    {
      name: 'with shipping and adjustment',
      input: {
        lineTaxables: [100],
        lineTaxes: [0],
        shipping_amount: 10,
        adjustment_amount: -5,
      },
      expected: { net: '100.0000', tax: '0.0000', total: '105.0000' },
    },
    {
      name: 'empty lines',
      input: { lineTaxables: [], lineTaxes: [] },
      expected: { net: '0.0000', tax: '0.0000', total: '0.0000' },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const { net_amount, tax_amount, total_amount } = computeHeaderTotals(c.input);
      expect(net_amount.toFixed(4)).toBe(c.expected.net);
      expect(tax_amount.toFixed(4)).toBe(c.expected.tax);
      expect(total_amount.toFixed(4)).toBe(c.expected.total);
    });
  }
});
