import React, { useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { viewAPI } from '@/api/api';
import { moneyLabel } from './lineMath';

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

type Props = {
  lines: SalesLineDraft[];
  readOnly?: boolean;
  onChange: (lines: SalesLineDraft[]) => void;
  /** Persist one line after a discrete edit (blur / select). */
  onCommitLine?: (line: SalesLineDraft) => void | Promise<void>;
  onRemoveLine?: (line: SalesLineDraft) => void | Promise<void>;
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

export function SalesLineEditor({
  lines,
  readOnly,
  onChange,
  onCommitLine,
  onRemoveLine,
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

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 font-medium">Qty</th>
              <th className="py-2 pr-2 font-medium">Unit price</th>
              <th className="py-2 pr-2 font-medium">Disc %</th>
              <th className="py-2 pr-2 font-medium">Tax %</th>
              <th className="py-2 pr-2 text-right font-medium">Net</th>
              <th className="py-2 pr-2 text-right font-medium">Tax</th>
              {!readOnly ? <th className="py-2 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-b align-top last:border-0">
                <td className="py-2 pr-2 pt-3">{line.line_number}</td>
                <td className="py-2 pr-2" style={{ minWidth: 160 }}>
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
                </td>
                <td className="py-2 pr-2" style={{ minWidth: 180 }}>
                  {readOnly ? (
                    <span>{line.description || '—'}</span>
                  ) : (
                    <Input
                      value={line.description ?? ''}
                      onChange={(e) => patchLine(line.key, { description: e.target.value })}
                      onBlur={() => commit(line.key)}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 88 }}>
                  {readOnly ? (
                    <span>{line.quantity}</span>
                  ) : (
                    <Input
                      value={line.quantity}
                      onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                      onBlur={() => commit(line.key)}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 110 }}>
                  {readOnly ? (
                    <span>{line.unit_price}</span>
                  ) : (
                    <Input
                      value={line.unit_price}
                      onChange={(e) => patchLine(line.key, { unit_price: e.target.value })}
                      onBlur={() => commit(line.key)}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 80 }}>
                  {readOnly ? (
                    <span>{line.discount_rate || '—'}</span>
                  ) : (
                    <Input
                      value={line.discount_rate}
                      onChange={(e) => patchLine(line.key, { discount_rate: e.target.value })}
                      onBlur={() => commit(line.key)}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 80 }}>
                  {readOnly ? (
                    <span>{line.tax_rate || '—'}</span>
                  ) : (
                    <Input
                      value={line.tax_rate}
                      onChange={(e) =>
                        patchLine(line.key, {
                          tax_rate: e.target.value,
                          // Editing the rate leaves group expansion; use line.tax_rate path.
                          tax_group_id: null,
                        })
                      }
                      onBlur={() => commit(line.key)}
                      placeholder="%"
                    />
                  )}
                </td>
                <td className="py-2 pr-2 text-right text-muted-foreground">{moneyLabel(line.amount)}</td>
                <td className="py-2 pr-2 text-right text-muted-foreground">{moneyLabel(line.tax_amount)}</td>
                {!readOnly ? (
                  <td className="py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => void removeLine(line)}
                      title="Remove line"
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
      <p className="text-xs text-muted-foreground">
        Totals refresh from the server when a field blurs or an item is selected (PUT).
      </p>
      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => onChange([...lines, emptySalesLine(lines.length + 1)])}
        >
          <Plus size={14} />
          Add line
        </Button>
      ) : null}
    </div>
  );
}

export default SalesLineEditor;
