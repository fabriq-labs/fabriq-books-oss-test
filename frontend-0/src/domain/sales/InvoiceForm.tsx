import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { viewAPI } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

const LIST_PATH = '/sales/invoices';

type LineItem = {
  id?: string;
  line_number?: number;
  description?: string | null;
  quantity?: string | number | null;
  unit_price?: string | number | null;
  amount?: string | number | null;
  item_master?: { id?: string; name?: string; code?: string | null } | null;
};

type InvoiceRow = {
  id?: string;
  number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  direction?: string | null;
  net_amount?: string | number | null;
  tax_amount?: string | number | null;
  total_amount?: string | number | null;
  balance_amount?: string | number | null;
  bill_to?: string | null;
  ship_to?: string | null;
  notes?: string | null;
  reference?: string | null;
  source_system_id?: string | null;
  source_record_id?: string | null;
  customer?: { id?: string; name?: string; email?: string | null } | null;
  currency?: { id?: string; code?: string; name?: string } | null;
  entity?: { id?: string; name?: string } | null;
  line_items?: LineItem[];
};

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export const InvoiceForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [row, setRow] = useState<InvoiceRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!id || !viewId) return;
    setIsLoading(true);
    viewAPI
      .getById('invoice', id, viewId)
      .then((res: { data?: InvoiceRow }) => {
        setRow(res.data ?? null);
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load invoice' });
        setRow(null);
      })
      .finally(() => setIsLoading(false));
  }, [id, viewId, toast]);

  const lines = Array.isArray(row?.line_items) ? [...row.line_items] : [];
  lines.sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

  return (
    <div className="mx-auto w-[90%] max-w-5xl space-y-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {row?.number ? `Invoice ${row.number}` : 'Invoice'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {row?.source_system_id
              ? 'Synced from QuickBooks — line items from the transform.'
              : id
                ? 'Invoice detail'
                : 'Create is not wired yet; open a synced invoice from the list.'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate(LIST_PATH)}
        >
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !id ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Creating invoices in-app is a later step. Synced invoices are on the list.
          </CardContent>
        </Card>
      ) : !row ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Invoice not found.</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Header</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="Customer">{row.customer?.name ?? '—'}</Field>
              <Field label="Status">{row.status ?? '—'}</Field>
              <Field label="Direction">{row.direction ?? '—'}</Field>
              <Field label="Invoice date">{dateLabel(row.invoice_date)}</Field>
              <Field label="Due date">{dateLabel(row.due_date)}</Field>
              <Field label="Currency">{row.currency?.code ?? '—'}</Field>
              <Field label="Net">{money(row.net_amount)}</Field>
              <Field label="Tax">{money(row.tax_amount)}</Field>
              <Field label="Total">{money(row.total_amount)}</Field>
              <Field label="Balance">{money(row.balance_amount)}</Field>
              <Field label="Entity">{row.entity?.name ?? '—'}</Field>
              <Field label="Reference">{row.reference ?? '—'}</Field>
              {row.source_record_id ? (
                <Field label="QBO id">{row.source_record_id}</Field>
              ) : null}
              {row.bill_to ? (
                <div className="col-span-2 md:col-span-3">
                  <Field label="Bill to">
                    <span className="whitespace-pre-wrap">{row.bill_to}</span>
                  </Field>
                </div>
              ) : null}
              {row.notes ? (
                <div className="col-span-2 md:col-span-3">
                  <Field label="Notes">
                    <span className="whitespace-pre-wrap">{row.notes}</span>
                  </Field>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Line items ({lines.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items on this invoice.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">#</th>
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="py-2 pr-3 font-medium">Description</th>
                        <th className="py-2 pr-3 text-right font-medium">Qty</th>
                        <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                        <th className="py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id ?? `${line.line_number}-${line.description}`} className="border-b last:border-0">
                          <td className="py-2 pr-3">{line.line_number ?? '—'}</td>
                          <td className="py-2 pr-3">{line.item_master?.name ?? line.item_master?.code ?? '—'}</td>
                          <td className="py-2 pr-3">{line.description ?? '—'}</td>
                          <td className="py-2 pr-3 text-right">{money(line.quantity)}</td>
                          <td className="py-2 pr-3 text-right">{money(line.unit_price)}</td>
                          <td className="py-2 text-right">{money(line.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default InvoiceForm;
