import React, { useEffect, useRef, useState } from 'react';
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
import {
  emptySalesLine,
  mapServerLine,
  newLineKey,
  SalesLineEditor,
  type SalesLineDraft,
} from './SalesLineEditor';
import { dateInput, datePayload, moneyLabel, todayIsoDate, toNumber } from './lineMath';

const LIST_PATH = '/sales/credit-notes';
const EDIT_VIEW = 'credit_note_edit_view';

const schema = z.object({
  number: z.string().optional(),
  credit_note_date: z.string().min(1, { message: 'Date is required' }),
  customer_id: z.string().min(1, { message: 'Customer is required' }),
  entity_id: z.string().min(1, { message: 'Entity is required' }),
  currency_id: z.string().min(1, { message: 'Currency is required' }),
  invoice_id: z.string().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
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
    if (!hasDesc || !(qty > 0)) {
      return 'Each line needs a description and quantity before posting';
    }
  }
  return null;
}

export const CreditNoteForm: React.FC = () => {
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
  const [lines, setLines] = useState<SalesLineDraft[]>([emptySalesLine(1)]);
  const [apps, setApps] = useState<AppDraft[]>([]);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null);
  const [currency, setCurrency] = useState<Record<string, unknown> | null>(null);
  const [originInvoice, setOriginInvoice] = useState<Record<string, unknown> | null>(null);
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
      credit_note_date: todayIsoDate(),
      customer_id: '',
      entity_id: '',
      currency_id: '',
      invoice_id: '',
      notes: '',
      reason: '',
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
          form.setValue('invoice_id', inv.id);
          setOriginInvoice(inv);
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
          const bal = inv.balance_amount != null ? String(inv.balance_amount) : '0';
          setApps([
            {
              key: newLineKey(),
              invoice_id: inv.id,
              invoice: { id: inv.id, number: inv.number, balance_amount: inv.balance_amount },
              amount_applied: bal,
            },
          ]);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }, [id, searchParams, form]);

  useEffect(() => {
    if (!id || !formView) return;
    setIsLoading(true);
    viewAPI
      .getById('credit_note', id, formView)
      .then((res: any) => {
        const row = res.data ?? {};
        setRecordId(row.id);
        setStatus(row.status || 'draft');
        setSourceSystemId(row.source_system_id ?? null);
        setCustomer(row.customer ?? null);
        setEntity(row.entity ?? null);
        setCurrency(row.currency ?? null);
        setOriginInvoice(row.invoice ?? null);
        setServerTotals({
          net: row.net_amount,
          tax: row.tax_amount,
          total: row.total_amount,
          balance: row.balance_amount,
        });
        form.reset({
          number: row.number || '',
          credit_note_date: dateInput(row.credit_note_date) || todayIsoDate(),
          customer_id: row.customer_id || '',
          entity_id: row.entity_id || '',
          currency_id: row.currency_id || '',
          invoice_id: row.invoice_id || '',
          notes: row.notes || '',
          reason: row.reason || '',
        });
        setLines(linesFromServer(row.line_items));
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
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load credit note' });
      })
      .finally(() => setIsLoading(false));
  }, [id, formView, form, toast]);

  const actions = resolveDocumentActions({
    capability: draftEditable || (status === 'posted' && isEditableSource(sourceSystemId)) ? 'edit' : 'readonly',
    status: recordId ? status : 'new',
    sourceSystemId,
    settlementActions: false,
  });

  const headerPayload = (data: FormValues, nextStatus?: string) => ({
    number: blank(data.number),
    credit_note_date: datePayload(data.credit_note_date),
    customer_id: data.customer_id,
    entity_id: data.entity_id,
    currency_id: data.currency_id,
    invoice_id: blank(data.invoice_id),
    notes: blank(data.notes),
    reason: blank(data.reason),
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

  const mergeApps = (applications: any[] | undefined) => {
    if (!Array.isArray(applications)) return;
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
    linesRef.current = next;
    setLines(next);
  };

  const applyServerRow = (row: any, opts?: { draftKey?: string; replaceLines?: boolean }) => {
    applyServerTotals(row);
    if (opts?.replaceLines) {
      if (Array.isArray(row.line_items)) setLines(linesFromServer(row.line_items));
      mergeApps(row.applications);
      return;
    }
    if (Array.isArray(row.line_items)) mergeServerLines(row.line_items, opts?.draftKey);
    if (Array.isArray(row.applications)) mergeApps(row.applications);
  };

  /** Create the draft header once required FKs exist (needed before line PUTs). */
  const ensureCreditNoteId = async (): Promise<string | null> => {
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
    const created = await viewAPI.create('credit_note', formView, headerPayload(data, 'draft'));
    const cnId = created?.data?.id as string | undefined;
    if (!cnId) throw new Error('Create did not return an id');
    setRecordId(cnId);
    recordIdRef.current = cnId;
    if (!id) navigate(`/credit_note/${cnId}/view/${formView}`, { replace: true });
    applyServerTotals(created.data);
    return cnId;
  };

  const persistLine = async (line: SalesLineDraft) => {
    if (!draftEditable) return;
    const draftKey = line.key;
    linePersistChain.current = linePersistChain.current
      .catch(() => undefined)
      .then(async () => {
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
          const cnId = await ensureCreditNoteId();
          if (!cnId) return;
          const payload = linePayload(latest);
          let row: any;
          if (latest.id) {
            row = (
              await viewAPI.updateChild(
                'credit_note',
                cnId,
                formView,
                'line_items',
                latest.id,
                payload
              )
            )?.data;
          } else {
            row = (await viewAPI.addChild('credit_note', cnId, formView, 'line_items', payload))
              ?.data;
          }
          if (row?.id || row?.line_items) {
            applyServerRow(row, { draftKey });
          } else {
            await reload(cnId);
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
        await viewAPI.deleteChild('credit_note', recordId, formView, 'line_items', line.id)
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
        await ensureCreditNoteId();
        return;
      }
      const row = (
        await viewAPI.update('credit_note', recordId, formView, headerPayload(data, 'draft'))
      )?.data;
      if (row) applyServerRow(row);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update credit note',
      });
    } finally {
      setBusy(false);
    }
  };

  const syncLines = async (cnId: string, currentLines: SalesLineDraft[]) => {
    const existing = await viewAPI.getById('credit_note', cnId, formView);
    const serverLines: any[] = Array.isArray(existing?.data?.line_items)
      ? existing.data.line_items
      : [];
    const serverIds = new Set(serverLines.map((l) => l.id).filter(Boolean));
    const keepIds = new Set(currentLines.map((l) => l.id).filter(Boolean) as string[]);

    for (const s of serverLines) {
      if (s.id && !keepIds.has(s.id)) {
        await viewAPI.deleteChild('credit_note', cnId, formView, 'line_items', s.id);
      }
    }

    for (const line of currentLines) {
      const payload = linePayload(line);
      if (line.id && serverIds.has(line.id)) {
        await viewAPI.updateChild('credit_note', cnId, formView, 'line_items', line.id, payload);
      } else {
        await viewAPI.addChild('credit_note', cnId, formView, 'line_items', payload);
      }
    }
  };

  const syncApps = async (cnId: string, current: AppDraft[]) => {
    const existing = await viewAPI.getById('credit_note', cnId, formView);
    const serverApps: any[] = Array.isArray(existing?.data?.applications)
      ? existing.data.applications
      : [];
    const serverIds = new Set(serverApps.map((a) => a.id).filter(Boolean));
    const keepIds = new Set(current.map((a) => a.id).filter(Boolean) as string[]);

    for (const s of serverApps) {
      if (s.id && !keepIds.has(s.id)) {
        await viewAPI.deleteChild('credit_note', cnId, formView, 'applications', s.id);
      }
    }

    for (const app of current) {
      if (!app.invoice_id) continue;
      const payload = {
        invoice_id: app.invoice_id,
        amount_applied: app.amount_applied || '0',
        applied_date: datePayload(todayIsoDate()),
      };
      if (app.id && serverIds.has(app.id)) {
        await viewAPI.updateChild('credit_note', cnId, formView, 'applications', app.id, payload);
      } else {
        await viewAPI.addChild('credit_note', cnId, formView, 'applications', payload);
      }
    }
  };

  const reload = async (cnId: string) => {
    const res = await viewAPI.getById('credit_note', cnId, formView);
    const row = res.data ?? {};
    applyServerRow(row, { replaceLines: true });
  };

  const save = async (data: FormValues, nextStatus: 'draft' | 'posted') => {
    if (nextStatus === 'posted') {
      const lineError = validateLinesForPost(lines);
      if (lineError) {
        toast({ variant: 'destructive', title: 'Cannot post', description: lineError });
        return;
      }
    }
    setBusy(true);
    try {
      const payload = headerPayload(data, 'draft');
      let cnId = recordId;
      if (cnId) {
        await viewAPI.update('credit_note', cnId, formView, payload);
      } else {
        const created = await viewAPI.create('credit_note', formView, payload);
        cnId = created?.data?.id;
        if (!cnId) throw new Error('Create did not return an id');
        setRecordId(cnId);
      }
      await syncLines(cnId, lines);
      await syncApps(cnId, apps);
      if (nextStatus === 'posted') {
        await viewAPI.update('credit_note', cnId, formView, { status: 'posted' });
      }
      await reload(cnId);
      toast({
        title: nextStatus === 'posted' ? 'Posted' : 'Saved',
        description: nextStatus === 'posted' ? 'Credit note posted' : 'Credit note draft saved',
      });
      if (!id) navigate(`/credit_note/${cnId}/view/${formView}`, { replace: true });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save credit note',
      });
    } finally {
      setBusy(false);
    }
  };

  const voidNote = async () => {
    if (!recordId) return;
    setBusy(true);
    try {
      await viewAPI.update('credit_note', recordId, formView, {
        status: 'void',
        voided_at: new Date().toISOString(),
      });
      await reload(recordId);
      toast({ title: 'Voided', description: 'Credit note voided' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to void credit note',
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
      await voidNote();
    }
  };

  return (
    <div className="mx-auto w-[90%] max-w-5xl space-y-6 py-4 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {recordId ? 'Credit note' : 'New credit note'}
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
          This credit note was imported. Edit and void are disabled in Books.
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
                            void persistHeaderField();
                          }}
                          onClear={() => {
                            form.setValue('customer_id', '');
                            setCustomer(null);
                            void persistHeaderField();
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
                  name="credit_note_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
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
                  name="invoice_id"
                  render={() => (
                    <FormItem>
                      <FormLabel>Origin invoice</FormLabel>
                      <FormControl>
                        <SearchDropDown
                          instanceType="invoice"
                          instanceKey="id"
                          instanceSourceKey="invoice_id"
                          instanceLabel="number"
                          instanceValue={originInvoice}
                          disabled={!draftEditable}
                          onSelectItem={(_s, key, value) => {
                            form.setValue('invoice_id', value?.[key] || '');
                            setOriginInvoice(
                              value?.item ?? (value?.[key] ? { id: value[key], number: value.number } : null)
                            );
                            void persistHeaderField();
                          }}
                          onClear={() => {
                            form.setValue('invoice_id', '');
                            setOriginInvoice(null);
                            void persistHeaderField();
                          }}
                          limit={10}
                          searchParams="number"
                          type="invoice"
                          isShowSearch
                          placeholder="Optional"
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
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
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
                  totals={serverTotals}
                  showBalance
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
                        {draftEditable ? <th className="py-2" /> : null}
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
              </CardContent>
            </Card>

          </form>
        </Form>
      )}

      <DocumentFooter actions={actions} busy={busy || isLoading} onAction={onFooterAction} />
    </div>
  );
};

export default CreditNoteForm;
