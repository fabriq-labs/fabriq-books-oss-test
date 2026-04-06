import React, { useMemo, useCallback, useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { useToast } from "@/components/ui/use-toast";
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/formatters';

// Styles for the date input to hide default calendar picker
const dateInputStyles = {
    '::-webkit-calendar-picker-indicator': {
        display: 'none',
        opacity: 0,
        position: 'absolute',
        right: 0,
        width: 0,
        background: 'none'
    },
    '::-webkit-datetime-edit': {
        paddingRight: '1rem'
    },
    appearance: 'textfield'
} as React.CSSProperties;

interface PurchaseLineItemRowProps {
    item: any;
    isDeleting: boolean;
    openPopover: boolean;
    onPopoverChange: (open: boolean) => void;
    onQuantityChange: (id: string, sourceKey: string, value: string) => void;
    onQuantityBlur: (id: string, sourceKey: string, value: string) => void;
    onDateInput: (id: string, value: string) => void;
    onDateKeyPress: (e: React.KeyboardEvent<HTMLInputElement>, id: string, value: string) => void;
    onDateChange: (id: string, date: Date | undefined) => void;
    onDelete: (id: string) => void;
    onItemChange: (id: string, sourceKey: string, key: string, value: any) => void;
    onSupplierChange: (id: string, sourceKey: string, key: string, value: any) => void;
    readOnly: boolean;
    itemDetails: any[];
}

/**
 * PurchaseLineItemRow Component
 * 
 * Renders a single row in the purchase line items table. This component handles the display
 * and interaction for a single item including:
 * - Item selection via dropdown
 * - Quantity input
 * - Rate display
 * - Date selection with calendar
 * - Total calculation
 * - Delete functionality
 */
const PurchaseLineItemRow: React.FC<PurchaseLineItemRowProps> = ({
    item,
    isDeleting,
    openPopover,
    onPopoverChange,
    onQuantityChange,
    onQuantityBlur,
    onDateInput,
    onDateKeyPress,
    onDateChange,
    onDelete,
    onItemChange,
    onSupplierChange,
    readOnly,
    itemDetails
}) => {
    const { toast } = useToast();
    const [showAllSuppliers, setShowAllSuppliers] = useState(false);

    // Wrapper function to check for duplicates before calling onItemChange
    const handleItemSelection = useCallback((sourceKey: string, key: string, value: any, fields?: any) => {
        // Check if this product is already selected in another line item
        const isDuplicate = itemDetails?.some(otherItem =>
            otherItem?.id !== item?.id && // Not the current item
            otherItem?.product_id === value[key] && // Same product ID
            value[key] // Product ID exists
        );

        if (isDuplicate) {
            toast({
                title: "Duplicate Product Error",
                description: "This product is already selected in another line item. Please choose a different product.",
                variant: "destructive",
            });
            return; // Prevent the selection from proceeding
        }

        // Call the original onItemChange function only if not duplicate
        onItemChange(item.id, sourceKey, key, value);
    }, [itemDetails, item?.id, toast, onItemChange]);

    // Memoize the SearchDropDown component for item selection
    const MemoizedSearchDropDown = useMemo(() => (
        <SearchDropDown
            instanceType="item_master"
            instanceSourceKey="product_id"
            instanceKey="id"
            instanceLabel="item_name"
            instanceValue={
                item?.product_id ? {
                    id: item?.product_id,
                    item_name: item?.item_name
                } : ''
            }
            onSelectItem={handleItemSelection}
            limit="10"
            searchParams="item_name"
            isShowSearch
            autoFocus
            disabled={isDeleting || readOnly}
        />
    ), [item?.product_id, item?.item_name, item.id, isDeleting, handleItemSelection, itemDetails]);

    // Create supplier filters based on item selection and toggle state
    const supplierFilters = useMemo(() => {
        if (!item?.product_id || showAllSuppliers) {
            return undefined; // No filter, show all
        }
        return {
            supplier_items: {
                some: {
                    item_id: item.product_id
                }
            }
        };
    }, [item?.product_id, showAllSuppliers]);

    // Memoize the SearchDropDown component for supplier selection
    const MemoizedSupplierDropDown = useMemo(() => (
        <SearchDropDown
            instanceType="supplier"
            instanceSourceKey="supplier_id"
            instanceKey="id"
            instanceLabel="supplier_name"
            instanceValue={
                item?.supplier_id ? {
                    id: item?.supplier_id,
                    supplier_name: item?.supplier_name
                } : ''
            }
            onSelectItem={(sourceKey, key, value) => 
                onSupplierChange(item.id, sourceKey, key, value)
            }
            limit="10"
            searchParams="supplier_name"
            isShowSearch
            disabled={!item?.product_id || isDeleting || readOnly}
            additionalFilters={supplierFilters}
        />
    ), [item?.supplier_id, item?.supplier_name, item?.product_id, item.id, isDeleting, readOnly, onSupplierChange, supplierFilters]);

    return (
        <TableRow className={cn(isDeleting && "opacity-50")}>
            {/* <TableCell>
                <span className="text-sm text-gray-700">
                    {item?.item_number || '-'}
                </span>
            </TableCell> */}
            <TableCell>
                {MemoizedSearchDropDown}
            </TableCell>
            <TableCell>
                <span className="text-sm text-gray-700">
                    {item?.item_code || '-'}
                </span>
            </TableCell>
            <TableCell>
                <span className="text-sm text-gray-700">
                    {item?.uom || '-'}
                </span>
            </TableCell>
            <TableCell>
                <div className="flex flex-col gap-1">
                    {MemoizedSupplierDropDown}
                    {item?.product_id && (
                        <button
                            type="button"
                            onClick={() => setShowAllSuppliers(!showAllSuppliers)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline self-start"
                            disabled={isDeleting || readOnly}
                        >
                            {showAllSuppliers ? 'Show Mapped Only' : 'Show All Suppliers'}
                        </button>
                    )}
                </div>
            </TableCell>
            <TableCell>
                <div className="flex relative">
                    <Input
                        type="text"
                        value={item?.need_by_date || ''}
                        onChange={(e) => onDateInput(item.id, e.target.value)}
                        onKeyDown={(e) => onDateKeyPress(e, item.id, e.currentTarget.value)}
                        className="w-full h-8 px-2 text-sm pr-8 [&::-webkit-calendar-picker-indicator]:hidden"
                        style={dateInputStyles}
                        disabled={!item?.product_id || isDeleting || readOnly}
                        placeholder="YYYY-MM-DD"
                        maxLength={10}
                    />
                    <Popover
                        open={openPopover}
                        onOpenChange={(open) => !isDeleting && onPopoverChange(open)}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant={"ghost"}
                                size="icon"
                                className="h-8 w-8 absolute right-0"
                                disabled={!item?.product_id || isDeleting || readOnly}
                            >
                                <CalendarIcon className="h-4 w-4 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={item?.need_by_date ? new Date(item.need_by_date) : undefined}
                                onSelect={(date) => onDateChange(item.id, date)}
                                initialFocus
                                className="p-3 pointer-events-auto"
                                disabled={isDeleting || readOnly}
                                fromDate={new Date(new Date().setDate(new Date().getDate() + 1))}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </TableCell>
            <TableCell>
                <Input
                    type="number"
                    value={item?.quantity ?? ''}
                    onChange={(e) => onQuantityChange(item.id, 'quantity', e.target.value)}
                    onBlur={(e) => onQuantityBlur(item.id, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-full h-8 px-2 text-sm"
                    disabled={!item?.product_id || isDeleting || readOnly}
                />
            </TableCell>
            <TableCell>{item?.rate ? formatCurrency(item?.rate) : "-"}</TableCell>
            <TableCell>
                {item?.item_total ? formatCurrency(item?.item_total) : "-"}
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
    );
};

export default React.memo(PurchaseLineItemRow); 