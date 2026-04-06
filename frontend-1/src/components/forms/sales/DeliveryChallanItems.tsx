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

interface DeliveryChallanItemsProps {
    challanId: string;
    details: any;
    setDetails: React.Dispatch<React.SetStateAction<any>>;
    currentCurrency: string;
}

function sortDeliveryChallanItemsByCreatedAt(items: any[]): any[] {
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

export const DeliveryChallanItems: React.FC<DeliveryChallanItemsProps> = ({
    challanId,
    details,
    setDetails,
    currentCurrency
}) => {
    const { toast } = useToast();
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [removingItemId, setRemovingItemId] = useState<string | null>(null);
    const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

    const validCurrency = currentCurrency && currentCurrency.trim() !== '' ? currentCurrency : 'USD';

    const updateLineItemApi = useCallback(async (itemId: string, field: string, value: any, data?: any) => {
        setUpdatingItemId(itemId);
        try {
            const res = await viewAPI.updateChild(
                "delivery_challan",
                challanId,
                "delivery_challan_view",
                "delivery_challan_items",
                itemId,
                { [field]: value, ...(data || {}) }
            ) as any;
            if (res.data) {
                const sorted = sortDeliveryChallanItemsByCreatedAt(res.data.delivery_challan_items ?? []);
                setDetails({ ...res.data, delivery_challan_items: sorted });
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
    }, [challanId, setDetails, toast]);

    const addItem = async () => {
        setIsAddingItem(true);
        try {
            const response = await viewAPI.addChild(
                "delivery_challan",
                challanId,
                "delivery_challan_view",
                "delivery_challan_items",
                {}
            ) as any;
            if (response?.data) {
                const sortedItems = sortDeliveryChallanItemsByCreatedAt(response.data.delivery_challan_items ?? []);
                setDetails({
                    ...response.data,
                    delivery_challan_items: sortedItems,
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
                "delivery_challan",
                challanId,
                "delivery_challan_view",
                "delivery_challan_items",
                itemId
            );
            setDetails((prev: any) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    delivery_challan_items: prev.delivery_challan_items?.filter((it: any) => it.id !== itemId) || []
                };
            });
            if (res?.data) {
                const sorted = sortDeliveryChallanItemsByCreatedAt(res.data.delivery_challan_items ?? []);
                setDetails({ ...res.data, delivery_challan_items: sorted });
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
                delivery_challan_items: prev.delivery_challan_items?.map((item: any) =>
                    item.id === itemId ? { ...item, [field]: value } : item
                ) || []
            };
        });
    };

    const handleItemBlur = (itemId: string, field: string, value: any) => {
        updateLineItemApi(itemId, field, value);
    };

    const handleProductSelectChange = (itemId: string) => (sourceKey: any, key: string, value: any, fields: any) => {
        const taxRate = value.item?.tax_master?.tax_rate || value.item?.tax_rate || 0;
        const additionalData = {
            item_master_id: value[key],
            item_name: value.item?.item_name || '',
            item_code: value.item?.item_code || '',
            item_type: value.item?.item_type || '',
            rate: value.item?.unit_price || 0,
            item_description: value.item?.item_description || '',
            uom: (typeof value.item?.uom === 'object' ? value.item?.uom?.name : value.item?.uom) || '',
            tax_rate: taxRate,
        };
        setDetails((prev: any) => {
            if (!prev) return prev;
            return {
                ...prev,
                delivery_challan_items: prev.delivery_challan_items?.map((it: any) =>
                    it.id === itemId ? { ...it, ...additionalData } : it
                ) || []
            };
        });
        updateLineItemApi(itemId, 'item_master_id', value[key], additionalData);
    };

    const handleProductSelectClear = (itemId: string) => (sourceKey: any) => { };

    const items = useMemo(
        () => sortDeliveryChallanItemsByCreatedAt(details?.delivery_challan_items ?? []),
        [details?.delivery_challan_items]
    );

    return (
        <div className="space-y-4 pt-4 border-t border-border/60">
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">
                        Delivery Challan Items
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Add products to your delivery challan.
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
                                Qty Delivered <span className="text-destructive">*</span>
                            </TableHead>
                            <TableHead className="w-[120px] text-right whitespace-nowrap">
                                Rate
                            </TableHead>
                            <TableHead className="w-[110px] text-right whitespace-nowrap">
                                Discount %
                            </TableHead>
                            <TableHead className="w-[100px] text-right whitespace-nowrap">
                                Tax %
                            </TableHead>
                            <TableHead className="w-[150px] text-right whitespace-nowrap">
                                Line Total
                            </TableHead>
                            <TableHead className="w-[30px] text-right">
                                Actions
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center h-24 text-muted-foreground"
                                >
                                    There are no line items for this delivery challan.
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
                                            step={0.01}
                                            value={item?.quantity_delivered ?? ''}
                                            onChange={(e) =>
                                                handleItemChange(
                                                    item.id,
                                                    'quantity_delivered',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            onBlur={(e) =>
                                                handleItemBlur(
                                                    item.id,
                                                    'quantity_delivered',
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
                                                handleItemChange(
                                                    item.id,
                                                    'rate',
                                                    value === '' ? null : parseFloat(value) || 0
                                                );
                                            }}
                                            onBlur={(e) => {
                                                const value = e.target.value;
                                                handleItemBlur(
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
                                                handleItemChange(
                                                    item.id,
                                                    'discount_rate',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            onBlur={(e) =>
                                                handleItemBlur(
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
                                                handleItemChange(
                                                    item.id,
                                                    'tax_rate',
                                                    e.target.value === '' ? '' : parseFloat(e.target.value) || 0
                                                )
                                            }
                                            onBlur={(e) =>
                                                handleItemBlur(
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

            <div className="flex justify-end p-4 space-y-2">
                <div className="w-64 space-y-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-600">
                            Sub Total:
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(details?.sub_total ?? 0, validCurrency)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-600">
                            Discount Amount:
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(details?.total_discount_amount ?? 0, validCurrency)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-600">
                            Tax Amount:
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                            {formatCurrency(details?.total_tax_amount ?? 0, validCurrency)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center py-3 bg-violet-50 px-3 rounded-lg border-2 border-violet-200">
                        <span className="text-base font-bold text-violet-900">
                            Grand Total:
                        </span>
                        <span className="text-lg font-bold text-violet-900">
                            {formatCurrency(details?.total_amount ?? 0, validCurrency)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeliveryChallanItems;
