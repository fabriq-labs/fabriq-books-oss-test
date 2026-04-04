import React, { useCallback, useEffect, useState, KeyboardEvent } from "react";
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
import { APIResponse, LineItem, PurchaseLineItemsProps } from "./types";
import PurchaseLineItemRow from "./PurchaseLineItemRow";
import { useToast } from "@/components/ui/use-toast";
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
const PurchaseLineItems: React.FC<PurchaseLineItemsProps> = ({
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
}) => {
  const [itemDetails, setItemDetails] = useState<LineItem[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [deletingItems, setDeletingItems] = useState<string[]>([]);
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Initialize item details from props
  useEffect(() => {
    if (details?.items && Array.isArray(details.items)) {
      const mappedItems = details.items
        .map((item: any) => ({
          id: item?.id,
          product_id: item?.product?.id,
          item_name: item?.product?.item_name,
          item_type: item?.product?.item_type,
          item_description: item?.product?.item_description,
          rate: item?.product?.unit_price,
          quantity: item?.quantity,
          supplier: item?.product?.supplier?.supplier_name,
          supplier_id: item?.product?.supplier?.id,
          supplier_name:
            item?.supplier?.supplier_name ||
            item?.product?.supplier?.supplier_name,
          uom: item?.product?.uom?.name,
          item_code: item?.product?.item_code,
          need_by_date: item?.need_by_date
            ? dayjs(item.need_by_date).format("YYYY-MM-DD")
            : "",
          budget_line_id: item?.budget_line?.budget_line,
          budget_period_id: item?.budget_period?.budget_period,
          cost_center_id: item?.cost_center?.cost_center,
          item_master_id: item?.product?.id,
          item_total: item?.item_total,
          created_at: item?.created_at,
          item_number: item?.item_number,
        }))
        .filter((item: LineItem) => item.id)
        .sort((a: LineItem, b: LineItem) => {
          if (a.item_number && b.item_number) {
            return a.item_number.localeCompare(b.item_number);
          }
          return 0;
        });

      setItemDetails(mappedItems);
    }
  }, [details?.items]);

  /**
   * Updates a line item through the API
   */
  const updateLineItemApi = useCallback(
    async (itemId: string, field: string, value: any, data?: any) => {
      try {
        const res = (await viewAPI.updateChild(
          "purchase_requisition",
          requisitionId,
          "view_1",
          "items",
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

  /**
   * Handles changes to the item selection
   */
  const handleItemChange = useCallback(
    (id: string, sourceKey: string, key: string, value: any) => {
      setItemDetails((prevItems) =>
        prevItems.map((prevItem) =>
          prevItem.id === id
            ? {
              ...prevItem,
              product_id: value[key],
              item_name: value?.item?.item_name,
              item_type: value?.item?.item_type,
              item_description: value?.item?.item_description,
              rate: value?.item?.unit_price || 0,
              supplier: value?.item?.supplier?.supplier_name,
              supplier_id: value?.item?.supplier?.id,
              supplier_name: value?.item?.supplier?.supplier_name,
              uom: value?.item?.uom?.name,
              item_code: value?.item?.item_code,
              item_master_id: value?.item?.id,
              item_total: prevItem.quantity
                ? prevItem.quantity * (value?.item?.unit_price || 0)
                : 0,
            }
            : prevItem,
        ),
      );

      updateLineItemApi(id, sourceKey, value[key], {
        rate: value?.item?.unit_price,
        product_id: value[key],
        supplier_id: value?.item?.supplier?.id,
      });
    },
    [updateLineItemApi],
  );

  /**
   * Handles changes to the supplier selection
   */
  const handleSupplierChange = useCallback(
    (id: string, sourceKey: string, key: string, value: any) => {
      setItemDetails((prevItems) =>
        prevItems.map((prevItem) =>
          prevItem.id === id
            ? {
              ...prevItem,
              supplier_id: value[key],
              supplier_name: value?.item?.supplier_name,
              supplier: value?.item?.supplier_name,
            }
            : prevItem,
        ),
      );

      // Update via API
      updateLineItemApi(id, sourceKey, value[key]);
    },
    [updateLineItemApi],
  );

  /**
   * Handles quantity changes
   */
  const handleQuantityChange = (
    id: string,
    sourceKey: string,
    value: string,
  ) => {
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
   * Handles date changes
   */
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

    setItemDetails((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, need_by_date: displayDate } : item,
      ),
    );

    updateLineItemApi(id, "need_by_date", apiDate);
    setOpenPopovers((prev) => ({ ...prev, [id]: false }));
  };

  /**
   * Handles direct date input
   */
  const handleDateInput = (id: string, value: string) => {
    const numericValue = value.replace(/\D/g, "");
    let formattedDate = "";

    if (numericValue.length > 0) {
      const year = numericValue.slice(0, 4);
      const month = numericValue.slice(4, 6);
      const day = numericValue.slice(6, 8);

      formattedDate =
        year + (month ? "-" + month : "") + (day ? "-" + day : "");

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

    setItemDetails((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, need_by_date: formattedDate } : item,
      ),
    );
  };

  /**
   * Handles date input key press events
   */
  const handleDateKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string,
    value: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleDateInput(id, value);
    }
  };

  /**
   * Adds a new line item
   */
  const addLineItem = async () => {
    // Check if there's already an empty line item
    const hasEmptyItem = itemDetails.some(
      (item) =>
        !item.product_id && !item.item_name && !item.quantity && !item.rate,
    );

    if (hasEmptyItem) {
      toast({
        title: "Empty Line Item Found",
        description:
          "Please complete the existing empty line item before adding a new one.",
        variant: "destructive",
      });
      return;
    }

    setIsAddingItem(true);
    try {
      const response = (await viewAPI.addChild(
        "purchase_requisition",
        requisitionId,
        "view_1",
        "items",
        {},
      )) as APIResponse;

      if (response?.data) {
        // Only update the details - let the useEffect handle the itemDetails sync
        setDetails(response?.data);
      }
    } catch (error) {
      console.error("Error adding line item:", error);
    } finally {
      setIsAddingItem(false);
    }
  };

  /**
   * Deletes a line item
   */
  const deleteLineItem = async (id: string) => {
    setDeletingItems((prev) => [...prev, id]);
    try {
      const res = (await viewAPI.deleteChild(
        "purchase_requisition",
        requisitionId,
        "view_1",
        "items",
        id,
      )) as APIResponse;
      if (res?.data) {
        setDetails(res.data);
      }
      setItemDetails((prevItems) => prevItems.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Error deleting line item:", error);
    } finally {
      setDeletingItems((prev) => prev.filter((itemId) => itemId !== id));
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Alt + N to add new item
      if (e.altKey && e.key === "n") {
        e.preventDefault();
        !isAddingItem && addLineItem();
      }
    },
    [isAddingItem, addLineItem],
  );

  return (
    <Card
      className="shadow-sm"
      onKeyDown={handleKeyDown}
      tabIndex={0} // Make the card focusable
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <CardTitle className="text-lg">Purchase Line Items</CardTitle>
            <p className="text-sm text-muted-foreground">
              Press Alt + N to add a new item. Each product can only be selected
              once.
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
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Item Name</TableHead>
                <TableHead className="w-[120px]">Item Code</TableHead>
                <TableHead className="w-[120px]">UOM</TableHead>
                <TableHead className="w-[150px]">Supplier</TableHead>
                <TableHead className="w-[180px]">Need By Date</TableHead>
                <TableHead className="w-[100px]">Quantity</TableHead>
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
                    No items added yet. Click the "Add Item" button or press Alt
                    + N to add a new item. Each product can only be selected
                    once.
                  </TableCell>
                </TableRow>
              ) : (
                itemDetails.map((item) => (
                  <PurchaseLineItemRow
                    key={item.id}
                    item={item}
                    isDeleting={deletingItems.includes(item.id)}
                    openPopover={openPopovers[item.id] || false}
                    onPopoverChange={(open) =>
                      setOpenPopovers((prev) => ({ ...prev, [item.id]: open }))
                    }
                    onQuantityChange={handleQuantityChange}
                    onQuantityBlur={handleQuantityBlur}
                    onDateInput={handleDateInput}
                    onDateKeyPress={handleDateKeyPress}
                    onDateChange={handleDateChange}
                    onDelete={deleteLineItem}
                    onItemChange={handleItemChange}
                    onSupplierChange={handleSupplierChange}
                    readOnly={readOnly}
                    itemDetails={itemDetails}
                  />
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={9}>
                  <Button
                    variant="outline"
                    className="w-full h-8 border-dashed hover:border-solid"
                    onClick={addLineItem}
                    disabled={isAddingItem || readOnly}
                  >
                    {isAddingItem ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add New Item (Alt + N)
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        {/* Fixed Item Total - positioned outside the scrollable table */}
        <div className="flex justify-end p-4 border-t bg-gray-50">
          <div className="w-64">
            <div className="flex justify-between items-center py-3 bg-violet-50 px-3 rounded-lg border-2 border-violet-200">
              <span className="text-base font-bold text-violet-900 ml-5">
                Item Total:
              </span>
              <span className="text-lg font-bold text-violet-900 mr-10">
                {details?.total_price
                  ? formatCurrency(details?.total_price)
                  : " "}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PurchaseLineItems;
