import React, { useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { viewAPI } from '@/api/api';
import { moneyLabel } from './lineMath';

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export type SalesLineDraft = {
  id?: string;
  key: string;
  line_number: number;
  item_master_id?: string | null;
  item_master?: { id?: string; name?: string; code?: string | null } | null;
  description?: string | null;
  quantity: string;
  unit_price: string;
  discount_rate: string;
  /** Kept when item supplies a group; cleared if the user edits tax %. */
  tax_group_id?: string | null;
  tax_rate: string;
  account_id?: string | null;
  account?: { id?: string; name?: string; code?: string | null } | null;
  amount?: string | number | null;
  tax_amount?: string | number | null;
};

export type SalesDocumentTotals = {
  net?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
  balance?: string | number | null;
};

type Props = {
  lines: SalesLineDraft[];
  readOnly?: boolean;
  onChange: (lines: SalesLineDraft[]) => void;
  /** Persist one line after a discrete edit (blur / select). */
  onCommitLine?: (line: SalesLineDraft) => void | Promise<void>;
  onRemoveLine?: (line: SalesLineDraft) => void | Promise<void>;
  /** Server rollup — shown as a stacked footer like prod invoices. */
  totals?: SalesDocumentTotals;
  shippingAmount?: string;
  adjustmentAmount?: string;
  onShippingChange?: (value: string) => void;
  onShippingBlur?: () => void;
  onAdjustmentChange?: (value: string) => void;
  onAdjustmentBlur?: () => void;
  showBalance?: boolean;
};

let lineKeySeq = 0;
export function newLineKey(): string {
  lineKeySeq += 1;
  return `line_${Date.now()}_${lineKeySeq}`;
}

export function emptySalesLine(lineNumber: number): SalesLineDraft {
  return {
    key: newLineKey(),
    line_number: lineNumber,
    description: '',
    quantity: '1',
    unit_price: '0',
    discount_rate: '',
    tax_rate: '',
    item_master_id: null,
    item_master: null,
    tax_group_id: null,
    account_id: null,
    account: null,
    amount: null,
    tax_amount: null,
  };
}

async function resolveTaxRatePercent(item: Record<string, any>): Promise<{
  tax_rate: string;
  tax_group_id: string | null;
}> {
  if (item.tax_group_id) {
    try {
      const res: any = await viewAPI.getById('tax_group', item.tax_group_id, 'tax_group_view');
      const components = Array.isArray(res?.data?.components) ? res.data.components : [];
      let sum = 0;
      for (const c of components) {
        const rate = c?.tax_master?.rate ?? c?.rate;
        if (rate != null && rate !== '') sum += Number(rate);
      }
      if (sum > 0) {
        return { tax_rate: String(sum), tax_group_id: item.tax_group_id };
      }
    } catch {
      /* fall through */
    }
    return { tax_rate: '', tax_group_id: item.tax_group_id };
  }
  if (item.tax_master?.rate != null) {
    return { tax_rate: String(item.tax_master.rate), tax_group_id: null };
  }
  return { tax_rate: '', tax_group_id: null };
}

export async function applyItemDefaults(
  line: SalesLineDraft,
  item: Record<string, any> | null | undefined
): Promise<SalesLineDraft> {
  if (!item) {
    return {
      ...line,
      item_master_id: null,
      item_master: null,
      tax_group_id: null,
      tax_rate: '',
      account_id: null,
      account: null,
      amount: null,
      tax_amount: null,
    };
  }
  const description =
    (item.description && String(item.description).trim()) ||
    (item.name && String(item.name)) ||
    line.description ||
    '';
  const tax = await resolveTaxRatePercent(item);
  return {
    ...line,
    item_master_id: item.id,
    item_master: { id: item.id, name: item.name, code: item.code },
    description,
    unit_price:
      item.unit_price != null && item.unit_price !== ''
        ? String(item.unit_price)
        : line.unit_price,
    account_id: item.sales_account_id ?? null,
    account: item.sales_account
      ? {
          id: item.sales_account.id,
          name: item.sales_account.name,
          code: item.sales_account.code,
        }
      : item.sales_account_id
        ? { id: item.sales_account_id }
        : null,
    tax_group_id: tax.tax_group_id,
    tax_rate: tax.tax_rate,
    amount: null,
    tax_amount: null,
  };
}

function sumLineTaxes(lineTaxes: any[] | undefined): string | number | null {
  if (!Array.isArray(lineTaxes) || lineTaxes.length === 0) return null;
  let sum = 0;
  let any = false;
  for (const row of lineTaxes) {
    if (row?.amount == null || row.amount === '') continue;
    const n = Number(row.amount);
    if (!Number.isFinite(n)) continue;
    sum += n;
    any = true;
  }
  return any ? sum : null;
}

export function mapServerLine(row: any, idx: number): SalesLineDraft {
  const taxFromRow =
    row.tax_rate != null && row.tax_rate !== ''
      ? String(row.tax_rate)
      : Array.isArray(row.line_taxes) && row.line_taxes.length
        ? String(
            row.line_taxes.reduce((s: number, t: any) => s + (Number(t.rate) || 0), 0) || ''
          )
        : '';
  return {
    key: row.id || newLineKey(),
    id: row.id,
    line_number: row.line_number ?? idx + 1,
    item_master_id: row.item_master_id ?? null,
    item_master: row.item_master ?? null,
    description: row.description ?? '',
    quantity: row.quantity != null ? String(row.quantity) : '1',
    unit_price: row.unit_price != null ? String(row.unit_price) : '0',
    discount_rate: row.discount_rate != null ? String(row.discount_rate) : '',
    tax_group_id: row.tax_group_id ?? null,
    tax_rate: taxFromRow,
    account_id: row.account_id ?? null,
    account: row.account ?? null,
    amount: row.amount ?? null,
    tax_amount: sumLineTaxes(row.line_taxes),
  };
}

function TotalsRow({
  label,
  value,
  strong,
  labelCell,
  readOnly,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  labelCell?: React.ReactNode;
  readOnly?: boolean;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={7}
        className={`py-2 text-right text-sm text-muted-foreground ${strong ? 'font-semibold text-foreground' : ''}`}
      >
        {labelCell ?? label}
      </TableCell>
      <TableCell
        colSpan={2}
        className={`py-2 text-right text-sm tabular-nums ${strong ? 'font-semibold' : ''}`}
      >
        {value}
      </TableCell>
      {!readOnly ? <TableCell className="py-2" /> : null}
    </TableRow>
  );
}

export function SalesLineEditor({
  lines,
  readOnly,
  onChange,
  onCommitLine,
  onRemoveLine,
  totals,
  shippingAmount,
  adjustmentAmount,
  onShippingChange,
  onShippingBlur,
  onAdjustmentChange,
  onAdjustmentBlur,
  showBalance = true,
}: Props) {
  // onBlur runs after onChange; keep a ref so commit sees the latest draft row.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const replaceLine = (key: string, next: SalesLineDraft) => {
    const nextLines = linesRef.current.map((l) => (l.key === key ? next : l));
    linesRef.current = nextLines;
    onChange(nextLines);
  };

  const patchLine = (key: string, patch: Partial<SalesLineDraft>) => {
    const nextLines = linesRef.current.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...patch };
      const moneyFields = ['quantity', 'unit_price', 'discount_rate', 'tax_rate', 'item_master_id'];
      if (moneyFields.some((f) => f in patch)) {
        if (patch.amount === undefined) next.amount = null;
        if (patch.tax_amount === undefined) next.tax_amount = null;
      }
      return next;
    });
    linesRef.current = nextLines;
    onChange(nextLines);
  };

  const commit = (key: string) => {
    const line = linesRef.current.find((l) => l.key === key);
    if (line && onCommitLine) void onCommitLine(line);
  };

  const removeLine = async (line: SalesLineDraft) => {
    const next = lines.filter((l) => l.key !== line.key).map((l, idx) => ({
      ...l,
      line_number: idx + 1,
    }));
    onChange(next);
    if (onRemoveLine) await onRemoveLine(line);
  };

  const showTotals = Boolean(totals);
  const colCount = readOnly ? 9 : 10;

  return (
    <div className="space-y-4">
      {!readOnly ? (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">Item Table</h3>
            <p className="text-xs text-muted-foreground">
              Totals refresh from the server on blur or item select.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onChange([...lines, emptySalesLine(lines.length + 1)])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border/60">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-[11px] uppercase tracking-wide text-muted-foreground">
                #
              </TableHead>
              <TableHead className="min-w-[160px] text-[11px] uppercase tracking-wide text-muted-foreground">
                Item
              </TableHead>
              <TableHead className="min-w-[180px] text-[11px] uppercase tracking-wide text-muted-foreground">
                Description
              </TableHead>
              <TableHead className="w-[88px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Qty
              </TableHead>
              <TableHead className="w-[110px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Rate
              </TableHead>
              <TableHead className="w-[88px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Disc %
              </TableHead>
              <TableHead className="w-[88px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Tax %
              </TableHead>
              <TableHead className="w-[110px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Net
              </TableHead>
              <TableHead className="w-[100px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Tax
              </TableHead>
              {!readOnly ? (
                <TableHead className="w-[48px] text-[11px] uppercase tracking-wide text-muted-foreground" />
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key} className="align-top">
                <TableCell className="py-3 text-muted-foreground">{line.line_number}</TableCell>
                <TableCell className="py-3">
                  {readOnly ? (
                    <span>{line.item_master?.name ?? line.item_master?.code ?? '—'}</span>
                  ) : (
                    <SearchDropDown
                      instanceType="item_master"
                      instanceKey="id"
                      instanceSourceKey="item_master_id"
                      instanceLabel="name"
                      instanceSubLabel="code"
                      instanceValue={line.item_master ?? null}
                      onSelectItem={async (_source, _key, value) => {
                        const item = (value?.item ?? value) as Record<string, any>;
                        const next = await applyItemDefaults(line, item);
                        replaceLine(line.key, next);
                        if (onCommitLine) void onCommitLine(next);
                      }}
                      onClear={async () => {
                        const next = await applyItemDefaults(line, null);
                        replaceLine(line.key, next);
                        if (onCommitLine) void onCommitLine(next);
                      }}
                      limit={10}
                      searchParams="name"
                      type="item_master"
                      isShowSearch={true}
                      placeholder="Item"
                    />
                  )}
                </TableCell>
                <TableCell className="py-3">
                  {readOnly ? (
                    <span>{line.description || '—'}</span>
                  ) : (
                    <Input
                      value={line.description ?? ''}
                      onChange={(e) => patchLine(line.key, { description: e.target.value })}
                      onBlur={() => commit(line.key)}
                      className="h-9 border-border/60"
                    />
                  )}
                </TableCell>
                <TableCell className="py-3 text-right">
                  {readOnly ? (
                    <span>{line.quantity}</span>
                  ) : (
                    <Input
                      value={line.quantity}
                      onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                      onBlur={() => commit(line.key)}
                      className={`h-9 border-border/60 text-right ${noSpinner}`}
                    />
                  )}
                </TableCell>
                <TableCell className="py-3 text-right">
                  {readOnly ? (
                    <span>{line.unit_price}</span>
                  ) : (
                    <Input
                      value={line.unit_price}
                      onChange={(e) => patchLine(line.key, { unit_price: e.target.value })}
                      onBlur={() => commit(line.key)}
                      className={`h-9 border-border/60 text-right ${noSpinner}`}
                    />
                  )}
                </TableCell>
                <TableCell className="py-3 text-right">
                  {readOnly ? (
                    <span>{line.discount_rate || '—'}</span>
                  ) : (
                    <Input
                      value={line.discount_rate}
                      onChange={(e) => patchLine(line.key, { discount_rate: e.target.value })}
                      onBlur={() => commit(line.key)}
                      className={`h-9 border-border/60 text-right ${noSpinner}`}
                    />
                  )}
                </TableCell>
                <TableCell className="py-3 text-right">
                  {readOnly ? (
                    <span>{line.tax_rate || '—'}</span>
                  ) : (
                    <Input
                      value={line.tax_rate}
                      onChange={(e) =>
                        patchLine(line.key, {
                          tax_rate: e.target.value,
                          tax_group_id: null,
                        })
                      }
                      onBlur={() => commit(line.key)}
                      placeholder="%"
                      className={`h-9 border-border/60 text-right ${noSpinner}`}
                    />
                  )}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums text-muted-foreground">
                  {moneyLabel(line.amount)}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums text-muted-foreground">
                  {moneyLabel(line.tax_amount)}
                </TableCell>
                {!readOnly ? (
                  <TableCell className="py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void removeLine(line)}
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-8 text-center text-muted-foreground">
                  No line items yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          {showTotals ? (
            <TableFooter className="bg-muted/20">
              <TotalsRow
                readOnly={readOnly}
                label="Subtotal"
                value={moneyLabel(totals?.net)}
              />
              <TotalsRow
                readOnly={readOnly}
                label="Total tax"
                value={moneyLabel(totals?.tax)}
              />
              {onShippingChange != null || shippingAmount != null ? (
                <TotalsRow
                  readOnly={readOnly}
                  label="Shipping"
                  labelCell={
                    <div className="flex items-center justify-end gap-2">
                      <span>Shipping</span>
                      {!readOnly && onShippingChange ? (
                        <Input
                          value={shippingAmount ?? ''}
                          onChange={(e) => onShippingChange(e.target.value)}
                          onBlur={onShippingBlur}
                          className={`h-8 w-28 text-right ${noSpinner}`}
                          placeholder="0"
                        />
                      ) : null}
                    </div>
                  }
                  value={moneyLabel(shippingAmount || 0)}
                />
              ) : null}
              {onAdjustmentChange != null || adjustmentAmount != null ? (
                <TotalsRow
                  readOnly={readOnly}
                  label="Adjustment"
                  labelCell={
                    <div className="flex items-center justify-end gap-2">
                      <span>Adjustment</span>
                      {!readOnly && onAdjustmentChange ? (
                        <Input
                          value={adjustmentAmount ?? ''}
                          onChange={(e) => onAdjustmentChange(e.target.value)}
                          onBlur={onAdjustmentBlur}
                          className={`h-8 w-28 text-right ${noSpinner}`}
                          placeholder="0"
                        />
                      ) : null}
                    </div>
                  }
                  value={moneyLabel(adjustmentAmount || 0)}
                />
              ) : null}
              <TotalsRow
                readOnly={readOnly}
                label="Grand total"
                value={moneyLabel(totals?.total)}
                strong
              />
              {showBalance ? (
                <TotalsRow
                  readOnly={readOnly}
                  label="Balance due"
                  value={moneyLabel(totals?.balance)}
                  strong
                />
              ) : null}
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}

export default SalesLineEditor;
