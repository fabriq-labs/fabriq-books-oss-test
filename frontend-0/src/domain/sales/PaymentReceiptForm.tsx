import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { viewAPI } from '@/api/api';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import DocumentFooter from './DocumentFooter';
import {
  isEditableSource,
  resolveDocumentActions,
  viewCapability,
  type DocumentActionId,
} from './documentActions';
import { moneyLabel, todayIsoDate, toNumber } from './lineMath';
import { newLineKey } from './SalesLineEditor';

const LIST_PATH = '/sales/payments';
const EDIT_VIEW = 'payment_receipt_edit_view';

const schema = z.object({
  number: z.string().optional(),
  receipt_date: z.string().min(1, { message: 'Date is required' }),
  customer_id: z.string().min(1, { message: 'Customer is required' }),
  entity_id: z.string().optional(),
  currency_id: z.string().min(1, { message: 'Currency is required' }),
  account_id: z.string().min(1, { message: 'Deposit account is required' }),
  amount: z.string().min(1, { message: 'Amount is required' }),
  payment_method: z.string().optional(),
  payment_reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type AppDraft = {
  key: string;
  id?: string;
  invoice_id: string;
  invoice?: { id?: string; number?: string | null; balance_amount?: string | number | null } | null;
  amount_applied: string;
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export const PaymentReceiptForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const formView = viewId || EDIT_VIEW;
  const capability = viewCapability(formView);

  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('draft');
  const [sourceSystemId, setSourceSystemId] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | undefined>(id);
  const [apps, setApps] = useState<AppDraft[]>([]);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [unapplied, setUnapplied] = useState<string | number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      number: '',
      receipt_date: todayIsoDate(),
      customer_id: '',
      entity_id: '',
      currency_id: '',
      account_id: '',
      amount: '',
      payment_method: '',
      payment_reference: '',
      notes: '',
    },
  });

  const readOnly =
    capability === 'readonly' ||
    !isEditableSource(sourceSystemId) ||
    status === 'posted' ||
    status === 'void';
  const draftEditable = !readOnly && (status === 'draft' || !recordId);

  useEffect(() => {
    const invoiceId = searchParams.get('invoice_id');
    if (!id && invoiceId) {
      viewAPI
        .getById('invoice', invoiceId, 'invoice_edit_view')
        .then((res: any) => {
          const inv = res.data;
          if (!inv) return;
          form.setValue('customer_id', inv.customer_id || '');
          setCustomer(inv.customer ?? null);
          if (inv.currency_id) {
            form.setValue('currency_id', inv.currency_id);
            setCurrency(inv.currency ?? { id: inv.currency_id });
          }
          if (inv.entity_id) {
            form.setValue('entity_id', inv.entity_id);
            setEntity(inv.entity ?? { id: inv.entity_id });
          }
          const bal = inv.balance_amount != null ? String(inv.balance_amount) : '';
          if (bal) form.setValue('amount', bal);
          setApps([
            {
              key: newLineKey(),
              invoice_id: inv.id,
              invoice: {
                id: inv.id,
                number: inv.number,
                balance_amount: inv.balance_amount,
              },
              amount_applied: bal || '0',
            },
          ]);
        })
        .catch(() => {
          /* ignore prefill errors */
        });
    }
  }, [id, searchParams, form]);

  useEffect(() => {
    if (!id || !formView) return;
    setIsLoading(true);
    viewAPI
      .getById('payment_receipt', id, formView)
      .then((res: any) => {
        const row = res.data ?? {};
        setRecordId(row.id);
        setStatus(row.status || 'draft');
        setSourceSystemId(row.source_system_id ?? null);
        setCustomer(row.customer ?? null);
        setEntity(row.entity ?? null);
        setCurrency(row.currency ?? null);
        setAccount(row.account ?? null);
        setUnapplied(row.unapplied_amount);
        form.reset({
          number: row.number || '',
          receipt_date: row.receipt_date ? String(row.receipt_date).slice(0, 10) : todayIsoDate(),
          customer_id: row.customer_id || '',
          entity_id: row.entity_id || '',
          currency_id: row.currency_id || '',
          account_id: row.account_id || '',
          amount: row.amount != null ? String(row.amount) : '',
          payment_method: row.payment_method || '',
          payment_reference: row.payment_reference || '',
          notes: row.notes || '',
        });
        const applications = Array.isArray(row.applications) ? row.applications : [];
        setApps(
          applications.map((a: any) => ({
            key: a.id || newLineKey(),
            id: a.id,
            invoice_id: a.invoice_id || a.invoice?.id || '',
            invoice: a.invoice ?? null,
            amount_applied: a.amount_applied != null ? String(a.amount_applied) : '0',
          }))
        );
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load payment' });
      })
      .finally(() => setIsLoading(false));
  }, [id, formView, form, toast]);

  const appliedSum = useMemo(
    () => apps.reduce((s, a) => s + toNumber(a.amount_applied), 0),
    [apps]
  );
  const amountWatch = toNumber(form.watch('amount'));
  const previewUnapplied = amountWatch - appliedSum;

  const actions = resolveDocumentActions({
    capability: draftEditable || (status === 'posted' && isEditableSource(sourceSystemId)) ? 'edit' : 'readonly',
    status: recordId ? status : 'new',
    sourceSystemId,
    settlementActions: false,
  });

  const headerPayload = (data: FormValues, nextStatus?: string) => ({
    number: blank(data.number),
    receipt_date: data.receipt_date,
    customer_id: data.customer_id,
    entity_id: blank(data.entity_id),
    currency_id: data.currency_id,
    account_id: data.account_id,
    amount: data.amount,
    payment_method: blank(data.payment_method),
    payment_reference: blank(data.payment_reference),
    notes: blank(data.notes),
    status: nextStatus || status || 'draft',
    invoice_id: apps.length === 1 ? apps[0].invoice_id || null : null,
  });

  const syncApps = async (receiptId: string, current: AppDraft[]) => {
    const existing = await viewAPI.getById('payment_receipt', receiptId, formView);
    const serverApps: any[] = Array.isArray(existing?.data?.applications)
      ? existing.data.applications
      : [];
    const serverIds = new Set(serverApps.map((a) => a.id).filter(Boolean));
    const keepIds = new Set(current.map((a) => a.id).filter(Boolean) as string[]);

    for (const s of serverApps) {
      if (s.id && !keepIds.has(s.id)) {
        await viewAPI.deleteChild('payment_receipt', receiptId, formView, 'applications', s.id);
      }
    }

    for (const app of current) {
      if (!app.invoice_id) continue;
      const payload = {
        target_type: 'invoice',
        invoice_id: app.invoice_id,
        amount_applied: app.amount_applied || '0',
        applied_date: todayIsoDate(),
      };
      if (app.id && serverIds.has(app.id)) {
        await viewAPI.updateChild(
          'payment_receipt',
          receiptId,
          formView,
          'applications',
          app.id,
          payload
        );
      } else {
        await viewAPI.addChild('payment_receipt', receiptId, formView, 'applications', payload);
      }
    }
  };

  const reload = async (receiptId: string) => {
    const res = await viewAPI.getById('payment_receipt', receiptId, formView);
    const row = res.data ?? {};
    setStatus(row.status || 'draft');
    setUnapplied(row.unapplied_amount);
    const applications = Array.isArray(row.applications) ? row.applications : [];
    setApps(
      applications.map((a: any) => ({
        key: a.id || newLineKey(),
        id: a.id,
        invoice_id: a.invoice_id || a.invoice?.id || '',
        invoice: a.invoice ?? null,
        amount_applied: a.amount_applied != null ? String(a.amount_applied) : '0',
      }))
    );
  };

  const save = async (data: FormValues, nextStatus: 'draft' | 'posted') => {
    if (previewUnapplied < -0.0001) {
      toast({
        variant: 'destructive',
        title: 'Cannot save',
        description: 'Applications exceed receipt amount. Reduce applied amounts or increase amount.',
      });
      return;
    }
    setBusy(true);
    try {
      const payload = headerPayload(data, nextStatus === 'posted' ? 'draft' : 'draft');
      let receiptId = recordId;
      if (receiptId) {
        await viewAPI.update('payment_receipt', receiptId, formView, payload);
      } else {
        const created = await viewAPI.create('payment_receipt', formView, payload);
        receiptId = created?.data?.id;
        if (!receiptId) throw new Error('Create did not return an id');
        setRecordId(receiptId);
      }
      await syncApps(receiptId, apps);
      if (nextStatus === 'posted') {
        await viewAPI.update('payment_receipt', receiptId, formView, { status: 'posted' });
      }
      await reload(receiptId);
      toast({
        title: nextStatus === 'posted' ? 'Posted' : 'Saved',
        description: nextStatus === 'posted' ? 'Payment posted' : 'Payment draft saved',
      });
      if (!id) navigate(`/payment_receipt/${receiptId}/view/${formView}`, { replace: true });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save payment',
      });
    } finally {
      setBusy(false);
    }
  };

  const voidReceipt = async () => {
    if (!recordId) return;
    setBusy(true);
    try {
      await viewAPI.update('payment_receipt', recordId, formView, {
        status: 'void',
        voided_at: new Date().toISOString(),
      });
      await reload(recordId);
      toast({ title: 'Voided', description: 'Payment voided' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to void payment',
      });
    } finally {
      setBusy(false);
    }
  };

  const onFooterAction = async (actionId: DocumentActionId) => {
    if (actionId === 'close' || actionId === 'cancel') {
      navigate(LIST_PATH);
      return;
    }
    if (actionId === 'save_draft') {
      await form.handleSubmit((d) => save(d, 'draft'))();
      return;
    }
    if (actionId === 'post') {
      await form.handleSubmit((d) => save(d, 'posted'))();
      return;
    }
    if (actionId === 'void') {
      await voidReceipt();
    }
  };

  return (
    <div className="mx-auto w-[90%] max-w-5xl space-y-6 py-4 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {recordId ? 'Payment received' : 'New payment'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sourceSystemId ? 'Imported — view only' : status}
          </p>
        </div>
        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      {sourceSystemId ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This payment was imported. Edit and void are disabled in Books.
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Form {...form}>
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Header</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <FormControl>
                        <SearchDropDown
                          instanceType="customer"
                          instanceKey="id"
                          instanceSourceKey="customer_id"
                          instanceLabel="name"
                          instanceValue={customer}
                          disabled={!draftEditable}
                          onSelectItem={(_s, key, value) => {
                            form.setValue('customer_id', value?.[key] || '');
                            setCustomer(value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null));
                          }}
                          onClear={() => {
                            form.setValue('customer_id', '');
                            setCustomer(null);
                          }}
                          limit={10}
                          searchParams="name"
                          type="customer"
                          isShowSearch
                          placeholder="Customer"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="receipt_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} disabled={!draftEditable} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!draftEditable} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="account_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>Deposit to</FormLabel>
                      <FormControl>
                        <SearchDropDown
                          instanceType="account"
                          instanceKey="id"
                          instanceSourceKey="account_id"
                          instanceLabel="name"
                          instanceSubLabel="code"
                          instanceValue={account}
                          disabled={!draftEditable}
                          onSelectItem={(_s, key, value) => {
                            form.setValue('account_id', value?.[key] || '');
                            setAccount(value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null));
                          }}
                          onClear={() => {
                            form.setValue('account_id', '');
                            setAccount(null);
                          }}
                          limit={10}
                          searchParams="name"
                          type="account"
                          isShowSearch
                          placeholder="Bank / undeposited"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <SearchDropDown
                          instanceType="currency"
                          instanceKey="id"
                          instanceSourceKey="currency_id"
                          instanceLabel="code"
                          instanceValue={currency}
                          disabled={!draftEditable}
                          onSelectItem={(_s, key, value) => {
                            form.setValue('currency_id', value?.[key] || '');
                            setCurrency(value?.item ?? (value?.[key] ? { id: value[key], code: value.code } : null));
                          }}
                          onClear={() => {
                            form.setValue('currency_id', '');
                            setCurrency(null);
                          }}
                          limit={10}
                          searchParams="code"
                          type="currency"
                          isShowSearch
                          placeholder="Currency"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="entity_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>Entity</FormLabel>
                      <FormControl>
                        <SearchDropDown
                          instanceType="entity"
                          instanceKey="id"
                          instanceSourceKey="entity_id"
                          instanceLabel="name"
                          instanceValue={entity}
                          disabled={!draftEditable}
                          onSelectItem={(_s, key, value) => {
                            form.setValue('entity_id', value?.[key] || '');
                            setEntity(value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null));
                          }}
                          onClear={() => {
                            form.setValue('entity_id', '');
                            setEntity(null);
                          }}
                          limit={10}
                          searchParams="name"
                          type="entity"
                          isShowSearch
                          placeholder="Entity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!draftEditable} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payment_reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!draftEditable} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-3">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!draftEditable} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Apply to invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Invoice</th>
                        <th className="py-2 pr-2 font-medium">Amount applied</th>
                        {!readOnly && draftEditable ? <th className="py-2" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {apps.map((app) => (
                        <tr key={app.key} className="border-b last:border-0">
                          <td className="py-2 pr-2" style={{ minWidth: 220 }}>
                            {draftEditable ? (
                              <SearchDropDown
                                instanceType="invoice"
                                instanceKey="id"
                                instanceSourceKey="invoice_id"
                                instanceLabel="number"
                                instanceValue={app.invoice}
                                onSelectItem={(_s, key, value) => {
                                  const item = value?.item ?? value;
                                  setApps((prev) =>
                                    prev.map((a) =>
                                      a.key === app.key
                                        ? {
                                            ...a,
                                            invoice_id: value?.[key] || item?.id || '',
                                            invoice: item
                                              ? {
                                                  id: item.id,
                                                  number: item.number,
                                                  balance_amount: item.balance_amount,
                                                }
                                              : null,
                                            amount_applied:
                                              a.amount_applied ||
                                              (item?.balance_amount != null
                                                ? String(item.balance_amount)
                                                : a.amount_applied),
                                          }
                                        : a
                                    )
                                  );
                                }}
                                onClear={() =>
                                  setApps((prev) =>
                                    prev.map((a) =>
                                      a.key === app.key
                                        ? { ...a, invoice_id: '', invoice: null }
                                        : a
                                    )
                                  )
                                }
                                limit={10}
                                searchParams="number"
                                type="invoice"
                                isShowSearch
                                placeholder="Invoice"
                              />
                            ) : (
                              <span>{app.invoice?.number ?? app.invoice_id ?? '—'}</span>
                            )}
                          </td>
                          <td className="py-2 pr-2" style={{ width: 140 }}>
                            {draftEditable ? (
                              <Input
                                value={app.amount_applied}
                                onChange={(e) =>
                                  setApps((prev) =>
                                    prev.map((a) =>
                                      a.key === app.key
                                        ? { ...a, amount_applied: e.target.value }
                                        : a
                                    )
                                  )
                                }
                              />
                            ) : (
                              moneyLabel(app.amount_applied)
                            )}
                          </td>
                          {draftEditable ? (
                            <td className="py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => setApps((prev) => prev.filter((a) => a.key !== app.key))}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {draftEditable ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      setApps((prev) => [
                        ...prev,
                        { key: newLineKey(), invoice_id: '', invoice: null, amount_applied: '0' },
                      ])
                    }
                  >
                    <Plus size={14} />
                    Add application
                  </Button>
                ) : null}
                <div className="grid grid-cols-2 gap-4 pt-2 md:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Applied</div>
                    <div className="text-sm font-medium">{moneyLabel(appliedSum)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Unapplied</div>
                    <div className="text-sm font-medium">
                      {moneyLabel(unapplied ?? previewUnapplied)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </form>
        </Form>
      )}

      <DocumentFooter actions={actions} busy={busy || isLoading} onAction={onFooterAction} />
    </div>
  );
};

export default PaymentReceiptForm;
