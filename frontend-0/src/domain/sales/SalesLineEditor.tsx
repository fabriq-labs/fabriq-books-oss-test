import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { moneyLabel } from './lineMath';

export type SalesLineDraft = {
  /** Server id when persisted */
  id?: string;
  /** Local key for React */
  key: string;
  line_number: number;
  item_master_id?: string | null;
  item_master?: { id?: string; name?: string; code?: string | null } | null;
  description?: string | null;
  quantity: string;
  unit_price: string;
  discount_rate: string;
  tax_group_id?: string | null;
  tax_group?: { id?: string; name?: string } | null;
  account_id?: string | null;
  account?: { id?: string; name?: string; code?: string | null } | null;
  /** Server-computed net (ex-tax). Shown after API calc — never computed in the browser. */
  amount?: string | number | null;
  /** Server-computed line tax total when available from line_taxes. */
  tax_amount?: string | number | null;
};

type Props = {
  lines: SalesLineDraft[];
  readOnly?: boolean;
  onChange: (lines: SalesLineDraft[]) => void;
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
    item_master_id: null,
    item_master: null,
    tax_group_id: null,
    tax_group: null,
    account_id: null,
    account: null,
    amount: null,
    tax_amount: null,
  };
}

function applyItemDefaults(
  line: SalesLineDraft,
  item: Record<string, any> | null | undefined
): SalesLineDraft {
  if (!item) {
    return {
      ...line,
      item_master_id: null,
      item_master: null,
      tax_group_id: null,
      tax_group: null,
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
    tax_group_id: item.tax_group_id ?? null,
    tax_group: item.tax_group
      ? { id: item.tax_group.id, name: item.tax_group.name }
      : item.tax_group_id
        ? { id: item.tax_group_id }
        : null,
    // Clearing local money display — server recomputes on save/API.
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
    tax_group: row.tax_group ?? null,
    account_id: row.account_id ?? null,
    account: row.account ?? null,
    amount: row.amount ?? null,
    tax_amount: sumLineTaxes(row.line_taxes),
  };
}

export function SalesLineEditor({ lines, readOnly, onChange }: Props) {
  const updateLine = (key: string, patch: Partial<SalesLineDraft>) => {
    const clearsServerMoney =
      'quantity' in patch ||
      'unit_price' in patch ||
      'discount_rate' in patch ||
      'tax_group_id' in patch ||
      'item_master_id' in patch;
    onChange(
      lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (clearsServerMoney) {
          if (patch.amount === undefined) next.amount = null;
          if (patch.tax_amount === undefined) next.tax_amount = null;
        }
        return next;
      })
    );
  };

  const removeLine = (key: string) => {
    const next = lines.filter((l) => l.key !== key).map((l, idx) => ({
      ...l,
      line_number: idx + 1,
    }));
    onChange(next);
  };

  const addLine = () => {
    onChange([...lines, emptySalesLine(lines.length + 1)]);
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
              <th className="py-2 pr-2 font-medium">Tax group</th>
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
                      onSelectItem={(_source, _key, value) => {
                        const item = (value?.item ?? value) as Record<string, any>;
                        updateLine(line.key, applyItemDefaults(line, item));
                      }}
                      onClear={() => updateLine(line.key, applyItemDefaults(line, null))}
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
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 88 }}>
                  {readOnly ? (
                    <span>{line.quantity}</span>
                  ) : (
                    <Input
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 110 }}>
                  {readOnly ? (
                    <span>{line.unit_price}</span>
                  ) : (
                    <Input
                      value={line.unit_price}
                      onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ width: 80 }}>
                  {readOnly ? (
                    <span>{line.discount_rate || '—'}</span>
                  ) : (
                    <Input
                      value={line.discount_rate}
                      onChange={(e) => updateLine(line.key, { discount_rate: e.target.value })}
                    />
                  )}
                </td>
                <td className="py-2 pr-2" style={{ minWidth: 140 }}>
                  {readOnly ? (
                    <span>{line.tax_group?.name ?? '—'}</span>
                  ) : (
                    <SearchDropDown
                      instanceType="tax_group"
                      instanceKey="id"
                      instanceSourceKey="tax_group_id"
                      instanceLabel="name"
                      instanceValue={line.tax_group ?? null}
                      onSelectItem={(_source, key, value) => {
                        updateLine(line.key, {
                          tax_group_id: value?.[key] || null,
                          tax_group:
                            value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null),
                        });
                      }}
                      onClear={() =>
                        updateLine(line.key, {
                          tax_group_id: null,
                          tax_group: null,
                        })
                      }
                      limit={10}
                      searchParams="name"
                      type="tax_group"
                      isShowSearch={true}
                      placeholder="Tax group"
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
                      onClick={() => removeLine(line.key)}
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
        Net and tax update from the server when you save (totals action).
      </p>
      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
          <Plus size={14} />
          Add line
        </Button>
      ) : null}
    </div>
  );
}

export default SalesLineEditor;
