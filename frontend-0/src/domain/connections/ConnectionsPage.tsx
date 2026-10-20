import Master from '@/pages/Master';

/** Metadata-driven ERP connections list (source_system_view). */
export default function ConnectionsPage() {
  return (
    <Master type="source_system" view="source_system_view" displayName="Connections" />
  );
}
