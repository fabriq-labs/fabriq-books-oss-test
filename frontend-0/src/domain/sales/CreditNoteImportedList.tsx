import Master from '@/pages/Master';

export default function CreditNoteImportedList() {
  return (
    <Master
      type="credit_note"
      view="credit_note_readonly_view"
      displayName="Imported credit notes"
      isCreate={false}
      defaultFilters={{
        source_system_id: { is_not_null: true },
      }}
    />
  );
}
