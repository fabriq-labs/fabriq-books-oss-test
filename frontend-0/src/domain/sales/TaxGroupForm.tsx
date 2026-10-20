import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { viewAPI } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

const LIST_PATH = '/masters/tax-groups';

type ComponentRow = {
  id?: string;
  sequence?: number;
  tax_master?: { id?: string; name?: string; code?: string; rate?: string | number | null } | null;
};

type TaxGroupRow = {
  id?: string;
  name?: string | null;
  code?: string | null;
  country_code?: string | null;
  is_active?: boolean;
  source_system_id?: string | null;
  source_record_id?: string | null;
  components?: ComponentRow[];
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export const TaxGroupForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [row, setRow] = useState<TaxGroupRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!id || !viewId) return;
    setIsLoading(true);
    viewAPI
      .getById('tax_group', id, viewId)
      .then((res: { data?: TaxGroupRow }) => setRow(res.data ?? null))
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load tax group' });
        setRow(null);
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId, toast]);

  const components = Array.isArray(row?.components) ? [...row.components] : [];
  components.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  return (
    <div className="mx-auto w-[90%] max-w-4xl space-y-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{row?.name || 'Tax group'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {row?.source_system_id
              ? 'Synced from QuickBooks tax codes.'
              : id
                ? 'Tax group detail'
                : 'Open a tax group from the list.'}
          </p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !id || !row ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {!id ? 'Creating tax groups in-app is a later step.' : 'Tax group not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Header</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="Code">{row.code ?? '—'}</Field>
              <Field label="Country">{row.country_code ?? '—'}</Field>
              <Field label="Active">{row.is_active === false ? 'No' : 'Yes'}</Field>
              {row.source_record_id ? <Field label="QBO id">{row.source_record_id}</Field> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Components ({components.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {components.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rate components on this group.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Rate</th>
                      <th className="py-2 pr-3 font-medium">Code</th>
                      <th className="py-2 text-right font-medium">Rate value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((c) => (
                      <tr key={c.id ?? `${c.sequence}-${c.tax_master?.id}`} className="border-b last:border-0">
                        <td className="py-2 pr-3">{c.sequence ?? '—'}</td>
                        <td className="py-2 pr-3">{c.tax_master?.name ?? '—'}</td>
                        <td className="py-2 pr-3">{c.tax_master?.code ?? '—'}</td>
                        <td className="py-2 text-right">
                          {c.tax_master?.rate != null ? String(c.tax_master.rate) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TaxGroupForm;
