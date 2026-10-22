import Master from '@/pages/Master';

export default function PaymentReceiptImportedList() {
  return (
    <Master
      type="payment_receipt"
      view="payment_receipt_readonly_view"
      displayName="Imported payments"
      isCreate={false}
      defaultFilters={{
        source_system_id: { is_not_null: true },
      }}
    />
  );
}
