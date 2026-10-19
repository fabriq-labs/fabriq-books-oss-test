import Master from '@/pages/Master';

/** Sales invoices only (synced QBO rows use direction=sales). */
export default function InvoiceList() {
  return (
    <Master
      type="invoice"
      view="invoice_view"
      displayName="Invoices"
      defaultFilters={{ direction: { eq: 'sales' } }}
    />
  );
}
