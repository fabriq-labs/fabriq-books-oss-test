import { useParams } from 'react-router-dom';
import Master from '@/pages/Master';

/** List screen for any domain model that has a view named `{model}_view`. */
export default function DomainMaster() {
  const { model } = useParams();
  const name = model || 'record';
  const label = name.replace(/_/g, ' ');
  return (
    <Master
      type={name}
      view={`${name}_view`}
      displayName={label}
    />
  );
}
