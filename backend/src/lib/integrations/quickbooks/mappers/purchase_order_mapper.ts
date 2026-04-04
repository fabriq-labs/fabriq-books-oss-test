/**
 * QuickBooks Purchase Order Mapper
 * 
 * Handles mapping of Fabriq Purchase Orders to QuickBooks Online format.
 */

import logger from '../../../../utils/logger';
import { QuickBooksPurchaseOrder } from '../quickbooks_api_client';

/**
 * Map Fabriq purchase order to QuickBooks Online format
 */
export function mapPurchaseOrderToQuickBooks(po: any, defaultExpenseAccountId: string): QuickBooksPurchaseOrder {
  // Validate mandatory fields
  if (!po.supplier_details?.source_record_id) {
    throw new Error('Purchase order must have a supplier with source_record_id (QuickBooks vendor ID)');
  }

  if (!po.purchase_order_item || po.purchase_order_item.length === 0) {
    throw new Error('Purchase order must have at least one line item');
  }

  // Map line items
  // According to QuickBooks API documentation:
  // - Only ItemBasedExpenseLineDetail is supported for purchase orders
  // - AccountBasedExpenseLineDetail is NOT supported for purchase orders
  // - APAccountRef must be set at the PO level (not in line items)
  const lineItems = po.purchase_order_item.map((item: any, index: number) => {
    // Validate that product has QuickBooks source_record_id
    if (!item.product?.source_record_id) {
      throw new Error(
        `Product "${item.product?.item_name || item.item_name}" does not have a QuickBooks item ID (source_record_id). ` +
        'Purchase orders in QuickBooks require items that exist in QuickBooks. ' +
        'Please ensure the product is synced from QuickBooks first.'
      );
    }

    // Calculate line amount
    const lineAmount = (item.rate || 0) * (item.quantity || 1);
    
    // Use ItemBasedExpenseLineDetail (only supported type for purchase orders)
    const lineItem: any = {
      DetailType: 'ItemBasedExpenseLineDetail',
      Amount: lineAmount, // Amount at line level (required by QuickBooks)
      Id: String(index + 1), // Line item ID (required by QuickBooks, 1-based index)
      ItemBasedExpenseLineDetail: {
        ItemRef: {
          value: item.product.source_record_id,
        },
        UnitPrice: item.rate || 0,
        Qty: item.quantity || 1, // QuickBooks requires Qty, default to 1 if not provided
        BillableStatus: 'NotBillable', // Default to NotBillable (required field)
      },
    };
    
    // Add item name if available
    if (item.product.item_name) {
      lineItem.ItemBasedExpenseLineDetail.ItemRef.name = item.product.item_name;
    }
    
    // Add TaxCodeRef (required by QuickBooks for ItemBasedExpenseLineDetail)
    // Use "NON" for non-taxable items (default)
    lineItem.ItemBasedExpenseLineDetail.TaxCodeRef = {
      value: 'NON',
    };

    return lineItem;
  });

  // Validate APAccountRef is available (required by QuickBooks API)
  if (!defaultExpenseAccountId) {
    throw new Error(
      'APAccountRef is required for QuickBooks purchase orders. ' +
      'Please set a default expense account (default_purchase_account_id) in the source_system configuration.'
    );
  }

  // Build QuickBooks PO object
  // Mandatory fields: VendorRef.value, TxnDate, Line, APAccountRef
  // According to QuickBooks API: APAccountRef must be set at the PO level
  const qbPO: QuickBooksPurchaseOrder = {
    TxnDate: formatDateForQuickBooks(po.po_date || new Date()),
    VendorRef: {
      value: String(po.supplier_details.source_record_id), // QuickBooks vendor ID (MANDATORY)
    },
    APAccountRef: {
      value: defaultExpenseAccountId // Accounts Payable account (required by QuickBooks API)

    },
    Line: lineItems, // MANDATORY - must have at least one line item
  };

  // Add vendor name if available (optional but helpful)
  if (po.supplier_details.supplier_name && qbPO.VendorRef) {
    qbPO.VendorRef.name = po.supplier_details.supplier_name;
  }

  // Add optional fields
  // NOTE: RefNumber can cause validation errors in QuickBooks if:
  // - It's not unique (duplicate PO number)
  // - It has invalid format
  // - QuickBooks has restrictions on PO numbering
  // For now, we'll omit RefNumber to avoid errors. QuickBooks will auto-generate a number.
  // If you need custom PO numbers, ensure they are unique and valid in QuickBooks.
  // if (po.po_number) {
  //   qbPO.RefNumber = po.po_number;
  // }

  // Add due date if available
  if (po.need_by_date) {
    const needByDate = typeof po.need_by_date === 'string' ? new Date(po.need_by_date) : po.need_by_date;
    if (needByDate instanceof Date && !isNaN(needByDate.getTime())) {
      const dateYear = needByDate.getFullYear();
      if (dateYear >= 1970) {
        qbPO.DueDate = formatDateForQuickBooks(needByDate);
      }
    }
  }

  // Add private note (comment)
  if (po.comment) {
    qbPO.PrivateNote = po.comment;
  }

  // Currency (QuickBooks uses CurrencyRef)
  // For Phase 1, we'll use the company's base currency or skip
  // This would need to be mapped from currency_master if available

  // Calculate total amount (QuickBooks accepts this, though it also calculates it)
  // Use total amount from PO header (Fabriq schema: purchase_order.total_price)
  // QuickBooks accepts an explicit TotalAmt, but also calculates it. We'll supply it if present.
  if (po.total_price != null && !isNaN(Number(po.total_price))) {
    qbPO.TotalAmt = Number(po.total_price);
  }

  // Final validation: ensure we have at least one line item
  if (qbPO.Line && qbPO.Line.length === 0) {
    throw new Error('Purchase order must have at least one valid line item');
  }

  logger.info('Mapped purchase order to QuickBooks format', {
    vendorId: qbPO.VendorRef?.value,
    lineItemsCount: qbPO.Line?.length || 0,
    txnDate: qbPO.TxnDate,
    // Note: TotalAmt is not included - QuickBooks calculates it automatically
  });

  return qbPO;
}

/**
 * Format date for QuickBooks API (YYYY-MM-DD format)
 * QuickBooks uses ISO 8601 date format (YYYY-MM-DD)
 */
export function formatDateForQuickBooks(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
