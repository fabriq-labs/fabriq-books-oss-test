import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { computeLinePreview, moneyLabel } from './lineMath';

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
  /** Manual tax % when no group (preview + persisted via single tax row after save if group used). */
  tax_rate: string;
  account_id?: string | null;
  account?: { id?: string; name?: string; code?: string | null } | null;
  amount?: string | number | null;
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
    tax_rate: '',
    item_master_id: null,
    item_master: null,
    tax_group_id: null,
    tax_group: null,
    account_id: null,
    account: null,
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
    tax_rate: item.tax_group_id
      ? line.tax_rate
      : item.tax_master?.rate != null
        ? String(item.tax_master.rate)
        : line.tax_rate,
  };
}

export function SalesLineEditor({ lines, readOnly, onChange }: Props) {
  const updateLine = (key: string, patch: Partial<SalesLineDraft>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
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
              <th className="py-2 pr-2 font-medium">Tax</th>
              <th className="py-2 pr-2 font-medium">Tax %</th>
              <th className="py-2 pr-2 text-right font-medium">Net</th>
              <th className="py-2 pr-2 text-right font-medium">Tax amt</th>
              {!readOnly ? <th className="py-2 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const preview = computeLinePreview(line);
              return (
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
                            tax_group: value?.item ?? (value?.[key] ? { id: value[key], name: value.name } : null),
                            tax_rate: '',
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
                  <td className="py-2 pr-2" style={{ width: 80 }}>
                    {readOnly || line.tax_group_id ? (
                      <span className="text-muted-foreground">{line.tax_group_id ? '—' : line.tax_rate || '—'}</span>
                    ) : (
                      <Input
                        value={line.tax_rate}
                        onChange={(e) => updateLine(line.key, { tax_rate: e.target.value })}
                        placeholder="%"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right">{moneyLabel(preview.taxable)}</td>
                  <td className="py-2 pr-2 text-right">{moneyLabel(preview.tax_amount)}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
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
