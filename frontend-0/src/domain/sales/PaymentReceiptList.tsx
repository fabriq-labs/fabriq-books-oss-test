import Master from '@/pages/Master';

export default function PaymentReceiptList() {
  return (
    <Master
      type="payment_receipt"
      view="payment_receipt_view"
      displayName="Payments received"
    />
  );
}
