/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, Link2, ChevronDown } from "lucide-react";
import { cn, truncateText } from "@/lib/utils";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { useToast } from "@/components/ui/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InvoiceLineItemComparisonDialog } from "./InvoiceLineItemComparisonDialog";
import { formatCurrency } from "@/lib/formatters";
// Styles for the date input to hide default calendar picker

interface InvoiceLineItemRowProps {
  item: any;
  isDeleting: boolean;
  onQuantityChange: (id: string, sourceKey: string, value: string) => void;
  onQuantityBlur: (
    id: string,
    sourceKey: string,
    value: string,
    record: any,
  ) => void;
  onTaxRateChange: (id: string, sourceKey: string, value: string) => void;
  onTaxRateBlur: (id: string, sourceKey: string, value: string) => void;
  onDelete: (id: string) => void;
  onItemChange: (
    id: string,
    sourceKey: string,
    key: string,
    value: any,
  ) => void;
  onCatalogItemSelect?: (
    id: string,
    sourceKey: string,
    key: string,
    value: any,
  ) => void;
  onRateChange?: (id: string, value: string) => void;
  onRateBlur?: (id: string, value: string) => void;
  onUpdateFields?: (id: string, fields: Record<string, any>) => void;
  readOnly: boolean;
  itemDetails: any[];
  purchaseOrderId?: string | number;
  poLineItems?: any[];
  invoiceStatus?: string | number;
  showStructuredTax?: boolean;
  taxPack?: any;
  onTaxGroupSelect?: (
    id: string,
    taxGroupId: string | null,
    taxGroup?: any,
  ) => void;
  onClassificationBlur?: (id: string, code: string) => void;
  /** When true, show optional PO line mapping + PO qty columns. */
  allowPoMapping?: boolean;
  /** Document currency code for display (e.g. INR, USD). Amounts are not converted. */
  currencyCode?: string;
}

const InvoiceLineItemRow: React.FC<InvoiceLineItemRowProps> = ({
  item,
  isDeleting,
  onQuantityChange,
  onQuantityBlur,
  onDelete,
  onUpdateFields,
  onTaxRateChange,
  onTaxRateBlur,
  onItemChange,
  onCatalogItemSelect,
  onRateChange,
  onRateBlur,
  readOnly,
  itemDetails,
  purchaseOrderId,
  poLineItems,
  showStructuredTax = false,
  taxPack,
  onTaxGroupSelect,
  onClassificationBlur,
  allowPoMapping = false,
  currencyCode = 'INR',
}) => {
  const { toast } = useToast();
  const [showMappingDropdown, setShowMappingDropdown] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<any>(null);
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);

  // Handler for when PO line item is selected - shows comparison dialog instead of directly mapping
  const handlePOItemSelection = useCallback(
    (sourceKey: string, key: string, value: any) => {
      // Check if this purchase_order_line_item is already selected in another line item
      const isDuplicate = itemDetails?.some(
        (otherItem) =>
          otherItem?.id !== item?.id && // Not the current item
          otherItem?.purchase_order_line_item_id === value[key] && // Same PO line item ID
          value[key], // PO line item ID exists
      );

      if (isDuplicate) {
        toast({
          title: "Duplicate Product Error",
          description:
            "This product is already selected in another line item. Please choose a different product.",
          variant: "destructive",
        });
        return; // Prevent the selection from proceeding
      }

      // Store the pending selection and show comparison dialog
      setPendingSelection({ sourceKey, key, value });
      setShowComparisonDialog(true);
      setShowMappingDropdown(false);
    },
    [itemDetails, item?.id, toast],
  );

  // Final handler that actually maps the item after approval
  const handleApproveMapping = useCallback(
    (useInvoiceValues: boolean) => {
      if (!pendingSelection) return;

      const poLineItem = pendingSelection.value?.item || pendingSelection.value;
      const product =
        poLineItem?.product || poLineItem?.item_master || poLineItem;
      const invoiceQty = item?.invoice_qty || item?.ordered_quantity || 0;

      if (useInvoiceValues) {
        // Use invoice values: Map PO but keep invoice rate, tax_rate, and recalculate amounts
        const invoiceRate = item?.rate || 0;
        const invoiceTaxRate = item?.tax_rate || 0;
        const invoiceLineTotal = invoiceRate * invoiceQty;
        const invoiceLineTaxAmount = (invoiceLineTotal * invoiceTaxRate) / 100;

        // Modify the product structure to have invoice rate so handleItemChange uses it
        const modifiedProduct = product
          ? {
              ...product,
              unit_price: invoiceRate, // This will be used by handleItemChange to set rate
            }
          : null;

        const modifiedPoLineItem = {
          ...poLineItem,
          rate: invoiceRate,
          tax_rate: invoiceTaxRate,
          product: modifiedProduct,
          item_master: modifiedProduct,
        };

        const modifiedValue = {
          ...pendingSelection.value,
          item: modifiedPoLineItem,
          rate: invoiceRate,
          tax_rate: invoiceTaxRate,
        };

        // Map PO line item with modified rate (same PO ID, but invoice rate)
        onItemChange(
          item.id,
          pendingSelection.sourceKey,
          pendingSelection.key,
          modifiedValue,
        );

        // Then update tax_rate, line_total, and line_tax_amount to invoice values
        setTimeout(() => {
          if (onUpdateFields) {
            onUpdateFields(item.id, {
              tax_rate: invoiceTaxRate,
              line_total: invoiceLineTotal,
              line_tax_amount: invoiceLineTaxAmount,
            });
          } else {
            // Fallback: Update tax_rate which will trigger recalculation
            onTaxRateChange(item.id, "tax_rate", String(invoiceTaxRate));
            onTaxRateBlur(item.id, "tax_rate", String(invoiceTaxRate));
          }
        }, 150);

        toast({
          title: "Mapping Approved",
          description:
            "Invoice line item mapped to PO line item. Invoice values (rate, tax rate) preserved.",
        });
      } else {
        // Use PO values: Map PO and use PO rate, tax_rate, and recalculate amounts
        const poRate = product?.unit_price || poLineItem?.rate || 0;
        const poTaxRate = poLineItem?.tax_rate || 0;
        const poLineTotal = poRate * invoiceQty;
        const poLineTaxAmount = (poLineTotal * poTaxRate) / 100;

        // Map PO line item (this will set rate from PO)
        onItemChange(
          item.id,
          pendingSelection.sourceKey,
          pendingSelection.key,
          pendingSelection.value,
        );

        // Then update tax_rate, line_total, and line_tax_amount to PO values
        setTimeout(() => {
          if (onUpdateFields) {
            onUpdateFields(item.id, {
              tax_rate: poTaxRate,
              line_total: poLineTotal,
              line_tax_amount: poLineTaxAmount,
            });
          } else {
            // Fallback: Update tax_rate
            onTaxRateChange(item.id, "tax_rate", String(poTaxRate));
            onTaxRateBlur(item.id, "tax_rate", String(poTaxRate));
          }
        }, 150);

        toast({
          title: "Mapping Approved",
          description:
            "Invoice line item mapped to PO line item. PO item values (rate, tax rate) applied.",
        });
      }

      // Close dialogs and reset state
      setShowComparisonDialog(false);
      setPendingSelection(null);
    },
    [
      pendingSelection,
      item.id,
      item?.rate,
      item?.tax_rate,
      item?.invoice_qty,
      item?.ordered_quantity,
      onItemChange,
      onTaxRateChange,
      onTaxRateBlur,
      onUpdateFields,
      toast,
    ],
  );

  // Handler to reject/cancel the mapping
  const handleRejectMapping = useCallback(() => {
    setShowComparisonDialog(false);
    setPendingSelection(null);
    setShowMappingDropdown(true); // Reopen the dropdown
  }, []);

  // Direct handler for already-mapped items (no comparison needed)
  const handleItemSelection = useCallback(
    (sourceKey: string, key: string, value: any) => {
      // Check if this purchase_order_line_item is already selected in another line item
      const isDuplicate = itemDetails?.some(
        (otherItem) =>
          otherItem?.id !== item?.id && // Not the current item
          otherItem?.purchase_order_line_item_id === value[key] && // Same PO line item ID
          value[key], // PO line item ID exists
      );

      if (isDuplicate) {
        toast({
          title: "Duplicate Product Error",
          description:
            "This product is already selected in another line item. Please choose a different product.",
          variant: "destructive",
        });
        return; // Prevent the selection from proceeding
      }

      // Call the original onItemChange function only if not duplicate
      onItemChange(item.id, sourceKey, key, value);
    },
    [itemDetails, item?.id, toast, onItemChange],
  );

  // Prepare PO line items as default values for the dropdown
  const poLineItemsForDropdown = useMemo(() => {
    if (!poLineItems || poLineItems.length === 0) return [];
    return poLineItems.map((poItem: any) => ({
      id: poItem?.id,
      item_name: poItem?.item_name,
      product_id: poItem?.product?.id,
      item_master: poItem?.product,
      ...poItem,
    }));
  }, [poLineItems]);

  // Check if this is an unmapped invoice line item (has item_name from upload but no purchase_order_line_item_id)
  const isUnmappedItem = useMemo(() => {
    return !item?.purchase_order_line_item_id && item?.item_name;
  }, [item?.purchase_order_line_item_id, item?.item_name]);

  // Memoize the item picker (+ optional PO mapping when With PO)
  const MemoizedSearchDropDown = useMemo(() => {
    const catalogValue =
      item?.item_master_id || item?.product_id
        ? {
            id: item.item_master_id || item.product_id,
            item_name: item?.item_name,
          }
        : item?.item_name
          ? { id: item.item_master_id || item.id, item_name: item.item_name }
          : undefined;

    const currentPoValue = item?.purchase_order_line_item_id
      ? poLineItemsForDropdown.find(
          (poItem) => poItem.id === item.purchase_order_line_item_id,
        ) || {
          id: item?.purchase_order_line_item_id,
          item_name: item?.item_name,
        }
      : "";

    return (
      <div className="space-y-1.5">
        <SearchDropDown
          instanceType="item_master"
          instanceSourceKey="item_master_id"
          instanceKey="id"
          instanceLabel="item_name"
          instanceValue={catalogValue}
          onSelectItem={(sourceKey: string, key: string, value: any) => {
            onCatalogItemSelect?.(item.id, sourceKey, key, value);
          }}
          onClear={() => {
            onUpdateFields?.(item.id, {
              item_master_id: null,
              item_name: null,
              rate: null,
            });
          }}
          limit="10"
          searchParams="item_name"
          type="item_master"
          isShowSearch
          disabled={isDeleting || readOnly}
          rest={{
            placeholder: "Search catalog item...",
          }}
        />
        {allowPoMapping && (
          <Popover
            open={showMappingDropdown}
            onOpenChange={setShowMappingDropdown}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full text-left",
                  "flex items-center justify-between gap-2",
                  "px-1 py-0.5 rounded",
                  "transition-colors duration-200",
                )}
                disabled={isDeleting || readOnly}
              >
                <span
                  className={cn(
                    "text-xs font-medium",
                    item.purchase_order_line_item_id
                      ? "text-muted-foreground"
                      : "text-amber-700",
                  )}
                >
                  {item.purchase_order_line_item_id
                    ? `PO: ${truncateText(
                        item?.purchase_order_line_item?.item_name ||
                          item?.item_name,
                        24,
                      )} (change)`
                    : "Optional: map to PO item"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform",
                    showMappingDropdown && "transform rotate-180",
                  )}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-3"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  {item.purchase_order_line_item_id
                    ? `Change PO mapping for "${item?.item_name || truncateText(item?.purchase_order_line_item?.item_name)}"`
                    : `Optionally map "${item?.item_name || "this line"}" to a PO line item:`}
                </p>
                <SearchDropDown
                  instanceType="purchase_order_line_item"
                  instanceSourceKey="purchase_order_line_item_id"
                  instanceKey="id"
                  instanceLabel="item_name"
                  instanceValue={currentPoValue}
                  defaultValue={poLineItemsForDropdown}
                  onSelectItem={
                    item.purchase_order_line_item_id
                      ? handleItemSelection
                      : handlePOItemSelection
                  }
                  limit="10"
                  searchParams="item_name"
                  isShowSearch
                  disabled={isDeleting || readOnly}
                  skipApiCall
                  excludeIds={itemDetails
                    .filter(
                      (otherItem) =>
                        otherItem?.id !== item?.id &&
                        otherItem?.purchase_order_line_item_id,
                    )
                    .map((otherItem) => otherItem.purchase_order_line_item_id)}
                  rest={{
                    placeholder: "Search and select PO line item...",
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }, [
    allowPoMapping,
    item.purchase_order_line_item_id,
    item?.item_name,
    item?.purchase_order_line_item?.item_name,
    item?.item_master_id,
    item?.product_id,
    item?.id,
    poLineItemsForDropdown,
    showMappingDropdown,
    isDeleting,
    readOnly,
    handlePOItemSelection,
    handleItemSelection,
    itemDetails,
    onCatalogItemSelect,
    onUpdateFields,
  ]);

  // Calculate comparison values for the selected PO line item
  const comparisonData = useMemo(() => {
    if (!pendingSelection || !pendingSelection.value) return null;

    const poLineItem = pendingSelection.value.item || pendingSelection.value;
    const poRate =
      poLineItem?.item_master?.unit_price ||
      poLineItem?.rate ||
      poLineItem?.product?.unit_price ||
      0;
    const poTaxRate = poLineItem?.tax_rate || 0;
    const invoiceQty = item?.invoice_qty || item?.ordered_quantity || 0;

    // Calculate PO line amounts
    const poLineTotal = poRate * invoiceQty;
    const poLineTaxAmount = (poLineTotal * poTaxRate) / 100;
    const poLineTotalWithTax = poLineTotal + poLineTaxAmount;

    // Invoice values
    const invoiceRate = item?.rate || 0;
    const invoiceTaxRate = item?.tax_rate || 0;
    const invoiceLineTotal = item?.line_total || 0;
    const invoiceLineTaxAmount = item?.line_tax_amount || 0;

    return {
      po: {
        rate: poRate,
        taxRate: poTaxRate,
        lineTotal: poLineTotal,
        lineTaxAmount: poLineTaxAmount,
        lineTotalWithTax: poLineTotalWithTax,
        itemName: poLineItem?.item_name || poLineItem?.item_master?.item_name,
      },
      invoice: {
        rate: invoiceRate,
        taxRate: invoiceTaxRate,
        lineTotal: invoiceLineTotal,
        lineTaxAmount: invoiceLineTaxAmount,
        lineTotalWithTax: invoiceLineTotal + invoiceLineTaxAmount,
      },
      differences: {
        rate: invoiceRate - poRate,
        taxRate: invoiceTaxRate - poTaxRate,
        lineTotal: invoiceLineTotal - poLineTotal,
        lineTaxAmount: invoiceLineTaxAmount - poLineTaxAmount,
        lineTotalWithTax:
          invoiceLineTotal + invoiceLineTaxAmount - poLineTotalWithTax,
      },
    };
  }, [pendingSelection, item]);

  return (
    <>
      {/* Comparison Dialog */}
      <InvoiceLineItemComparisonDialog
        open={showComparisonDialog}
        onOpenChange={setShowComparisonDialog}
        comparisonData={comparisonData}
        invoiceItemName={item?.item_name || ""}
        onApprove={handleApproveMapping}
        onReject={handleRejectMapping}
        isDeleting={isDeleting}
        readOnly={readOnly}
      />

      <TableRow className={cn(isDeleting && "opacity-50")}>
        <TableCell>{MemoizedSearchDropDown}</TableCell>
        {allowPoMapping && (
          <>
            <TableCell>
              <span className="text-sm font-medium">
                {item?.purchase_order_line_item_id ? item?.po_quantity || 0 : "—"}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-sm text-gray-600">
                {item?.purchase_order_line_item_id
                  ? item?.purchase_order_line_item?.invoice_qty || 0
                  : "—"}
              </span>
            </TableCell>
            <TableCell>
              {item?.purchase_order_line_item_id ? (
                (() => {
                  const available =
                    (item?.po_quantity || 0) -
                    (item?.purchase_order_line_item?.invoice_qty || 0);
                  const colorClass =
                    available === 0
                      ? "text-red-600"
                      : available <= 5
                        ? "text-orange-600"
                        : "text-green-600";
                  return (
                    <span className={`text-sm font-semibold ${colorClass}`}>
                      {available}
                    </span>
                  );
                })()
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </TableCell>
          </>
        )}
        <TableCell>
          <Input
            type="number"
            value={item?.invoice_qty ?? ""}
            onChange={(e) =>
              onQuantityChange(item.id, "invoice_qty", e.target.value)
            }
            onBlur={(e) =>
              onQuantityBlur(item.id, "invoice_qty", e.target.value, item)
            }
            placeholder="Qty"
            className="w-full min-w-[80px] h-8 px-2 text-sm"
            disabled={isDeleting || readOnly}
            max={
              allowPoMapping && item?.purchase_order_line_item_id
                ? (item?.po_quantity || 0) -
                  (item?.purchase_order_line_item?.invoice_qty || 0)
                : undefined
            }
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            step="any"
            min="0"
            value={item?.rate ?? ""}
            onChange={(e) => onRateChange?.(item.id, e.target.value)}
            onBlur={(e) => onRateBlur?.(item.id, e.target.value)}
            placeholder="Rate"
            className="w-full min-w-[80px] h-8 px-2 text-sm"
            disabled={isDeleting || readOnly}
          />
        </TableCell>
        {showStructuredTax && (
          <TableCell>
            <Input
              defaultValue={item?.classification_code ?? ""}
              key={`cls-${item.id}-${item?.classification_code ?? ""}`}
              onBlur={(e) =>
                onClassificationBlur?.(item.id, e.target.value)
              }
              placeholder={taxPack?.classificationLabel || "HSN / SAC"}
              className="w-full min-w-[80px] h-8 px-2 text-sm"
              disabled={isDeleting || readOnly}
            />
          </TableCell>
        )}
        <TableCell>
          {showStructuredTax ? (
            <div className="space-y-1">
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
                style={{ width: "100%", minHeight: "32px" }}
                disabled={isDeleting || readOnly}
              />
              {item.tax_components && item.tax_components.length > 0 ? (
                <div className="space-y-0.5">
                  {item.tax_components.map((c: any, idx: number) => (
                    <p
                      key={`${item.id}-tc-${idx}`}
                      className="text-[10px] text-muted-foreground"
                    >
                      {(c.component_type || c.tax_name || "tax").toUpperCase()}{" "}
                      {c.rate}% · {formatCurrency(c.amount, currencyCode)}
                    </p>
                  ))}
                </div>
              ) : Number(item.tax_rate) ? (
                <p className="text-[10px] text-muted-foreground">
                  {item.tax_rate}%
                </p>
              ) : null}
            </div>
          ) : (
            <Input
              type="number"
              value={item?.tax_rate ?? ""}
              onChange={(e) =>
                onTaxRateChange(item.id, "tax_rate", e.target.value)
              }
              onBlur={(e) => onTaxRateBlur(item.id, "tax_rate", e.target.value)}
              placeholder="Tax Rate"
              className="w-full min-w-[80px] h-8 px-2 text-sm"
              disabled={isDeleting || readOnly}
            />
          )}
        </TableCell>
        <TableCell>
          {item?.discount_amount
            ? formatCurrency(item?.discount_amount, currencyCode)
            : "-"}
        </TableCell>
        <TableCell>
          {item?.line_tax_amount
            ? formatCurrency(item?.line_tax_amount, currencyCode)
            : "-"}
        </TableCell>
        <TableCell>
          {item?.line_total ? formatCurrency(item.line_total, currencyCode) : "-"}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(item?.id)}
            disabled={isDeleting || readOnly}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
      </TableRow>
    </>
  );
};

export default React.memo(InvoiceLineItemRow);
