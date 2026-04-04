import { z } from 'zod';
import React from 'react';

// Form schema
export const purchaseRequisitionSchema = z.object({
  prNumber: z.string().optional(),
  prDate: z.date().default(new Date()),
  requester: z.string().min(1, { message: "Requester is required" }),
  requesterDepartment: z.string().min(1, { message: "Requester department is required" }),
  onBehalfOf: z.boolean().default(false),
  onBehalfOfUser: z.string().optional(),
  onBehalfOfDepartment: z.string().optional(),
  purchaseReason: z.string().min(1, { message: "Purchase reason is required" }),
  deliveryLocation: z.string().min(1, { message: "Delivery location is required" }),
  deliverTo: z.string().min(1, { message: "Deliver to is required" }),
  legalEntity: z.string().min(1, { message: "Legal entity is required" }),
  isBudgeted: z.boolean().default(false),
  budgetLevel: z.enum(["Header", "Line"]).optional(),
  costCenter: z.string().optional(),
  budgetPeriod: z.string().optional(),
  budgetLine: z.string().optional(),
  isForProject: z.boolean().default(false),
  projectName: z.string().optional(),
  purchaseTotal: z.number().min(0).default(0),
  prStatus: z.string().default("Draft"),
  // Attachments handled separately
});

export type PurchaseRequisitionFormValues = z.infer<typeof purchaseRequisitionSchema>;

/**
 * Interface for API response structure
 */
export interface APIResponse {
  data?: any;
  items?: any[];
}

/**
 * Interface for a single line item in the purchase requisition
 */
export interface LineItem {
  id: string;
  product_id?: string;
  item_name?: string;
  item_type?: string;
  item_description?: string;
  rate?: number;
  quantity?: number;
  supplier?: string;
  supplier_id?: string;
  supplier_name?: string;
  uom?: string;
  item_code?: string;
  need_by_date?: string;
  budget_line_id?: string;
  budget_period_id?: string;
  cost_center_id?: string;
  item_master_id?: string;
  item_total?: number;
  created_at?: string;
  item_number?: string;
}

/**
 * Props interface for the PurchaseLineItems component
 */
export interface PurchaseLineItemsProps {
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
}

/**
 * Props interface for the PurchaseLineItemRow component
 */
export interface PurchaseLineItemRowProps {
  item: LineItem;
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


export interface InvoiceLineItem {
  id: string;
  instance_id?: string;
  item_name?: string;
  item_type?: string;
  item_description?: string;
  rate?: number;
  invoice_qty?: number;
  supplier?: string;
  supplier_id?: string;
  uom?: string;
  tax_rate?: number;
  item_code?: string;
  need_by_date?: string;
  budget_line_id?: string;
  budget_period_id?: string;
  cost_center_id?: string;
  item_master_id?: string;
  item_total?: number;
  created_at?: string;
  item_number?: string;
  ordered_amount?: number;
  ordered_quantity?: number;
  purchase_order_item_id?: string;
  purchase_requisition_id?: string;
  line_tax_amount?: number;
  purchase_order_id: number;
  invoice_net_total: number;
  line_total?: number;
  uom_id?: string;
}

