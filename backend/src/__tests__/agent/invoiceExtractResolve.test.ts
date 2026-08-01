import {
  normalizeTaxComponentType,
  componentSignature,
  matchTaxGroupIdByComponents,
  matchTaxGroupIdByFlatRate,
  ratesEqual,
  chargesToLineItems,
  sanitizeChargeTaxFields,
  buildBillCreatePayloads,
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

describe('invoiceExtractResolve charges', () => {
  test('sanitizeChargeTaxFields drops fee % mis-copied as tax_rate', () => {
    const cleaned = sanitizeChargeTaxFields({
      charge_type: 'service_charge',
      label: 'Service Charge @ 10%',
      amount: 69.5,
      tax_rate: 10,
      line_tax_amount: 0,
    });
    expect(cleaned.tax_rate).toBeNull();
    expect(cleaned.line_tax_amount).toBeNull();
    expect(cleaned.charge_percent).toBe(10);
    expect(cleaned.label).toBe('Service Charge');
  });

  test('sanitizeChargeTaxFields keeps real GST when charge_percent differs', () => {
    const cleaned = sanitizeChargeTaxFields({
      label: 'Service Charge',
      amount: 69.5,
      charge_percent: 10,
      tax_rate: 5,
      tax_components: [
        { name: 'CGST', rate: 2.5 },
        { name: 'SGST', rate: 2.5 },
      ],
    });
    expect(cleaned.tax_rate).toBe(5);
    expect(cleaned.charge_percent).toBe(10);
  });

  test('chargesToLineItems maps taxable service charge to item_type=charge', () => {
    const lines = chargesToLineItems([
      {
        charge_type: 'service_charge',
        label: 'Service Charge',
        amount: 50,
        taxable: true,
        tax_rate: 18,
        tax_components: [
          { name: 'CGST', rate: 9, amount: 4.5 },
          { name: 'SGST', rate: 9, amount: 4.5 },
        ],
        line_tax_amount: 9,
      },
      {
        charge_type: 'convenience_fee',
        amount: 10,
        tax_rate: 18,
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].item_type).toBe('charge');
    expect(lines[0].item_name).toBe('Service Charge');
    expect(lines[0].rate).toBe(50);
    expect(lines[0].invoice_qty).toBe(1);
    expect(lines[1].item_name).toBe('Convenience fee');
  });

  test('chargesToLineItems strips @N% tax_rate confusion before mapping', () => {
    const lines = chargesToLineItems([
      {
        charge_type: 'service_charge',
        label: 'Service Charge @ 10%',
        amount: 69.5,
        tax_rate: 10,
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].rate).toBe(69.5);
    expect(lines[0].item_name).toBe('Service Charge');
    expect(lines[0].tax_rate).toBeNull();
  });

  test('buildBillCreatePayloads appends charge lines after products without PO mapping', () => {
    const { linePayloads } = buildBillCreatePayloads({
      extracted: {
        invoice: { invoice_number: 'INV-C1' },
        line_items: [{ item_name: 'Widget', rate: 100, invoice_qty: 1, line_total: 100 }],
        charges: [
          {
            charge_type: 'service_charge',
            label: 'Service Charge',
            amount: 50,
            tax_rate: 18,
            line_tax_amount: 9,
          },
        ],
      },
      resolved: {
        lines: [{ tax_group_id: 'txgrp_demo_gst18', tax_rate: 18, match: 'tax_group' }],
        charges: [{ tax_group_id: 'txgrp_demo_gst18', tax_rate: 18, match: 'tax_group' }],
      },
      withPO: true,
      purchaseOrderId: 'po_1',
      poNumber: 'PO000001',
      poLineMapping: [{ poLineItemId: 'poi_1' }],
    });
    expect(linePayloads).toHaveLength(2);
    expect(linePayloads[0].item_name).toBe('Widget');
    expect(linePayloads[0].purchase_order_item_id).toBe('poi_1');
    expect(linePayloads[1].item_type).toBe('charge');
    expect(linePayloads[1].item_name).toBe('Service Charge');
    expect(linePayloads[1].rate).toBe(50);
    expect(linePayloads[1].tax_group_id).toBe('txgrp_demo_gst18');
    expect(linePayloads[1].purchase_order_item_id).toBeUndefined();
  });
});
