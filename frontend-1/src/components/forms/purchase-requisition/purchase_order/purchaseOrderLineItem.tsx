interface LineItemsTableProps {
  lineItems: LineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  editingRowId: string | null;
  setEditingRowId: React.Dispatch<React.SetStateAction<string | null>>;
  currentLineItem: LineItem;
  setCurrentLineItem: React.Dispatch<React.SetStateAction<LineItem>>;
  updateTotalAmount: (items: LineItem[]) => void;
  budgetLevel?: any;
  details: any;
  setDetails: any;
  readOnly: boolean;
  requisitionId: any;
  totalPOAmount: any;
}
import React, {
  useCallback,
  useEffect,
  useState,
  KeyboardEvent,
  useRef,
} from "react";
import { format, parse, isAfter, startOfDay } from "date-fns";
import { Loader2, Plus } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import dayjs from "dayjs";
import { viewAPI } from "@/api/api";
import { useToast } from "@/components/ui/use-toast";
import { APIResponse, LineItem } from "../types";
import PurchaseOrderLineItemRow from "./PurchaseOrderLineItemRow";
import { formatCurrency } from "@/lib/formatters";

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
const PurchaseOrderLineItemsTable: React.FC<LineItemsTableProps> = ({
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
  totalPOAmount,
}) => {
  const [itemDetails, setItemDetails] = useState<LineItem[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [deletingItems, setDeletingItems] = useState<string[]>([]);
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const [selectedId, setSelectedIds] = useState<String[]>([]);
  const orderRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (
      details?.purchase_order_item &&
      Array.isArray(details.purchase_order_item)
    ) {
      const mappedItems = details.purchase_order_item
        .map((item: any) => {
          return {
            id: item?.id,
            product_id: item?.product?.id,
            item_name: item?.product?.item_name,
            item_type: item?.product?.item_type,
            item_description: item?.product?.item_description,
            rate: item?.product?.unit_price,
            quantity: item?.quantity,
            supplier: item?.supplier?.supplier_name,
            supplier_id: item?.supplier?.id,
            uom: item?.product?.uom?.name,
            item_code: item?.item_code,
            need_by_date: item?.need_by_date
              ? dayjs(item?.need_by_date).format("DD-MM-YYYY")
              : "",
            budget_line_id: item?.budget_line?.budget_line,
            budget_period_id: item?.budget_period?.budget_period,
            cost_center_id: item?.cost_center?.cost_center,
            item_master_id: item?.product?.id,
            item_total: item?.item_total,
            created_at: item?.created_at,
            item_number: item?.item_number,
            ordered_quantity: item?.ordered_quantity,
          };
        })
        .filter((item: any) => item.id);

      // Preserve previous visual order to avoid row jumping after edits
      const previousOrder = orderRef.current;
      const knownItems: any[] = [];
      const newItems: any[] = [];
      for (const it of mappedItems) {
        if (previousOrder[it.id] !== undefined) {
          knownItems.push(it);
        } else {
          newItems.push(it);
        }
      }
      knownItems.sort((a, b) => previousOrder[a.id] - previousOrder[b.id]);
      const nextItems = [...knownItems, ...newItems];

      setSelectedIds(
        nextItems.map((item: any) => item.product_id).filter(Boolean),
      );
      setItemDetails(nextItems);
      orderRef.current = nextItems.reduce(
        (acc: Record<string, number>, it: any, idx: number) => {
          acc[it.id] = idx;
          return acc;
        },
        {},
      );
    } else {
      console.log("No items found in details object or items is not an array");
    }
  }, [details]);
  /**
   * Updates a line item through the API
   */
  const updateLineItemApi = useCallback(
    async (itemId: string, field: string, value: any, data?: any) => {
      try {
        const res = (await viewAPI.updateChild(
          "purchase_order",
          requisitionId,
          "purchase_order_view",
          "purchase_order_item",
          itemId,
          { [field]: value, ...(data || {}) },
        )) as APIResponse;

        if (res.data) {
          setDetails(res.data);
        }
      } catch (error) {
        console.error("Error updating line item:", error);
      }
    },
    [requisitionId, setDetails],
  );

  const handleQuantityChange = (
    id: string,
    sourceKey: string,
    value: string,
  ) => {
    console.log(id, sourceKey, value);
    const numericValue = value === "" ? null : parseInt(value);
    setItemDetails((prevItems) =>
      prevItems.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: numericValue,
              item_total: item.rate ? (numericValue || 0) * item.rate : 0,
            }
          : item,
      ),
    );
  };

  /**
   * Handles quantity blur events
   */
  const handleQuantityBlur = (id: string, sourceKey: string, value: string) => {
    const numericValue = value === "" ? null : parseInt(value);
    updateLineItemApi(id, sourceKey, numericValue);
  };

  /**
   * Deletes a line item
   */
  const deleteLineItem = async (id: string) => {
    setDeletingItems((prev) => [...prev, id]);
    try {
      const res = await viewAPI.deleteChild(
        "purchase_order",
        requisitionId,
        "purchase_order_view",
        "purchase_order_item",
        id,
      );
      setDetails(res);
      setItemDetails((prevItems) => prevItems.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Error deleting line item:", error);
    } finally {
      setDeletingItems((prev) => prev.filter((itemId) => itemId !== id));
    }
  };

  return (
    <Card className="shadow-sm" tabIndex={0}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <CardTitle className="text-lg">Purchase Order Line Items</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table
          // className="min-w-[1000px]"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Item Name</TableHead>
                <TableHead className="w-[120px]">UOM</TableHead>
                <TableHead className="w-[100px]">Ordered Qty</TableHead>
                <TableHead className="w-[100px]">Received Qty</TableHead>
                <TableHead className="w-[100px]">Rate</TableHead>
                <TableHead className="w-[120px]">Total</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemDetails.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center h-24 text-muted-foreground"
                  >
                    There are no purchase order line items for this purchase
                    order.
                  </TableCell>
                </TableRow>
              ) : (
                itemDetails.map((item) => (
                  <PurchaseOrderLineItemRow
                    key={item.id}
                    item={item}
                    isDeleting={deletingItems.includes(item.id)}
                    openPopover={openPopovers[item.id] || false}
                    onPopoverChange={(open) =>
                      setOpenPopovers((prev) => ({ ...prev, [item.id]: open }))
                    }
                    onQuantityChange={handleQuantityChange}
                    onQuantityBlur={handleQuantityBlur}
                    onDelete={deleteLineItem}
                    readOnly={readOnly}
                    itemDetails={itemDetails}
                  />
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-gray-50">
                <TableCell colSpan={6} className="p-0">
                  <div className="flex justify-end p-4 space-y-2 mr-10">
                    <div className="w-64 space-y-3">
                      <div className="flex justify-between items-center py-3 bg-violet-50 px-3 rounded-lg border-2 border-violet-200 ">
                        <span className="text-base font-bold text-violet-900 ">
                          Item Total:
                        </span>
                        <span className="text-lg font-bold text-violet-900 mr-5">
                          {details.total_price
                            ? formatCurrency(details.total_price)
                            : ""}
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

export default PurchaseOrderLineItemsTable;
