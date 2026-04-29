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

interface SalesInvoiceItem {
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
  onAddItem,
  onItemChange,
  onItemBlur,
  onRemoveItem,
  onAdjustableLabelChange,
  onAdjustableValueChange,
  onAdjustableBlur,
  onProductSelectChange,
  onProductSelectClear,
}) => {
  return (
    <div className="space-y-4 pt-4 border-t border-border/60">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Invoice Items
          </h2>
          <p className="text-sm text-muted-foreground">
            Add products to your invoice.
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
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </>
          )}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">
                Product <span className="text-destructive">*</span>
              </TableHead>
              <TableHead className="w-[100px] text-right">
                Quantity <span className="text-destructive">*</span>
              </TableHead>
              <TableHead className="w-[140px] text-right">
                Price <span className="text-destructive">*</span>
              </TableHead>
              <TableHead className="w-[110px] text-right">Discount %</TableHead>
              <TableHead className="w-[100px] text-right">Tax (%)</TableHead>
              <TableHead className="w-[180px] text-right">Total</TableHead>
              <TableHead className="w-[50px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center h-24 text-muted-foreground"
                >
                  There are no invoice items line items for this invoice.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top py-3">
                    {item.product ? (
                      <SearchDropDown
                        instanceType="item_master"
                        instanceSourceKey={`product_${item.id}`}
                        instanceKey="id"
                        instanceLabel="item_name"
                        instanceValue={{
                          id: item.product,
                          item_name:
                            item.item_name

                        }}
                        onSelectItem={onProductSelectChange}
                        onClear={onProductSelectClear}
                        limit="10"
                        searchParams="item_name"
                        isShowSearch
                        autoFocus
                        style={{ width: "100%", minHeight: "36px" }}
                      />
                    ) : item.item_name || item.item_description ? (
                      <span className="text-sm text-foreground py-2 block">
                        {item.item_name || item.item_description}
                      </span>
                    ) : (
                      <SearchDropDown
                        instanceType="item_master"
                        instanceSourceKey={`product_${item.id}`}
                        instanceKey="id"
                        instanceLabel="item_name"
                        instanceValue=""
                        onSelectItem={onProductSelectChange}
                        onClear={onProductSelectClear}
                        limit="10"
                        searchParams="item_name"
                        isShowSearch
                        autoFocus
                        style={{ width: "100%", minHeight: "36px" }}
                      />
                    )}
                  </TableCell>
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
                      className="h-9 border-border/60 text-right"
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
                      className="h-9 border-border/60 text-right"
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
                      className="h-9 border-border/60 text-right"
                    />
                  </TableCell>

                  <TableCell className="align-top py-3 text-right">
                    <Input
                      type="number"
                      max={100}
                      step="1"
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
                      className="h-9 border-border/60 text-right"
                    />
                  </TableCell>

                  <TableCell className="align-top py-3 text-right">
                    <Input
                      value={
                        item.total
                          ? formatCurrency(item.total, currencyCode)
                          : ""
                      }
                      readOnly
                      className="h-9 w-full bg-violet-50 border-violet-200 font-semibold text-right rounded-md"
                    />
                  </TableCell>

                  <TableCell className="align-top py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => onRemoveItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-gray-50">
              <TableCell colSpan={7} className="p-0">
                <div className="flex justify-end p-4 space-y-2">
                  <div className="w-64 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-600">
                        Sub Total:
                      </span>
                      <span className="text-sm font-semibold text-gray-800">
                        {formatCurrency(subTotal, currencyCode)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-600">
                        Discount Amount:
                      </span>
                      <span className="text-sm font-semibold text-gray-800">
                        {formatCurrency(totalDiscount, currencyCode)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-600">
                        Total Tax:
                      </span>
                      <span className="text-sm font-semibold text-gray-800">
                        {formatCurrency(totalTax, currencyCode)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 py-2 border-b border-gray-200">
                      <Input
                        type="text"
                        value={adjustableLabel}
                        onChange={(e) => onAdjustableLabelChange(e.target.value)}
                        onFocus={() => {
                          if (adjustableLabel === "Adjustable") {
                            onAdjustableLabelChange("");
                          }
                        }}
                        onBlur={() => {
                          if (!adjustableLabel.trim()) {
                            onAdjustableLabelChange("Adjustable");
                          }
                          onAdjustableBlur?.();
                        }}
                        className="h-9 border-border/60"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={adjustableValue}
                        onChange={(e) =>
                          onAdjustableValueChange(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        onFocus={() => {
                          if (Number(adjustableValue) === 0) {
                            onAdjustableValueChange("");
                          }
                        }}
                        onBlur={() => {
                          if (
                            adjustableValue === "" ||
                            adjustableValue === null ||
                            adjustableValue === undefined
                          ) {
                            onAdjustableValueChange(0);
                          }
                          onAdjustableBlur?.();
                        }}
                        className="h-9 border-border/60 text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center py-3 bg-violet-50 px-3 rounded-lg border-2 border-violet-200">
                      <span className="text-base font-bold text-violet-900">
                        Grand Total:
                      </span>

                      <span className="text-lg font-bold text-violet-900">
                        {formatCurrency(grandTotal, currencyCode)}
                      </span>
                    </div>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
};

export default SalesInvoiceItemTable;

