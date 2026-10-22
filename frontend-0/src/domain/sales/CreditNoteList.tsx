import Master from '@/pages/Master';

export default function CreditNoteList() {
  return (
    <Master
      type="credit_note"
      view="credit_note_edit_view"
      displayName="Credit notes"
      defaultFilters={{
        source_system_id: { is_null: true },
      }}
      createDefaults={{
        status: 'draft',
      }}
    />
  );
}
