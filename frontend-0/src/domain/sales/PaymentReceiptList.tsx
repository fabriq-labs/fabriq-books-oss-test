import Master from '@/pages/Master';

export default function PaymentReceiptList() {
  return (
    <Master
      type="payment_receipt"
      view="payment_receipt_edit_view"
      displayName="Payments received"
      defaultFilters={{
        source_system_id: { is_null: true },
      }}
      createDefaults={{
        status: 'draft',
      }}
    />
  );
}
