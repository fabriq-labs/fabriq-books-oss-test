import Master from '@/pages/Master';

/** Connector-fed sales invoices — view only, no Create. */
export default function InvoiceImportedList() {
  return (
    <Master
      type="invoice"
      view="invoice_readonly_view"
      displayName="Imported invoices"
      isCreate={false}
      defaultFilters={{
        direction: { eq: 'sales' },
        source_system_id: { is_not_null: true },
      }}
    />
  );
}
