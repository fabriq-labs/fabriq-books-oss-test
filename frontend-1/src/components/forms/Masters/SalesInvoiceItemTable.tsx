import React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

/** Hide browser spinner controls on number inputs */
const noSpinnerNumberClass =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export interface SalesInvoiceItem {
  id: number | string;
  product: string;
  period: string;
  quantity: number | string;
  price: number | string;
  discount_rate?: number | string;
  tax: number | string;
  total: number;
  item_name: string;
  item_description: string;
  tax_group_id?: string | null;
  tax_group_name?: string | null;
  classification_code?: string | null;
  classification_scheme?: string | null;
  tax_components?: Array<{
    rate: number;
    amount: number;
    component_type?: string | null;
    tax_name?: string | null;
  }>;
}

interface SalesInvoiceItemTableProps {
  items: SalesInvoiceItem[];
  currencyCode: string;
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  adjustableLabel: string;
  adjustableValue: number | string;
  isAddingItem: boolean;
  taxGroupLabel?: string;
  classificationLabel?: string;
  showStructuredTax?: boolean;
  onAddItem: () => void;
  onItemChange: (
    itemId: number | string,
    field: keyof SalesInvoiceItem,
    value: string | number,
  ) => void;
  onItemBlur: (itemId: number | string, field: string, value: any) => void;
  onRemoveItem: (itemId: number | string) => void;
  onAdjustableLabelChange: (value: string) => void;
  onAdjustableValueChange: (value: number | string) => void;
  onAdjustableBlur?: () => void;
  onProductSelectChange: (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => void;
  onProductSelectClear: (sourceKey: any) => void;
  onTaxGroupSelect?: (
    itemId: number | string,
    taxGroupId: string | null,
    taxGroup?: any,
  ) => void;
}

export const SalesInvoiceItemTable: React.FC<SalesInvoiceItemTableProps> = ({
  items,
  currencyCode,
  subTotal,
  totalDiscount,
  totalTax,
  grandTotal,
  adjustableLabel,
  adjustableValue,
  isAddingItem,
  taxGroupLabel = "Tax",
  classificationLabel = "HSN / SAC",
  showStructuredTax = false,
  onAddItem,
  onItemChange,
  onItemBlur,
  onRemoveItem,
  onAdjustableLabelChange,
  onAdjustableValueChange,
  onAdjustableBlur,
  onProductSelectChange,
  onProductSelectClear,
  onTaxGroupSelect,
}) => {
  const showDiscount = Number(totalDiscount) !== 0;
  const colSpan = showStructuredTax ? 9 : 7;

  const componentSummary = items.reduce(
    (acc: Record<string, number>, item) => {
      for (const c of item.tax_components || []) {
        const key = (c.component_type || c.tax_name || "tax").toUpperCase();
        acc[key] = (acc[key] || 0) + Number(c.amount || 0);
      }
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-4 pt-4 border-t border-border/60">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Line Items</h2>
          <p className="text-sm text-muted-foreground">
            Add line items to your invoice.
          </p>
        </div>
        <Button
          type="button"
          onClick={onAddItem}
          className="bg-primary hover:bg-primary/90"
          disabled={isAddingItem}
        >
          {isAddingItem ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add New Row
            </>
          )}
        </Button>
      </div>

      <div className="overflow-x-auto border border-border/60 rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px] text-[11px] uppercase tracking-wide text-muted-foreground">
                Item Details <span className="text-destructive">*</span>
              </TableHead>
              {showStructuredTax && (
                <TableHead className="w-[100px] text-[11px] uppercase tracking-wide text-muted-foreground">
                  {classificationLabel}
                </TableHead>
              )}
              <TableHead className="w-[100px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Quantity <span className="text-destructive">*</span>
              </TableHead>
              <TableHead className="w-[140px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Rate <span className="text-destructive">*</span>
              </TableHead>
              <TableHead className="w-[110px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Discount (%)
              </TableHead>
              {showStructuredTax ? (
                <TableHead className="w-[180px] text-[11px] uppercase tracking-wide text-muted-foreground">
                  {taxGroupLabel}
                </TableHead>
              ) : (
                <TableHead className="w-[100px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Tax (%)
                </TableHead>
              )}
              <TableHead className="w-[120px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Tax Amt
              </TableHead>
              <TableHead className="w-[160px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Amount
              </TableHead>
              <TableHead className="w-[50px] text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="text-center h-24 text-muted-foreground"
                >
                  Type or click to select an item.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const discountRate = Number(item.discount_rate) || 0;
                const taxRate = Number(item.tax) || 0;
                const taxable = qty * price * (1 - discountRate / 100);
                const taxAmt =
                  item.tax_components && item.tax_components.length > 0
                    ? item.tax_components.reduce(
                        (s, c) => s + Number(c.amount || 0),
                        0,
                      )
                    : (taxable * taxRate) / 100;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="align-top py-3">
                      <SearchDropDown
                        instanceType="item_master"
                        instanceSourceKey={`product_${item.id}`}
                        instanceKey="id"
                        instanceLabel="item_name"
                        instanceValue={
                          item.product
                            ? { id: item.product, item_name: item.item_name }
                            : ""
                        }
                        onSelectItem={onProductSelectChange}
                        onClear={onProductSelectClear}
                        limit="10"
                        searchParams="item_name"
                        isShowSearch
                        style={{ width: "100%", minHeight: "36px" }}
                      />
                      {item.item_description ? (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.item_description}
                        </p>
                      ) : null}
                    </TableCell>
                    {showStructuredTax && (
                      <TableCell className="align-top py-3">
                        <Input
                          value={item.classification_code ?? ""}
                          onChange={(e) =>
                            onItemChange(
                              item.id,
                              "classification_code",
                              e.target.value,
                            )
                          }
                          onBlur={(e) =>
                            onItemBlur(
                              item.id,
                              "classification_code",
                              e.target.value,
                            )
                          }
                          className="h-9 border-border/60"
                          placeholder="Code"
                        />
                        {item.classification_scheme ? (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {item.classification_scheme}
                          </p>
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="align-top py-3 text-right">
                      <Input
                        type="number"
                        step="1"
                        value={item.quantity}
                        onChange={(e) =>
                          onItemChange(
                            item.id,
                            "quantity",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        onBlur={(e) =>
                          onItemBlur(
                            item.id,
                            "quantity",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        required
                        className={`h-9 border-border/60 text-right ${noSpinnerNumberClass}`}
                      />
                    </TableCell>
                    <TableCell className="align-top py-3 text-right">
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(e) =>
                          onItemChange(
                            item.id,
                            "price",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        onBlur={(e) =>
                          onItemBlur(
                            item.id,
                            "price",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        required
                        className={`h-9 border-border/60 text-right ${noSpinnerNumberClass}`}
                      />
                    </TableCell>
                    <TableCell className="align-top py-3 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={item.discount_rate ?? ""}
                        onChange={(e) =>
                          onItemChange(
                            item.id,
                            "discount_rate",
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        onBlur={(e) =>
                          onItemBlur(
                            item.id,
                            "discount_rate",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className={`h-9 border-border/60 text-right ${noSpinnerNumberClass}`}
                      />
                    </TableCell>
                    {showStructuredTax ? (
                      <TableCell className="align-top py-3">
                        <SearchDropDown
                          instanceType="tax_group"
                          instanceSourceKey={`tax_group_${item.id}`}
                          instanceKey="id"
                          instanceLabel="name"
                          searchParams="name"
                          type="tax_group"
                          instanceValue={
                            item.tax_group_id
                              ? {
                                  id: item.tax_group_id,
                                  name: item.tax_group_name || item.tax_group_id,
                                }
                              : undefined
                          }
                          onSelectItem={(_sk: any, key: string, value: any) => {
                            onTaxGroupSelect?.(
                              item.id,
                              value?.[key] || null,
                              value?.item,
                            );
                          }}
                          onClear={() => onTaxGroupSelect?.(item.id, null)}
                          limit="10"
                          isShowSearch
                          style={{ width: "100%", minHeight: "36px" }}
                        />
                        {item.tax_components && item.tax_components.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {item.tax_components.map((c, idx) => (
                              <p
                                key={`${item.id}-tc-${idx}`}
                                className="text-[10px] text-muted-foreground"
                              >
                                {(c.component_type || c.tax_name || "tax").toUpperCase()}{" "}
                                {c.rate}% · {formatCurrency(c.amount, currencyCode)}
                              </p>
                            ))}
                          </div>
                        ) : Number(item.tax) ? (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {item.tax}%
                          </p>
                        ) : null}
                      </TableCell>
                    ) : (
                      <TableCell className="align-top py-3 text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.tax}
                          onChange={(e) =>
                            onItemChange(
                              item.id,
                              "tax",
                              e.target.value === ""
                                ? ""
                                : parseFloat(e.target.value) || 0,
                            )
                          }
                          onBlur={(e) =>
                            onItemBlur(
                              item.id,
                              "tax",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className={`h-9 border-border/60 text-right ${noSpinnerNumberClass}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="align-top py-3 text-right text-sm">
                      {formatCurrency(taxAmt, currencyCode)}
                    </TableCell>
                    <TableCell className="align-top py-3 text-right font-medium">
                      {formatCurrency(Number(item.total) || 0, currencyCode)}
                    </TableCell>
                    <TableCell className="align-top py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={colSpan - 2} className="text-right">
                Subtotal
              </TableCell>
              <TableCell className="text-right" colSpan={2}>
                {formatCurrency(subTotal, currencyCode)}
              </TableCell>
            </TableRow>
            {showDiscount ? (
              <TableRow>
                <TableCell colSpan={colSpan - 2} className="text-right">
                  Discount
                </TableCell>
                <TableCell className="text-right" colSpan={2}>
                  -{formatCurrency(totalDiscount, currencyCode)}
                </TableCell>
              </TableRow>
            ) : null}
            {Object.keys(componentSummary).length > 0
              ? Object.entries(componentSummary).map(([label, amt]) => (
                  <TableRow key={label}>
                    <TableCell colSpan={colSpan - 2} className="text-right">
                      {label}
                    </TableCell>
                    <TableCell className="text-right" colSpan={2}>
                      {formatCurrency(amt, currencyCode)}
                    </TableCell>
                  </TableRow>
                ))
              : (
                <TableRow>
                  <TableCell colSpan={colSpan - 2} className="text-right">
                    Total Tax
                  </TableCell>
                  <TableCell className="text-right" colSpan={2}>
                    {formatCurrency(totalTax, currencyCode)}
                  </TableCell>
                </TableRow>
              )}
            <TableRow>
              <TableCell colSpan={colSpan - 2} className="text-right">
                <div className="flex justify-end items-center gap-2">
                  <Input
                    value={adjustableLabel}
                    onChange={(e) => onAdjustableLabelChange(e.target.value)}
                    onBlur={onAdjustableBlur}
                    className="h-8 w-28 text-right"
                  />
                  <Input
                    type="number"
                    value={adjustableValue}
                    onChange={(e) =>
                      onAdjustableValueChange(
                        e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                      )
                    }
                    onBlur={onAdjustableBlur}
                    className={`h-8 w-28 text-right ${noSpinnerNumberClass}`}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right" colSpan={2}>
                {formatCurrency(Number(adjustableValue) || 0, currencyCode)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={colSpan - 2} className="text-right font-semibold">
                Grand Total
              </TableCell>
              <TableCell className="text-right font-semibold" colSpan={2}>
                {formatCurrency(grandTotal, currencyCode)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
};
