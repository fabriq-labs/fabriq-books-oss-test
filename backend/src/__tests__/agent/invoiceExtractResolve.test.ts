import {
  normalizeTaxComponentType,
  componentSignature,
  matchTaxGroupIdByComponents,
  matchTaxGroupIdByFlatRate,
  ratesEqual,
} from '../../agent/invoiceExtractResolve';

describe('invoiceExtractResolve tax group matching', () => {
  const groups = [
    {
      id: 'txgrp_demo_gst18',
      code: 'GST18',
      status: 'Active',
      components: [
        { type: 'cgst', rate: 9 },
        { type: 'sgst', rate: 9 },
      ],
    },
    {
      id: 'txgrp_demo_igst18',
      code: 'IGST18',
      status: 'Active',
      components: [{ type: 'igst', rate: 18 }],
    },
    {
      id: 'txgrp_demo_gst12',
      code: 'GST12',
      status: 'Active',
      components: [{ type: 'other', rate: 12 }],
    },
    {
      id: 'txgrp_demo_gst0',
      code: 'GST0',
      status: 'Active',
      components: [{ type: 'other', rate: 0 }],
    },
  ];

  test('normalizeTaxComponentType maps common labels', () => {
    expect(normalizeTaxComponentType('CGST 9%')).toBe('cgst');
    expect(normalizeTaxComponentType('Central GST')).toBe('cgst');
    expect(normalizeTaxComponentType('SGST')).toBe('sgst');
    expect(normalizeTaxComponentType('IGST-18')).toBe('igst');
    expect(normalizeTaxComponentType('HST')).toBe('hst');
  });

  test('componentSignature is order-insensitive', () => {
    expect(
      componentSignature([
        { type: 'sgst', rate: 9 },
        { type: 'cgst', rate: 9 },
      ]),
    ).toBe(
      componentSignature([
        { type: 'cgst', rate: 9 },
        { type: 'sgst', rate: 9 },
      ]),
    );
  });

  test('matches CGST+SGST 9/9 to GST18', () => {
    const m = matchTaxGroupIdByComponents(
      [
        { name: 'CGST', rate: 9 },
        { name: 'SGST', rate: 9 },
      ],
      groups,
    );
    expect(m?.id).toBe('txgrp_demo_gst18');
    expect(m?.code).toBe('GST18');
  });

  test('matches IGST 18', () => {
    const m = matchTaxGroupIdByComponents([{ name: 'IGST 18%', rate: 18 }], groups);
    expect(m?.id).toBe('txgrp_demo_igst18');
  });

  test('flat 18% does not invent multi-component GST18', () => {
    const m = matchTaxGroupIdByFlatRate(18, groups);
    // Only IGST18 has a single 18% component
    expect(m?.id).toBe('txgrp_demo_igst18');
  });

  test('ambiguous bare rate with no single-component group returns null', () => {
    const m = matchTaxGroupIdByFlatRate(9, groups);
    expect(m).toBeNull();
  });

  test('ratesEqual uses epsilon', () => {
    expect(ratesEqual(9, 9.005)).toBe(true);
    expect(ratesEqual(9, 9.1)).toBe(false);
  });

  test('no match when component sets differ', () => {
    const m = matchTaxGroupIdByComponents(
      [
        { name: 'CGST', rate: 9 },
        { name: 'IGST', rate: 18 },
      ],
      groups,
    );
    expect(m).toBeNull();
  });
});
