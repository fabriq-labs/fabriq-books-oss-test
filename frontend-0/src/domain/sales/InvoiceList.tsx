import Master from '@/pages/Master';

/** Books-authored sales invoices (lineage null). */
export default function InvoiceList() {
  return (
    <Master
      type="invoice"
      view="invoice_edit_view"
      displayName="Invoices"
      defaultFilters={{
        direction: { eq: 'sales' },
        source_system_id: { is_null: true },
      }}
      createDefaults={{
        direction: 'sales',
        status: 'draft',
      }}
    />
  );
}
