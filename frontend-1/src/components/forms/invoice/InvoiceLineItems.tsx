/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, KeyboardEvent } from 'react';
import { parse, isAfter, startOfDay } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import dayjs from 'dayjs';
import { viewAPI } from '@/api/api';
import { useToast } from "@/components/ui/use-toast";
import InvoiceLineItemRow from './InvoiceLineItemRow';
import { formatCurrency } from '@/lib/formatters';
import { suggestTaxGroupId } from '@/lib/tax/taxPack';


/**
 * PurchaseLineItems Component
 * 
 * A comprehensive component for managing purchase line items in a purchase requisition.
 * This component provides functionality for:
 * - Adding new line items
 * - Editing existing line items
 * - Deleting line items
 * - Managing item quantities
 * - Setting need-by dates
 * - Calculating totals
 * 
 * The component maintains its own state for line items and syncs with the server
 * through API calls for each operation.
 */
const InvoiceLineItems = ({
    budgetLevel,
    details,
    setDetails,
    readOnly,
    requisitionId,
    lineItems,
    setLineItems,
    editingRowId,
    setEditingRowId,
    currentLineItem,
    setCurrentLineItem,
    updateTotalAmount,
    whorFlow,
    showStructuredTax = false,
    taxPack,
    onTaxGroupSelect,
    onClassificationBlur,
    taxSuggestion,
    allowPoMapping = false,
}) => {
    const [itemDetails, setItemDetails] = useState<any>([]);
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [deletingItems, setDeletingItems] = useState<string[]>([]);
    const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
    const { toast } = useToast();
    // Document currency for display only — do not convert line amounts.
    const currencyCode =
        details?.currency?.code ||
        details?.currency?.item?.code ||
        'INR';

    const totalDiscountAmount = useMemo(() => {
        return (itemDetails || []).reduce((sum: number, item: any) => {
            const qty = Number(item.invoice_qty ?? 0) || 0;
            const rate = Number(item.rate ?? 0) || 0;
            const gross = qty * rate;
            const explicit = Number(item.discount_amount ?? 0);
            if (explicit > 0) {
                return sum + explicit;
            }
            const discountRate = Number(item.discount_rate ?? 0);
            if (discountRate > 0 && gross > 0) {
                return sum + Math.round(((gross * discountRate) / 100) * 100) / 100;
            }
            return sum;
        }, 0);
    }, [itemDetails]);

    const showDiscount = totalDiscountAmount > 0;

    useEffect(() => {
        console.log("details", details);
        if (details?.invoice_line_item && Array.isArray(details.invoice_line_item)) {
            const mappedItems = details.invoice_line_item
                .map((item: any) => ({
                    id: item?.id,
                    product_id: item?.item_master?.id,
                    item_name: item?.item_name || item?.item_master?.item_name,
                    item_type: item?.item_master?.item_type,
                    item_description: item?.item_description || item?.item_master?.item_description,
                    rate: item?.rate || item?.item_master?.unit_price || 0,
                    invoice_qty: item?.invoice_qty,
                    line_total: item?.line_total,
                    tax_rate: item?.tax_rate || item?.tax_rate_intra || 0,
                    invoiced_amount: item?.invoiced_amount,
                    supplier: item?.product?.supplier?.supplier_name,
                    uom: item?.product?.uom?.name,
                    item_code: item?.item_code,
                    need_by_date: item?.need_by_date
                        ? dayjs(item?.need_by_date).format("DD-MM-YYYY") : "",
                    budget_line_id: item?.budget_line?.budget_line,
                    budget_period_id: item?.budget_period?.budget_period,
                    cost_center_id: item?.cost_center?.cost_center,
                    item_total: item?.item_total,
                    created_at: item?.created_at,
                    item_number: item?.item_number,
                    line_tax_amount: item?.line_tax_amount,
                    discount_rate: item?.discount_rate,
                    discount_amount: item?.discount_amount,
                    ordered_quantity: item?.ordered_quantity,
                    po_quantity: item?.purchase_order_line_item?.quantity || 0,
                    purchase_order_line_item: item?.purchase_order_line_item,
                    purchase_order_line_item_id: item?.purchase_order_line_item?.id,
                    tax_group_id: item?.tax_group_id || item?.tax_group?.id || null,
                    tax_group_name: item?.tax_group?.name || null,
                    classification_code: item?.classification_code || null,
                    classification_scheme: item?.classification_scheme || null,
                    tax_components: Array.isArray(item?.invoice_line_tax)
                        ? item.invoice_line_tax.map((t: any) => ({
                            component_type: t.component_type,
                            tax_name: t.tax_master?.tax_name || t.tax_name,
                            rate: t.rate,
                            amount: t.amount,
                          }))
                        : [],
                }))
                .filter((item: any) => item.id)
                ;
            setItemDetails((prevItems: any[]) => {
                if (!prevItems || prevItems.length === 0) {
                    return [...mappedItems];
                }
                const previousOrder = new Map(prevItems.map((it: any, idx: number) => [it.id, idx]));
                return [...mappedItems].sort((a: any, b: any) => {
                    const aIdx = previousOrder.has(a.id) ? (previousOrder.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
                    const bIdx = previousOrder.has(b.id) ? (previousOrder.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
                    return aIdx - bIdx;
                });
            });
        }
    }, [details?.invoice_line_item]);
    const updateLineItemApi = useCallback(async (itemId: string, field: string, value: any, data?: any) => {
        try {
            const res = await viewAPI.updateChild(
                "invoice",
                requisitionId,
                "invoice_view",
                "invoice_line_item",
                itemId,
                { [field]: value, ...(data || {}) }
            ) as any;

            if (res.data) {
                setDetails(res.data);
            }
        } catch (error) {
            console.error("Error updating line item:", error);
        }
    }, [requisitionId, setDetails]);


    const handleItemChange = useCallback((id: string, sourceKey: string, key: string, value: any) => {
        // Extract product information from purchase_order_line_item
        const poLineItem = value?.item || value;
        const product = poLineItem?.product || poLineItem?.item_master || poLineItem;
        const poLineItemId = value[key]; // This is the purchase_order_line_item ID

        // Check if this purchase_order_line_item is already selected in another line item
        const isDuplicate = itemDetails?.some(otherItem =>
            otherItem?.id !== id && // Not the current item
            otherItem?.purchase_order_line_item_id === poLineItemId && // Same PO line item ID
            poLineItemId // PO line item ID exists
        );

        if (isDuplicate) {
            toast({
                title: "Duplicate Product Error",
                description: "This product is already selected in another line item. Please choose a different product.",
                variant: "destructive",
            });
            return; // Prevent the selection from proceeding
        }

        // Update local state for UI
        setItemDetails(prevItems =>
            prevItems.map(prevItem =>
                prevItem.id === id
                    ? {
                        ...prevItem,
                        purchase_order_line_item_id: poLineItemId,
                        product_id: product?.id,
                        item_name: poLineItem?.item_name,
                        item_type: product?.item_type,
                        item_description: product?.item_description,
                        rate: product?.unit_price || poLineItem?.rate || 0,
                        supplier: product?.supplier?.supplier_name || poLineItem?.supplier?.supplier_name,
                        uom: product?.uom?.name || poLineItem?.uom?.name,
                        item_code: product?.item_code || poLineItem?.item_code,
                        item_master_id: product?.id,
                        po_quantity: poLineItem?.quantity || 0,
                        purchase_order_line_item: poLineItem,
                        item_total: prevItem.invoice_qty ? (prevItem.invoice_qty * (product?.unit_price || poLineItem?.rate || 0)) : 0
                    }
                    : prevItem
            )
        );

        // Prepare update data with relation syntax
        // Note: sourceKey is "purchase_order_line_item_id" but we need to use "purchase_order_line_item" with connect syntax
        const updateData: any = {
            // Direct fields
            // item_name: poLineItem?.item_name,
            item_type: product?.item_type,
            item_description: product?.item_description,
            rate: product?.unit_price || poLineItem?.rate || 0,
        };

        // Add item_master relation if product ID exists
        if (product?.id) {
            updateData.item_master = { connect: { id: product.id } };
        }

        // Update via API with relation syntax
        // Use "purchase_order_line_item" (not purchase_order_line_item_id) with connect syntax
        updateLineItemApi(id, "purchase_order_line_item", { connect: { id: poLineItemId } }, updateData);
    }, [updateLineItemApi, itemDetails, toast]);

    /** Select a catalog item (item_master) without requiring a PO line mapping. */
    const handleCatalogItemSelect = useCallback(
        (id: string, _sourceKey: string, key: string, value: any) => {
            const product = value?.item || value;
            const productId = value?.[key] || product?.id;
            if (!productId) return;

            const rate = product?.unit_price || 0;
            const defaultGroupId = product?.tax_group_id || product?.tax_group?.id || null;
            const interstateGroupId =
                product?.tax_group_interstate_id || product?.tax_group_interstate?.id || null;

            let suggestedTaxGroupId = defaultGroupId;
            let suggestedTaxGroupName = product?.tax_group?.name || null;
            if (taxSuggestion?.enabled) {
                suggestedTaxGroupId = suggestTaxGroupId({
                    sellerRegionId: taxSuggestion.sellerRegionId,
                    placeOfSupplyId: taxSuggestion.placeOfSupplyId,
                    defaultTaxGroupId: defaultGroupId,
                    interstateTaxGroupId: interstateGroupId,
                    taxTreatment: taxSuggestion.taxTreatment,
                    zeroRatedTaxGroupId: taxSuggestion.zeroRatedTaxGroupId,
                });
                if (!suggestedTaxGroupId) {
                    suggestedTaxGroupName = null;
                } else if (suggestedTaxGroupId === taxSuggestion.zeroRatedTaxGroupId) {
                    suggestedTaxGroupName =
                        taxSuggestion.zeroRatedTaxGroupName || suggestedTaxGroupId;
                } else if (suggestedTaxGroupId === interstateGroupId) {
                    suggestedTaxGroupName =
                        product?.tax_group_interstate?.name || suggestedTaxGroupId;
                } else {
                    suggestedTaxGroupName = product?.tax_group?.name || suggestedTaxGroupId;
                }
            }

            setItemDetails((prevItems) =>
                prevItems.map((prevItem) =>
                    prevItem.id === id
                        ? {
                              ...prevItem,
                              product_id: productId,
                              item_master_id: productId,
                              item_name: product?.item_name,
                              item_type: product?.item_type,
                              item_description: product?.item_description,
                              rate,
                              uom: product?.uom?.name,
                              item_code: product?.item_code,
                              classification_code:
                                  product?.classification_code ||
                                  product?.hsn_code ||
                                  prevItem.classification_code,
                              classification_scheme:
                                  product?.classification_scheme ||
                                  prevItem.classification_scheme,
                              tax_group_id: suggestedTaxGroupId,
                              tax_group_name: suggestedTaxGroupName,
                              item_total: prevItem.invoice_qty
                                  ? prevItem.invoice_qty * rate
                                  : 0,
                              line_total: prevItem.invoice_qty
                                  ? prevItem.invoice_qty * rate
                                  : 0,
                          }
                        : prevItem,
                ),
            );

            const updateData: any = {
                item_name: product?.item_name,
                item_type: product?.item_type,
                item_description: product?.item_description,
                rate,
                // Use scalar FKs only — mixing `item_master: { connect }` with
                // `tax_group_id` makes Prisma reject the nested update.
                item_master_id: productId,
            };
            if (product?.classification_code || product?.hsn_code) {
                updateData.classification_code =
                    product.classification_code || product.hsn_code;
            }
            if (product?.classification_scheme) {
                updateData.classification_scheme = product.classification_scheme;
            }
            if (suggestedTaxGroupId) {
                updateData.tax_group_id = suggestedTaxGroupId;
            } else if (taxSuggestion?.enabled) {
                // Export with no zero-rated group: clear domestic group.
                updateData.tax_group_id = null;
            }

            updateLineItemApi(id, "item_name", product?.item_name, updateData);
        },
        [updateLineItemApi, taxSuggestion],
    );

    const handleRateChange = useCallback((id: string, value: string) => {
        const numericValue = value === "" ? null : parseFloat(value);
        setItemDetails((prevItems) =>
            prevItems.map((item) =>
                item.id === id
                    ? {
                          ...item,
                          rate: numericValue,
                          line_total:
                              item.invoice_qty != null && numericValue != null
                                  ? item.invoice_qty * numericValue
                                  : item.line_total,
                      }
                    : item,
            ),
        );
    }, []);

    const handleRateBlur = useCallback(
        (id: string, value: string) => {
            const numericValue = value === "" ? null : parseFloat(value);
            const record = itemDetails.find((item) => item.id === id);
            const lineTotal =
                record?.invoice_qty != null && numericValue != null
                    ? record.invoice_qty * numericValue
                    : undefined;
            updateLineItemApi(id, "rate", numericValue, {
                ...(lineTotal != null ? { line_total: lineTotal } : {}),
            });
        },
        [itemDetails, updateLineItemApi],
    );



    const handleQuantityChange = (id: string, sourceKey: string, value: string) => {
        const numericValue = value === '' ? null : parseInt(value);
        const record = itemDetails.find(item => item.id === id);

        if (!record) return;

        setItemDetails(prevItems =>
            prevItems.map(item =>
                item.id === id
                    ? {
                        ...item,
                        invoice_qty: numericValue,
                        line_total: item.rate ? ((numericValue || 0) * item.rate) : 0,
                        // line_tax_amount: item.line_total ? ((item.tax_rate || 0) / 100) * item.line_total : 0,
                    }
                    : item
            )
        );
    };
    const handleTaxRateChange = (id: string, sourceKey: string, value: string) => {
        const numericValue = value === '' ? null : parseInt(value);
        setItemDetails(prevItems =>
            prevItems.map(item =>
                item.id === id
                    ? {
                        ...item,
                        tax_rate: numericValue,
                        line_tax_amount: item.line_total ? (((numericValue || 0) / 100) * item.line_total) : 0,
                    }
                    : item
            )
        );
    };
    const handleQuantityBlur = (id: string, sourceKey: string, value: string, record: any) => {
        const numericValue = value === '' ? null : parseInt(value);

        if (!record) return;
        // Check if the value has changed before calling the API
        // Get the original value from details (server data) not from local state
        const originalItem = details?.invoice_line_item?.find((item: any) => item?.id === id);
        const previousValue = originalItem?.invoice_qty ?? null;

        // Normalize both values for comparison (handle null/undefined/0)
        const normalizedPrevious = previousValue === null || previousValue === undefined ? null : Number(previousValue);
        const normalizedCurrent = numericValue === null || numericValue === undefined ? null : Number(numericValue);

        if (normalizedPrevious === normalizedCurrent) {
            return; // No change, skip API call
        }

        // Check if current workflow state is Draft
        const currentStateName = whorFlow?.current_state_ref?.name || '';
        const isDraftState = currentStateName?.toLowerCase() === 'draft';

        // Validation before saving — only when this line is mapped to a PO item
        if (numericValue !== null && record.purchase_order_line_item_id) {
            const poQuantity = record.po_quantity || 0;
            const alreadyInvoicedQty = record.purchase_order_line_item?.invoice_qty || 0;
            const previousQty = normalizedPrevious || 0;

            let remainingQuantity: number;

            if (isDraftState) {
                // In draft state: simple calculation (poQuantity - alreadyInvoicedQty)
                remainingQuantity = poQuantity - alreadyInvoicedQty;
            } else {
                // Not in draft state: account for previous invoice quantity
                // alreadyInvoicedQty includes the current item's quantity, so we need to add back the previous value
                remainingQuantity = poQuantity - alreadyInvoicedQty + previousQty;
            }

            if (numericValue > remainingQuantity) {
                toast({
                    title: "Invoice Quantity Exceeds Available Quantity",
                    description: `PO Quantity: ${poQuantity}, Already Invoiced: ${alreadyInvoicedQty}, Remaining: ${remainingQuantity}. Please enter a quantity less than or equal to ${remainingQuantity}.`,
                    variant: "destructive",
                });
                return;
            }

            if (numericValue < 0) {
                toast({
                    title: "Invalid Quantity",
                    description: "Quantity cannot be negative. Please enter a valid quantity.",
                    variant: "destructive",
                });

                return;
            }
        }


        updateLineItemApi(id, sourceKey, numericValue);
    };
    const handleTaxRateBlur = (id: string, sourceKey: string, value: string) => {
        const numericValue = value === '' ? null : parseInt(value);
        updateLineItemApi(id, sourceKey, numericValue);
    };

    // Handler to update multiple fields at once (for comparison dialog)
    const handleUpdateFields = useCallback((id: string, fields: Record<string, any>) => {
        const fieldEntries = Object.entries(fields);
        if (fieldEntries.length === 0) return;

        const [firstField, firstValue] = fieldEntries[0];
        const remainingFields = Object.fromEntries(fieldEntries.slice(1));

        // Update first field with remaining fields as additional data
        updateLineItemApi(id, firstField, firstValue, remainingFields);

        // Also update local state
        setItemDetails(prevItems =>
            prevItems.map(prevItem =>
                prevItem.id === id
                    ? {
                        ...prevItem,
                        ...fields,
                    }
                    : prevItem
            )
        );
    }, [updateLineItemApi]);

    const handleDateChange = (id: string, date: Date | undefined) => {
        if (!date) return;

        const today = startOfDay(new Date());
        const selectedDate = startOfDay(date);

        if (!isAfter(selectedDate, today)) {
            console.log("Please select a future date");
            return;
        }

        const displayDate = dayjs(date).format("YYYY-MM-DD");
        const apiDate = dayjs(date).format("YYYY-MM-DDTHH:mm:ss.SSS[Z]");

        setItemDetails(prevItems =>
            prevItems.map(item =>
                item.id === id
                    ? { ...item, need_by_date: displayDate }
                    : item
            )
        );

        updateLineItemApi(id, "need_by_date", apiDate);
        setOpenPopovers((prev) => ({ ...prev, [id]: false }));
    };


    const handleDateInput = (id: string, value: string) => {
        const numericValue = value.replace(/\D/g, '');
        let formattedDate = '';

        if (numericValue.length > 0) {
            const year = numericValue.slice(0, 4);
            const month = numericValue.slice(4, 6);
            const day = numericValue.slice(6, 8);

            formattedDate = year + (month ? '-' + month : '') + (day ? '-' + day : '');

            if (numericValue.length >= 8) {
                const isoDate = `${year}-${month}-${day}`;

                try {
                    const parsedDate = parse(isoDate, "yyyy-MM-dd", new Date());
                    if (!isNaN(parsedDate.getTime())) {
                        const today = startOfDay(new Date());
                        const selectedDate = startOfDay(parsedDate);

                        if (!isAfter(selectedDate, today)) {
                            console.log("Please select a future date");
                            return;
                        }

                        handleDateChange(id, parsedDate);
                    }
                } catch (error) {
                    console.log("Invalid date format");
                }
            }
        }

        setItemDetails(prevItems =>
            prevItems.map(item =>
                item.id === id
                    ? { ...item, need_by_date: formattedDate }
                    : item
            )
        );
    };

    /**
     * Adds a new line item
     */
    const addLineItem = useCallback(async () => {
        // Check if there's already an empty line item
        const hasEmptyItem = itemDetails.some(item =>
            !item.product_id && !item.item_name && !item.invoice_qty && !item.rate
        );

        if (hasEmptyItem) {
            toast({
                title: "Empty Line Item Found",
                description: "Please complete the existing empty line item before adding a new one.",
                variant: "destructive",
            });
            return;
        }

        setIsAddingItem(true);
        try {
            const response = await viewAPI.addChild(
                "invoice",
                requisitionId,
                "invoice_view",
                "invoice_line_item",
                {}
            ) as any;

            if (response?.data) {
                // Only update the details - let the useEffect handle the itemDetails sync
                setDetails(response?.data);
            }
        } catch (error) {
            console.error("Error adding line item:", error);
            toast({
                title: "Error Adding Line Item",
                description: "Failed to add line item. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsAddingItem(false);
        }
    }, [itemDetails, toast, requisitionId, setDetails]);

    const deleteLineItem = async (id: string) => {
        setDeletingItems(prev => [...prev, id]);
        try {
            const res = await viewAPI.deleteChild(
                "invoice",
                requisitionId,
                "invoice_view",
                "invoice_line_item",
                id
            );
            setDetails(res);
            setItemDetails(prevItems => prevItems.filter(item => item.id !== id));
        } catch (error) {
            console.error("Error deleting line item:", error);
        } finally {
            setDeletingItems(prev => prev.filter(itemId => itemId !== id));
        }
    };

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
        // Alt + N to add new item
        if (e.altKey && e.key === 'n') {
            e.preventDefault();
            if (!isAddingItem && !readOnly) {
                addLineItem();
            }
        }
    }, [isAddingItem, readOnly, addLineItem]);

    return (
        <Card
            className="shadow-sm"
            onKeyDown={handleKeyDown}
            tabIndex={0} // Make the card focusable
        >
            <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <CardTitle className="text-lg">Invoice Line Items</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Press Alt + N to add a new item. Each product can only be selected once.
                        </p>
                    </div>
                    <Button
                        onClick={addLineItem}
                        className="bg-primary hover:bg-primary/90"
                        disabled={isAddingItem || readOnly}
                    >
                        {isAddingItem ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Item
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table className='"min-w-[1100px]"'>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[220px]">Item Name</TableHead>
                                {allowPoMapping && (
                                    <>
                                        <TableHead className="w-[100px]">PO Qty</TableHead>
                                        <TableHead className="w-[100px]">Invoiced</TableHead>
                                        <TableHead className="w-[100px]">Available</TableHead>
                                    </>
                                )}
                                <TableHead className="w-[120px]">Invoice Qty</TableHead>
                                <TableHead className="w-[100px]">Rate</TableHead>
                                {showStructuredTax && (
                                    <TableHead className="w-[120px]">
                                        {taxPack?.classificationLabel || 'HSN / SAC'}
                                    </TableHead>
                                )}
                                <TableHead className="w-[140px]">
                                    {showStructuredTax
                                        ? taxPack?.taxGroupLabel || 'Tax'
                                        : 'Tax Rate'}
                                </TableHead>
                                <TableHead className="w-[120px]">Discount Amount</TableHead>
                                <TableHead className="w-[120px]">Line Tax Amount</TableHead>
                                <TableHead className="w-[120px]">Line Total</TableHead>
                                <TableHead className="w-[80px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {itemDetails.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={
                                            (allowPoMapping ? 10 : 7) +
                                            (showStructuredTax ? 1 : 0) +
                                            1
                                        }
                                        className="text-center h-24 text-muted-foreground"
                                    >
                                        No items added yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                itemDetails.map((item) => (
                                    <InvoiceLineItemRow
                                        key={item.id}
                                        item={item}
                                        isDeleting={deletingItems.includes(item.id)}
                                        onQuantityChange={handleQuantityChange}
                                        onTaxRateChange={handleTaxRateChange}
                                        onQuantityBlur={handleQuantityBlur}
                                        onTaxRateBlur={handleTaxRateBlur}
                                        onDelete={deleteLineItem}
                                        onItemChange={handleItemChange}
                                        onCatalogItemSelect={handleCatalogItemSelect}
                                        onRateChange={handleRateChange}
                                        onRateBlur={handleRateBlur}
                                        onUpdateFields={handleUpdateFields}
                                        readOnly={readOnly}
                                        itemDetails={itemDetails}
                                        purchaseOrderId={details?.purchase_order_id || details?.purchase_order?.id}
                                        poLineItems={details?.purchase_order?.purchase_order_item || []}
                                        invoiceStatus={whorFlow?.current_state_ref?.name}
                                        showStructuredTax={showStructuredTax}
                                        taxPack={taxPack}
                                        onTaxGroupSelect={onTaxGroupSelect}
                                        onClassificationBlur={onClassificationBlur}
                                        allowPoMapping={allowPoMapping}
                                        currencyCode={currencyCode}
                                    />
                                ))
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-gray-50">
                                <TableCell
                                    colSpan={
                                        (allowPoMapping ? 10 : 7) +
                                        (showStructuredTax ? 1 : 0) +
                                        1
                                    }
                                    className="p-0"
                                >
                                    <div className="flex justify-end p-4 space-y-2">
                                        <div className="w-64 space-y-3">
                                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                                <span className="text-sm font-medium text-gray-600">Item Total :</span>
                                                <span className="text-sm font-semibold text-gray-800">
                                                    {formatCurrency(details?.invoice_net_total || 0, currencyCode)}
                                                </span>
                                            </div>
                                            {showDiscount ? (
                                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                                    <span className="text-sm font-medium text-gray-600">Discount Amount:</span>
                                                    <span className="text-sm font-semibold text-gray-800">
                                                        {formatCurrency(totalDiscountAmount, currencyCode)}
                                                    </span>
                                                </div>
                                            ) : null}
                                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                                <span className="text-sm font-medium text-gray-600">Tax Total:</span>
                                                <span className="text-sm font-semibold text-gray-800">
                                                    {formatCurrency(details?.tax_total || 0, currencyCode)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center py-3 bg-violet-50 px-3 rounded-lg border-2 border-violet-200">
                                                <span className="text-base font-bold text-violet-900">Invoice Amount:</span>
                                                <span className="text-lg font-bold text-violet-900">
                                                    {formatCurrency(details?.invoice_total || 0, currencyCode)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default InvoiceLineItems;