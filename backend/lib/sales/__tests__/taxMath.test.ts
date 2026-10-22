import { computeLineTax, computeManualTax } from '../invoiceTotal/taxMath';

describe('computeLineTax', () => {
  it('sums component taxes at percent rates', () => {
    const { taxRows, taxTotal } = computeLineTax({
      taxable: 100,
      components: [
        { tax_master_id: 'tax_cgst', rate: 9, component_type: 'CGST' },
        { tax_master_id: 'tax_sgst', rate: 9, component_type: 'SGST' },
      ],
    });
    expect(taxRows).toHaveLength(2);
    expect(taxRows[0].amount.toFixed(4)).toBe('9.0000');
    expect(taxRows[1].amount.toFixed(4)).toBe('9.0000');
    expect(taxTotal.toFixed(4)).toBe('18.0000');
  });

  it('returns zero tax for empty components', () => {
    const { taxRows, taxTotal } = computeLineTax({ taxable: 50, components: [] });
    expect(taxRows).toEqual([]);
    expect(taxTotal.toFixed(4)).toBe('0.0000');
  });
});

describe('computeManualTax', () => {
  it('computes a single percent row without tax_master_id', () => {
    const row = computeManualTax({ taxable: 200, ratePercent: 18 });
    expect(row.tax_master_id).toBeNull();
    expect(row.amount.toFixed(4)).toBe('36.0000');
    expect(row.taxTotal.toFixed(4)).toBe('36.0000');
  });
});
