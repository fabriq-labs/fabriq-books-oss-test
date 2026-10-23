import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
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
import {
  emptySalesLine,
  mapServerLine,
  SalesLineEditor,
  type SalesLineDraft,
} from './SalesLineEditor';
import { dateInput, datePayload, moneyLabel, todayIsoDate, toNumber } from './lineMath';

const EDIT_LIST = '/sales/invoices';
const EDIT_VIEW = 'invoice_edit_view';

const schema = z.object({
  number: z.string().optional(),
  invoice_date: z.string().min(1, { message: 'Invoice date is required' }),
  due_date: z.string().optional(),
  customer_id: z.string().min(1, { message: 'Customer is required' }),
  entity_id: z.string().min(1, { message: 'Entity is required' }),
  currency_id: z.string().min(1, { message: 'Currency is required' }),
  payment_terms_id: z.string().optional(),
  exchange_rate: z.string().optional(),
  bill_to: z.string().optional(),
  notes: z.string().optional(),
  reference: z.string().optional(),
  shipping_amount: z.string().optional(),
  adjustment_amount: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function decimalOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return null;
  return trimmed;
}

function linesFromServer(raw: any[] | undefined): SalesLineDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) return [emptySalesLine(1)];
  return [...raw]
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
    .map((row, idx) => mapServerLine(row, idx));
}

function linePayload(line: SalesLineDraft) {
  return {
    line_number: line.line_number,
    item_master_id: line.item_master_id || null,
    description: blank(line.description ?? undefined),
    quantity: line.quantity || '0',
    unit_price: line.unit_price || '0',
    discount_rate: decimalOrNull(line.discount_rate),
    // When tax_group_id is set (from item), server expands group rates.
    // When the user edits Tax %, editor clears tax_group_id and sends tax_rate only.
    tax_group_id: line.tax_group_id || null,
    tax_rate: decimalOrNull(line.tax_rate),
    account_id: line.account_id || null,
  };
}

function validateLinesForPost(lines: SalesLineDraft[]): string | null {
  if (!lines.length) return 'Add at least one line before posting';
  for (const line of lines) {
    const hasDesc = Boolean(line.description?.trim());
    const qty = toNumber(line.quantity);
    const price = toNumber(line.unit_price);
    if (!hasDesc || !(qty && (price || price === 0) && qty > 0)) {
      return 'Each line needs a description, quantity, and unit price before posting';
    }
  }
  return null;
}

export const InvoiceForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const capability = viewCapability(viewId);
  const formView = viewId || EDIT_VIEW;

  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('draft');
  const [sourceSystemId, setSourceSystemId] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | undefined>(id);
  const [lines, setLines] = useState<SalesLineDraft[]>([emptySalesLine(1)]);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
  const [paymentTerms, setPaymentTerms] = useState<Record<string, unknown> | null>(null);
  const [serverTotals, setServerTotals] = useState<{
    net?: string | number | null;
    tax?: string | number | null;
    total?: string | number | null;
    balance?: string | number | null;
  }>({});

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      number: '',
      invoice_date: todayIsoDate(),
      due_date: '',
      customer_id: '',
      entity_id: '',
      currency_id: '',
      payment_terms_id: '',
      exchange_rate: '1',
      bill_to: '',
      notes: '',
      reference: '',
      shipping_amount: '',
      adjustment_amount: '',
    },
  });

  const readOnly =
    capability === 'readonly' ||
    !isEditableSource(sourceSystemId) ||
    status === 'posted' ||
    status === 'void';

  const draftEditable = !readOnly && (status === 'draft' || !recordId);

  useEffect(() => {
    if (!id || !formView) return;
    setIsLoading(true);
    viewAPI
      .getById('invoice', id, formView)
      .then((res: { data?: any }) => {
        const row = res.data ?? {};
        setRecordId(row.id);
        setStatus(row.status || 'draft');
        setSourceSystemId(row.source_system_id ?? null);
        setCustomer(row.customer ?? null);
        setEntity(row.entity ?? null);
        setCurrency(row.currency ?? null);
        setPaymentTerms(row.payment_terms ?? null);
        setServerTotals({
          net: row.net_amount,
          tax: row.tax_amount,
          total: row.total_amount,
          balance: row.balance_amount,
        });
        form.reset({
          number: row.number || '',
          invoice_date: dateInput(row.invoice_date) || todayIsoDate(),
          due_date: dateInput(row.due_date),
          customer_id: row.customer_id || '',
          entity_id: row.entity_id || '',
          currency_id: row.currency_id || '',
          payment_terms_id: row.payment_terms_id || '',
          exchange_rate: row.exchange_rate != null ? String(row.exchange_rate) : '1',
          bill_to: row.bill_to || '',
          notes: row.notes || '',
          reference: row.reference || '',
          shipping_amount: row.shipping_amount != null ? String(row.shipping_amount) : '',
          adjustment_amount: row.adjustment_amount != null ? String(row.adjustment_amount) : '',
        });
        setLines(linesFromServer(row.line_items));
      })
      .catch(() => {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load invoice' });
      })
      .finally(() => setIsLoading(false));
  }, [id, formView, form, toast]);

  const actions = resolveDocumentActions({
    capability: draftEditable || (status === 'posted' && isEditableSource(sourceSystemId)) ? 'edit' : 'readonly',
    status: recordId ? status : 'new',
    sourceSystemId,
    settlementActions: true,
  });

  const headerPayload = (data: FormValues, nextStatus?: string) => ({
    number: blank(data.number),
    invoice_date: datePayload(data.invoice_date),
    due_date: datePayload(data.due_date),
    customer_id: data.customer_id,
    entity_id: data.entity_id,
    currency_id: data.currency_id,
    payment_terms_id: blank(data.payment_terms_id),
    exchange_rate: data.exchange_rate?.trim() || '1',
    bill_to: blank(data.bill_to),
    notes: blank(data.notes),
    reference: blank(data.reference),
    shipping_amount: decimalOrNull(data.shipping_amount),
    adjustment_amount: decimalOrNull(data.adjustment_amount),
    direction: 'sales',
    status: nextStatus || status || 'draft',
  });

  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const recordIdRef = useRef(recordId);
  useEffect(() => {
    recordIdRef.current = recordId;
  }, [recordId]);
  /** Serialize line persists so blur-chaining does not create duplicate rows. */
  const linePersistChain = useRef(Promise.resolve());

  const applyServerTotals = (row: any) => {
    setStatus(row.status || 'draft');
    setSourceSystemId(row.source_system_id ?? null);
    setServerTotals({
      net: row.net_amount,
      tax: row.tax_amount,
      total: row.total_amount,
      balance: row.balance_amount,
    });
  };

  /**
   * After a line persist: attach server id + computed amounts only.
   * Keep local editable fields so an in-flight blur does not clobber newer keystrokes,
   * and update linesRef synchronously so the serialize queue sees the new id.
   */
  const mergeServerLines = (serverRaw: any[] | undefined, draftKey?: string) => {
    if (!Array.isArray(serverRaw)) return;
    const serverMapped = linesFromServer(serverRaw);
    const prev = linesRef.current;
    const used = new Set<string>();
    let next = prev.map((local) => {
      if (local.id) {
        const match = serverMapped.find((s) => s.id === local.id);
        if (match) {
          used.add(match.id!);
          return {
            ...local,
            amount: match.amount,
            tax_amount: match.tax_amount,
          };
        }
      }
      return local;
    });
    if (draftKey) {
      const idx = next.findIndex((l) => l.key === draftKey);
      if (idx >= 0 && !next[idx].id) {
        const fresh = serverMapped.find((s) => s.id && !used.has(s.id));
        if (fresh) {
          next = next.map((l, i) =>
            i === idx
              ? {
                  ...l,
                  id: fresh.id,
                  amount: fresh.amount,
                  tax_amount: fresh.tax_amount,
                }
              : l
          );
        }
      }
    }
    // Sync before setState so the serialized persist queue sees the new id immediately.
    linesRef.current = next;
    setLines(next);
  };

  const applyServerRow = (row: any, opts?: { draftKey?: string; replaceLines?: boolean }) => {
    applyServerTotals(row);
    if (!Array.isArray(row.line_items)) return;
    if (opts?.replaceLines) {
      setLines(linesFromServer(row.line_items));
      return;
    }
    mergeServerLines(row.line_items, opts?.draftKey);
  };

  const reload = async (invoiceId: string) => {
    const res = await viewAPI.getById('invoice', invoiceId, formView);
    const row = res.data ?? {};
    applyServerRow(row, { replaceLines: true });
    return row;
  };

  /** Create the draft header once required FKs exist (needed before line PUTs). */
  const ensureInvoiceId = async (): Promise<string | null> => {
    if (recordIdRef.current) return recordIdRef.current;
    const data = form.getValues();
    if (!data.customer_id || !data.entity_id || !data.currency_id) {
      toast({
        variant: 'destructive',
        title: 'Missing header',
        description: 'Select customer, entity, and currency before editing lines.',
      });
      return null;
    }
    const created = await viewAPI.create('invoice', formView, headerPayload(data, 'draft'));
    const invoiceId = created?.data?.id as string | undefined;
    if (!invoiceId) throw new Error('Create did not return an id');
    setRecordId(invoiceId);
    recordIdRef.current = invoiceId;
    if (!id) navigate(`/invoice/${invoiceId}/view/${formView}`, { replace: true });
    // Header-only create: refresh totals/status, do not wipe in-progress draft lines.
    applyServerTotals(created.data);
    return invoiceId;
  };

  const persistLine = async (line: SalesLineDraft) => {
    if (!draftEditable) return;
    const draftKey = line.key;
    linePersistChain.current = linePersistChain.current
      .catch(() => undefined)
      .then(async () => {
        // Prefer the blur snapshot for editable fields; take id from ref (may be set by a prior create).
        const fromRef =
          linesRef.current.find((l) => l.key === draftKey) ||
          (line.id ? linesRef.current.find((l) => l.id === line.id) : undefined);
        const latest: SalesLineDraft = {
          ...line,
          id: fromRef?.id || line.id,
          amount: fromRef?.amount ?? line.amount,
          tax_amount: fromRef?.tax_amount ?? line.tax_amount,
        };
        const empty =
          !latest.description?.trim() &&
          !latest.item_master_id &&
          toNumber(latest.unit_price) === 0 &&
          !latest.discount_rate &&
          !latest.tax_rate;
        if (empty) return;

        setBusy(true);
        try {
          const invoiceId = await ensureInvoiceId();
          if (!invoiceId) return;
          const payload = linePayload(latest);
          let row: any;
          if (latest.id) {
            row = (
              await viewAPI.updateChild(
                'invoice',
                invoiceId,
                formView,
                'line_items',
                latest.id,
                payload
              )
            )?.data;
          } else {
            row = (await viewAPI.addChild('invoice', invoiceId, formView, 'line_items', payload))
              ?.data;
          }
          if (row?.id || row?.line_items) {
            applyServerRow(row, { draftKey });
          } else {
            await reload(invoiceId);
          }
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: error.message || 'Failed to update line',
          });
        } finally {
          setBusy(false);
        }
      });
    await linePersistChain.current;
  };

  const removePersistedLine = async (line: SalesLineDraft) => {
    if (!line.id || !recordId || !draftEditable) return;
    try {
      setBusy(true);
      const row = (
        await viewAPI.deleteChild('invoice', recordId, formView, 'line_items', line.id)
      )?.data;
      if (row?.id) applyServerRow(row, { replaceLines: true });
      else await reload(recordId);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to remove line',
      });
    } finally {
      setBusy(false);
    }
  };

  const persistHeaderField = async () => {
    if (!draftEditable) return;
    const data = form.getValues();
    if (!data.customer_id || !data.entity_id || !data.currency_id) return;
    try {
      setBusy(true);
      if (!recordId) {
        await ensureInvoiceId();
        return;
      }
      const row = (await viewAPI.update('invoice', recordId, formView, headerPayload(data, 'draft')))
        ?.data;
      if (row) applyServerRow(row);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update invoice',
      });
    } finally {
      setBusy(false);
    }
  };

  const syncLines = async (invoiceId: string, currentLines: SalesLineDraft[]) => {
    const existing = await viewAPI.getById('invoice', invoiceId, formView);
    const serverLines: any[] = Array.isArray(existing?.data?.line_items)
      ? existing.data.line_items
      : [];
    const serverIds = new Set(serverLines.map((l) => l.id).filter(Boolean));
    const keepIds = new Set(currentLines.map((l) => l.id).filter(Boolean) as string[]);

    for (const s of serverLines) {
      if (s.id && !keepIds.has(s.id)) {
        await viewAPI.deleteChild('invoice', invoiceId, formView, 'line_items', s.id);
      }
    }

    for (const line of currentLines) {
      const payload = linePayload(line);
      if (line.id && serverIds.has(line.id)) {
        await viewAPI.updateChild('invoice', invoiceId, formView, 'line_items', line.id, payload);
      } else {
        await viewAPI.addChild('invoice', invoiceId, formView, 'line_items', payload);
      }
    }
  };

  const saveDraft = async (data: FormValues) => {
    setBusy(true);
    try {
      const payload = headerPayload(data, 'draft');
      let invoiceId = recordId;
      if (invoiceId) {
        await viewAPI.update('invoice', invoiceId, formView, payload);
      } else {
        const created = await viewAPI.create('invoice', formView, payload);
        invoiceId = created?.data?.id;
        if (!invoiceId) throw new Error('Create did not return an id');
        setRecordId(invoiceId);
      }
      await syncLines(invoiceId, lines);
      await reload(invoiceId);
      toast({ title: 'Saved', description: 'Invoice draft saved' });
      if (!id) navigate(`/invoice/${invoiceId}/view/${formView}`, { replace: true });
    } catch (error: any) {
      const message =
        error?.message ||
        error?.error ||
        error?.details?.originalError ||
        'Failed to save invoice';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: typeof message === 'string' ? message.slice(0, 280) : 'Failed to save invoice',
      });
    } finally {
      setBusy(false);
    }
  };

  const postInvoice = async (data: FormValues) => {
    const lineError = validateLinesForPost(lines);
    if (lineError) {
      toast({ variant: 'destructive', title: 'Cannot post', description: lineError });
      return;
    }
    setBusy(true);
    try {
      const payload = headerPayload(data, 'draft');
      let invoiceId = recordId;
      if (invoiceId) {
        await viewAPI.update('invoice', invoiceId, formView, payload);
      } else {
        const created = await viewAPI.create('invoice', formView, payload);
        invoiceId = created?.data?.id;
        if (!invoiceId) throw new Error('Create did not return an id');
        setRecordId(invoiceId);
      }
      await syncLines(invoiceId, lines);
      await viewAPI.update('invoice', invoiceId, formView, { status: 'posted' });
      await reload(invoiceId);
      toast({ title: 'Posted', description: 'Invoice posted' });
      if (!id) navigate(`/invoice/${invoiceId}/view/${formView}`, { replace: true });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to post invoice',
      });
    } finally {
      setBusy(false);
    }
  };

  const voidInvoice = async () => {
    if (!recordId) return;
    setBusy(true);
    try {
      await viewAPI.update('invoice', recordId, formView, {
        status: 'void',
        voided_at: new Date().toISOString(),
      });
      await reload(recordId);
      toast({ title: 'Voided', description: 'Invoice voided' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to void invoice',
      });
    } finally {
      setBusy(false);
    }
  };

  const onFooterAction = async (actionId: DocumentActionId) => {
    if (actionId === 'close' || actionId === 'cancel') {
      navigate(EDIT_LIST);
      return;
    }
    if (actionId === 'save_draft') {
      await form.handleSubmit(saveDraft)();
      return;
    }
    if (actionId === 'post') {
      await form.handleSubmit(postInvoice)();
      return;
    }
    if (actionId === 'void') {
      await voidInvoice();
      return;
    }
    if (actionId === 'record_payment' && recordId) {
      navigate(`/payment_receipt/view/payment_receipt_edit_view?invoice_id=${recordId}`);
      return;
    }
    if (actionId === 'apply_credit' && recordId) {
      navigate(`/credit_note/view/credit_note_edit_view?invoice_id=${recordId}`);
    }
  };

  const applyCustomerDefaults = (value: any) => {
    const item = value?.item ?? value;
    setCustomer(item ?? (value?.id ? { id: value.id, name: value.name } : null));
    form.setValue('customer_id', value?.id || item?.id || '');
    if (item?.currency_id && !form.getValues('currency_id')) {
      form.setValue('currency_id', item.currency_id);
      setCurrency(item.currency ?? { id: item.currency_id });
    }
    if (item?.entity_id && !form.getValues('entity_id')) {
      form.setValue('entity_id', item.entity_id);
      setEntity(item.entity ?? { id: item.entity_id });
    }
    if (item?.payment_terms_id && !form.getValues('payment_terms_id')) {
      form.setValue('payment_terms_id', item.payment_terms_id);
      setPaymentTerms(item.payment_terms ?? { id: item.payment_terms_id });
    }
    if (item?.address && !form.getValues('bill_to')) {
      const bill = [item.address, item.city, item.state, item.postal_code, item.country]
        .filter(Boolean)
        .join(', ');
      if (bill) form.setValue('bill_to', bill);
    }
    void persistHeaderField();
  };

  const applyPaymentTerms = (value: any) => {
    const item = value?.item ?? value;
    setPaymentTerms(item ?? (value?.id ? { id: value.id, name: value.name } : null));
    form.setValue('payment_terms_id', value?.id || item?.id || '');
    const days = item?.days;
    if (days != null && form.getValues('invoice_date') && !form.getValues('due_date')) {
      const d = new Date(form.getValues('invoice_date'));
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + Number(days));
        form.setValue('due_date', d.toISOString().slice(0, 10));
      }
    }
    void persistHeaderField();
  };

  return (
    <div className="mx-auto w-[90%] max-w-5xl space-y-6 py-4 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {form.watch('number') ? `Invoice ${form.watch('number')}` : recordId ? 'Invoice' : 'New invoice'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sourceSystemId
              ? 'Imported — view only in Books'
              : status === 'posted'
                ? 'Posted'
                : status === 'void'
                  ? 'Void'
                  : recordId
                    ? 'Draft'
                    : 'Create a sales invoice'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate(EDIT_LIST)}
        >
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      {sourceSystemId ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This invoice was imported from a connection. Edit and void are disabled in Books.
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
                          onSelectItem={(_s, _k, value) => applyCustomerDefaults(value)}
                          onClear={() => {
                            form.setValue('customer_id', '');
                            setCustomer(null);
                            void persistHeaderField();
                          }}
                          limit={10}
                          searchParams="name"
                          type="customer"
                          isShowSearch={true}
                          placeholder="Select customer"
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
                            void persistHeaderField();
                          }}
                          onClear={() => {
                            form.setValue('entity_id', '');
                            setEntity(null);
                            void persistHeaderField();
                          }}
                          limit={10}
                          searchParams="name"
                          type="entity"
                          isShowSearch={true}
                          placeholder="Select entity"
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
                          instanceSubLabel="name"
                          instanceValue={currency}
                          disabled={!draftEditable}
                          onSelectItem={(_s, key, value) => {
                            form.setValue('currency_id', value?.[key] || '');
                            setCurrency(value?.item ?? (value?.[key] ? { id: value[key], code: value.code } : null));
                            void persistHeaderField();
                          }}
                          onClear={() => {
                            form.setValue('currency_id', '');
                            setCurrency(null);
                            void persistHeaderField();
                          }}
                          limit={10}
                          searchParams="code"
                          type="currency"
                          isShowSearch={true}
                          placeholder="Currency"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoice_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payment_terms_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>Payment terms</FormLabel>
                      <FormControl>
                        <SearchDropDown
                          instanceType="payment_terms"
                          instanceKey="id"
                          instanceSourceKey="payment_terms_id"
                          instanceLabel="name"
                          instanceValue={paymentTerms}
                          disabled={!draftEditable}
                          onSelectItem={(_s, _k, value) => applyPaymentTerms(value)}
                          onClear={() => {
                            form.setValue('payment_terms_id', '');
                            setPaymentTerms(null);
                            void persistHeaderField();
                          }}
                          limit={10}
                          searchParams="name"
                          type="payment_terms"
                          isShowSearch={true}
                          placeholder="Terms"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="exchange_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exchange rate</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shipping_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shipping</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="adjustment_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adjustment</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bill_to"
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-3">
                      <FormLabel>Bill to</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
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
                        <Input
                          {...field}
                          disabled={!draftEditable}
                          onBlur={() => {
                            field.onBlur();
                            void persistHeaderField();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Line items</CardTitle>
              </CardHeader>
              <CardContent>
                <SalesLineEditor
                  lines={lines}
                  readOnly={!draftEditable}
                  onChange={setLines}
                  onCommitLine={persistLine}
                  onRemoveLine={removePersistedLine}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Totals</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Net</div>
                  <div className="text-sm font-medium">{moneyLabel(serverTotals.net)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Tax</div>
                  <div className="text-sm font-medium">{moneyLabel(serverTotals.tax)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Total</div>
                  <div className="text-sm font-medium">{moneyLabel(serverTotals.total)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Balance</div>
                  <div className="text-sm font-medium">{moneyLabel(serverTotals.balance)}</div>
                </div>
                <p className="col-span-2 text-xs text-muted-foreground md:col-span-4">
                  Totals refresh from the server on field blur / select (calculate_invoice_total).
                </p>
              </CardContent>
            </Card>
          </form>
        </Form>
      )}

      <DocumentFooter actions={actions} busy={busy || isLoading} onAction={onFooterAction} />
    </div>
  );
};

export default InvoiceForm;
