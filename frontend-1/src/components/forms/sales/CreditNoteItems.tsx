import React, { useCallback, useMemo, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { viewAPI } from '@/api/api';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/formatters";

interface CreditNoteItemsProps {
    creditNoteId: string;
    details: any;
    setDetails: React.Dispatch<React.SetStateAction<any>>;
    currentCurrency: string;
}

export const CreditNoteItems: React.FC<CreditNoteItemsProps> = ({
    creditNoteId,
    details,
    setDetails,
    currentCurrency
}) => {
    const { toast } = useToast();
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [removingItemId, setRemovingItemId] = useState<string | null>(null);
    const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

    const validCurrency = currentCurrency && currentCurrency.trim() !== '' ? currentCurrency : 'USD';

    // Sort by created_at (oldest first), same as SalesOrderItems / QuoteItems
    function sortCreditNoteItemsByCreatedAt(items: any[]): any[] {
        if (!items?.length) return items ?? [];
        return [...items].sort((a: any, b: any) => {
            if (a.created_at && b.created_at) {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            if (a.created_at && !b.created_at) return -1;
            if (!a.created_at && b.created_at) return 1;
            return String(a.id).localeCompare(String(b.id));
        });
    }

    const updateLineItemApi = useCallback(async (itemId: string, field: string, value: any, data?: any) => {
        setUpdatingItemId(itemId);
        try {
            const res = await viewAPI.updateChild(
                "credit_note",
                creditNoteId,
                "credit_note_view",
                "credit_note_item",
                itemId,
                { [field]: value, ...(data || {}) }
            ) as any;
            if (res.data) {
                const sortedItems = sortCreditNoteItemsByCreatedAt(res.data.credit_note_item ?? []);
                setDetails({
                    ...res.data,
                    credit_note_item: sortedItems
                });
            }
        } catch (error) {
            console.error("Error updating line item:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to update line item",
            });
        } finally {
            setUpdatingItemId(null);
        }
    }, [creditNoteId, setDetails, toast]);

    const addItem = async () => {
        setIsAddingItem(true);
        try {
            const response = await viewAPI.addChild(
                "credit_note",
                creditNoteId,
                "credit_note_view",
                "credit_note_item",
                {}
            ) as any;
            if (response?.data) {
                const sortedItems = sortCreditNoteItemsByCreatedAt(response.data.credit_note_item ?? []);

                setDetails({
                    ...response.data,
                    credit_note_item: sortedItems,
                });
            }
        } catch (error) {
            console.error("Error adding line item:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to add line item",
            });
        } finally {
            setIsAddingItem(false);
        }
    };

    const removeItem = async (itemId: string) => {
        setRemovingItemId(itemId);
        try {
            const res: any = await viewAPI.deleteChild(
                "credit_note",
                creditNoteId,
                "credit_note_view",
                "credit_note_item",
                itemId
            );
            setDetails((prev: any) => {
                if (!prev) return prev;
                const filteredItems = prev.credit_note_item?.filter((it: any) => it.id !== itemId) || [];
                const sortedItems = sortCreditNoteItemsByCreatedAt(filteredItems);

                return {
                    ...prev,
                    credit_note_item: sortedItems
                };
            });
            if (res?.data) {
                const sortedItems = sortCreditNoteItemsByCreatedAt(res.data.credit_note_item ?? []);
                setDetails({
                    ...res.data,
                    credit_note_item: sortedItems
                });
            }
        } catch (error) {
            console.error("Error deleting line item:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete line item",
            });
        } finally {
            setRemovingItemId(null);
        }
    };

    const handleItemChange = (itemId: string, field: string, value: any) => {
        setDetails((prev: any) => {
            if (!prev) return prev;
            return {
                ...prev,
                credit_note_item: prev.credit_note_item?.map((item: any) =>
                    item.id === itemId ? { ...item, [field]: value } : item
                ) || []
            };
        });
    };

    const handleItemBlur = (itemId: string, field: string, value: any) => {
        updateLineItemApi(itemId, field, value);
    };

    const handleProductSelectChange = (itemId: string) => (sourceKey: any, key: string, value: any, fields: any) => {
        // Extract tax_rate from tax_master relationship
        const taxRate = value.item?.tax_master?.tax_rate || value.item?.tax_rate || 0;
        const additionalData = {
            item_master_id: value[key],
            item_name: value.item?.item_name || '',
            item_number: value.item?.item_code || '',
            item_type: value.item?.item_type || '',
            rate: value.item?.unit_price || 0,
            item_description: value.item?.item_description || '',
            // Ensure UOM is always a plain string name
            uom: (typeof value.item?.uom === 'object' ? value.item?.uom?.name : value.item?.uom) || '',
            // Set tax_rate from product's tax_master
            tax_rate: taxRate,
        };
        // Update local state immediately
        setDetails((prev: any) => {
            if (!prev) return prev;
            return {
                ...prev,
                credit_note_item: prev.credit_note_item?.map((it: any) =>
                    it.id === itemId ? { ...it, ...additionalData } : it
                ) || []
            };
        });
        // Backend will calculate totals, just send the field values
        updateLineItemApi(itemId, 'item_master_id', value[key], additionalData);
    };

    const handleProductSelectClear = (itemId: string) => (sourceKey: any) => {
        // no-op local clear; API can be added if required
    };

    // Handle field changes - backend will calculate totals
    const handleQuantityOrRateChange = (itemId: string, field: string, value: any) => {
        handleItemChange(itemId, field, value);
    };

    const handleQuantityOrRateBlur = (itemId: string, field: string, value: any) => {
        // Backend will calculate totals, just send the field value
        updateLineItemApi(itemId, field, value);
    };

    // Memoize sorted items by creation order (oldest first)
    const items = useMemo(
        () => sortCreditNoteItemsByCreatedAt(details?.credit_note_item ?? []),
        [details?.credit_note_item]
    );



    return (
        <div className="space-y-4 pt-4 border-t border-border/60">
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">
                        Credit Note Items
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Add products to your credit note.
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={addItem}
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
                <Table className="min-w-[960px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[260px]">
                                Product <span className="text-destructive">*</span>
                            </TableHead>
                            <TableHead className="w-[100px] text-right whitespace-nowrap">
                                Qty <span className="text-destructive">*</span>
                            </TableHead>
                            <TableHead className="w-[120px] text-right whitespace-nowrap">
                                Rate
                            </TableHead>
                            <TableHead className="w-[110px] text-right whitespace-nowrap">Discount %</TableHead>
                            <TableHead className="w-[100px] text-right whitespace-nowrap">Tax %</TableHead>
                            <TableHead className="w-[150px] text-right whitespace-nowrap">Line Total</TableHead>
                            <TableHead className="w-[30px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center h-24 text-muted-foreground"
                                >
                                    There are no line items for this credit note.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item: any, index: number) => (
                                <TableRow key={`${item.id}-${index}`}>
                                    <TableCell className="align-top py-3">
                                        <SearchDropDown
                                            instanceType="item_master"
                                            instanceSourceKey="item_master_id"
                                            instanceKey="id"
                                            instanceLabel="item_name"
                                            instanceValue={
                                                item?.item_master_id
                                                    ? {
                                                        id: item?.item_master_id,
                                                        item_name: item?.item_name || item?.item_master?.item_name || 'Loading...'
                                                    }
                                                    : ''
                                            }
                                            onSelectItem={handleProductSelectChange(item.id)}
                                            onClear={handleProductSelectClear(item.id)}
                                            limit="10"
                                            searchParams="item_name"
                                            isShowSearch
                                            autoFocus
                                            style={{ width: '100%', minHeight: '36px' }}
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-3 text-right whitespace-nowrap">
                                        <Input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={item?.quantity ?? ''}
                                            onChange={(e) =>
                                                handleQuantityOrRateChange(
                                                    item.id,
                                                    'quantity',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            onBlur={(e) =>
                                                handleQuantityOrRateBlur(
                                                    item.id,
                                                    'quantity',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            required
                                            className="h-9 border-border/60 text-right"
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-3 text-right whitespace-nowrap">
                                        <Input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={item?.rate ?? ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                handleQuantityOrRateChange(
                                                    item.id,
                                                    'rate',
                                                    value === '' ? null : parseFloat(value) || 0
                                                );
                                            }}
                                            onBlur={(e) => {
                                                const value = e.target.value;
                                                handleQuantityOrRateBlur(
                                                    item.id,
                                                    'rate',
                                                    value === '' ? null : parseFloat(value) || 0
                                                );
                                            }}
                                            required
                                            className="h-9 border-border/60 text-right"
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-3 text-right whitespace-nowrap">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.01}
                                            value={item?.discount_rate ?? ''}
                                            onChange={(e) =>
                                                handleQuantityOrRateChange(
                                                    item.id,
                                                    'discount_rate',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            onBlur={(e) =>
                                                handleQuantityOrRateBlur(
                                                    item.id,
                                                    'discount_rate',
                                                    e.target.value === '' ? null : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 border-border/60 text-right"
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-3 text-right whitespace-nowrap">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.01}
                                            value={item?.tax_rate ?? ''}
                                            onChange={(e) =>
                                                handleQuantityOrRateChange(
                                                    item.id,
                                                    'tax_rate',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            onBlur={(e) =>
                                                handleQuantityOrRateBlur(
                                                    item.id,
                                                    'tax_rate',
                                                    e.target.value === '' ? null : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            className="h-9 border-border/60 text-right"
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-3 text-right">
                                        <Input
                                            value={
                                                item?.line_total != null
                                                    ? formatCurrency(Number(item.line_total), validCurrency)
                                                    : ''
                                            }
                                            readOnly
                                            className="h-9 w-full bg-violet-50 border-violet-200 font-semibold text-right rounded-md"
                                        />
                                    </TableCell>
                                    <TableCell className="align-top py-3 text-right">
                                        {updatingItemId === item.id && (
                                            <Loader2 className="h-4 w-4 animate-spin inline-block text-primary mr-1" />
                                        )}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => removeItem(item.id)}
                                            disabled={removingItemId === item.id || updatingItemId === item.id}
                                        >
                                            {removingItemId === item.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Totals row fixed (no horizontal scroll) */}
            <div className="flex justify-end p-4 space-y-2">
                <div className="w-64 space-y-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-600">
                            Sub Total:
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(
                                details?.sub_total ?? '0',
                                validCurrency,
                            )}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-600">
                            Discount Amount:
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(
                                details?.total_discount_amount ?? '0',
                                validCurrency,
                            )}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-600">
                            Tax Amount:
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(
                                details?.total_tax_amount ?? '0',
                                validCurrency,
                            )}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-3 bg-violet-50 px-3 rounded-lg border-2 border-violet-200">
                        <span className="text-base font-bold text-violet-900">
                            Credit Note Total:
                        </span>
                        <span className="text-lg font-bold text-violet-900">
                            {formatCurrency(
                                details?.credit_note_total ?? '0',
                                validCurrency,
                            )}
                        </span>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default CreditNoteItems;

