import React, { useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { useToast } from "@/components/ui/use-toast";
import dayjs from "dayjs";
import { formatCurrency } from "@/lib/formatters";

// Styles for the date input to hide default calendar picker
const dateInputStyles = {
  "::-webkit-calendar-picker-indicator": {
    display: "none",
    opacity: 0,
    position: "absolute",
    right: 0,
    width: 0,
    background: "none",
  },
  "::-webkit-datetime-edit": {
    paddingRight: "1rem",
  },
  appearance: "textfield",
} as React.CSSProperties;

interface PurchaseOrderLineItemRowProps {
  item: any;
  isDeleting: boolean;
  openPopover: boolean;
  onPopoverChange: (open: boolean) => void;
  onQuantityChange: (id: string, sourceKey: string, value: string) => void;
  onQuantityBlur: (id: string, sourceKey: string, value: string) => void;

  onDelete: (id: string) => void;

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
const PurchaseOrderLineItemRow: React.FC<PurchaseOrderLineItemRowProps> = ({
  item,
  isDeleting,
  openPopover,
  onPopoverChange,
  onQuantityChange,
  onQuantityBlur,
  onDelete,
  readOnly,
  itemDetails,
}) => {
  const { toast } = useToast();
  return (
    <TableRow className={cn(isDeleting && "opacity-50")}>
      <TableCell>
        <span className="text-sm text-gray-700">{item?.item_name || "-"}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-gray-700">{item?.uom || "-"}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-gray-700">
          {item?.ordered_quantity || "-"}
        </span>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={item?.quantity ?? ""}
          onChange={(e) =>
            onQuantityChange(item.id, "quantity", e.target.value)
          }
          onBlur={(e) => onQuantityBlur(item.id, "quantity", e.target.value)}
          placeholder="Qty"
          className="w-full h-8 px-2 text-sm"
          disabled={isDeleting || readOnly}
        />
      </TableCell>
      <TableCell>{item?.rate ? formatCurrency(item?.rate) : ""}</TableCell>
      <TableCell>
        {/* {item?.item_total ? `₹${item?.item_total.toFixed(2)}` : "-"} */}
        {item?.item_total ? formatCurrency(item?.item_total) : ""}
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

export default React.memo(PurchaseOrderLineItemRow);
