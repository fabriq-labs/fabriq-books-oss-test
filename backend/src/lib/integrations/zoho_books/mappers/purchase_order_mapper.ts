/**
 * Zoho Books Purchase Order Mapper
 * 
 * Handles mapping of Fabriq Purchase Orders to Zoho Books format.
 */

import logger from '../../../../utils/logger';
import { ZohoPurchaseOrder } from '../zoho_api_client';

/**
 * Map Fabriq purchase order to Zoho Books format
 */
export function mapPurchaseOrderToZoho(po: any, defaultPurchaseAccountId: string): ZohoPurchaseOrder {
  // Map line items
  const lineItems = po.purchase_order_item.map((item: any) => {
    const zohoLineItem: any = {
      name: item.item_name || item.product?.item_name || 'Item',
      description: item.item_description || item.product?.item_description || '',
      rate: item.rate || 0,
      quantity: item.quantity || 0,
    };

    // Add item_id if product has Zoho source_record_id
    if (item.product?.source_record_id) {
      zohoLineItem.item_id = item.product.source_record_id;
    }

    // Add account_id if product has purchase_account with Zoho source_record_id
    // The purchase_account.source_record_id contains the Zoho account_id
    if (item.product?.purchase_account?.source_record_id) {
      zohoLineItem.account_id = item.product.purchase_account.source_record_id;
    } else if (!item.product?.purchase_account && defaultPurchaseAccountId) {
      zohoLineItem.account_id = defaultPurchaseAccountId;
    } else if (!item.product?.purchase_account && !defaultPurchaseAccountId) {
      // Product doesn't have an account mapped - this is a problem for Zoho
      throw new Error(
        `Product "${item.product?.item_name || item.item_name}" does not have an account_id mapped. ` +
        'Please ensure the product is synced from Zoho with its account information.'
      );
    }

    // Add unit if available
    if (item.uom || item.product?.uom?.name) {
      zohoLineItem.unit = item.uom || item.product.uom.name;
    }

    // Add discount if available
    if (item.discount) {
      zohoLineItem.discount = item.discount;
    }

    // Add tax information - Zoho requires either tax_id, tax_exemption_id, or reverse_charge
    // Priority: 1. ZOHO_DEFAULT_TAX_ID env var, 2. reverse_charge = false (safe default)
    const defaultTaxId = process.env.ZOHO_DEFAULT_TAX_ID;
    logger.info('Tax configuration for line item', {
      itemName: zohoLineItem.name,
      defaultTaxId: defaultTaxId || 'NOT SET',
      hasTaxId: !!defaultTaxId,
    });
    
    if (defaultTaxId && defaultTaxId.trim() !== '') {
      zohoLineItem.tax_id = defaultTaxId.trim();
      logger.info('✅ Added tax_id to line item', {
        itemName: zohoLineItem.name,
        taxId: zohoLineItem.tax_id,
      });
    } else {
      // Fallback: use reverse_charge = false to satisfy Zoho's requirement
      zohoLineItem.reverse_charge = false;
      logger.warn('⚠️ ZOHO_DEFAULT_TAX_ID not set, using reverse_charge = false', {
        itemName: zohoLineItem.name,
      });
    }

    return zohoLineItem;
  });

  // Build Zoho PO object
  const zohoPO: any = {
    date: po.po_date ? formatDateForZoho(po.po_date) : formatDateForZoho(new Date()),
    vendor_id: String(po.supplier_details.source_record_id), // Zoho vendor ID - ensure it's a string
    line_items: lineItems,
  };

  // Add optional fields
  if (po.po_number) {
    zohoPO.reference_number = po.po_number;
  }

  // Only add expected_date if it's a valid date (not null/undefined/invalid)
  if (po.need_by_date) {
    const needByDate = typeof po.need_by_date === 'string' ? new Date(po.need_by_date) : po.need_by_date;
    // Check if date is valid (not invalid date like 1969-12-31)
    if (needByDate instanceof Date && !isNaN(needByDate.getTime())) {
      const formattedDate = formatDateForZoho(needByDate);
      // Only include if it's a reasonable date (after 1970-01-01)
      const dateYear = needByDate.getFullYear();
      if (dateYear >= 1970) {
        zohoPO.expected_date = formattedDate;
      }
    }
  }

  if (po.delivery_address || po.location?.address) {
    // Zoho expects delivery address as a string or object
    // For Phase 1, use string format
    zohoPO.delivery_address = po.delivery_address || po.location?.address || '';
  }

  // Add shipping charge if available
  if (po.shipping_cost) {
    zohoPO.shipping_charge = po.shipping_cost;
  }

  // Add notes/comment
  if (po.comment) {
    zohoPO.notes = po.comment;
  }

  // Add payment terms if available
  if (po.supplier_details.payment_terms?.payment_terms) {
    zohoPO.terms = po.supplier_details.payment_terms.payment_terms;
  }

  // Currency (default to organization currency or USD)
  if (po.organization?.basecurrency_id) {
    // Would need to map currency code from currency_master
    // For Phase 1, skip or use default
  }

  logger.debug('mapped purchase order to Zoho format', zohoPO);

  return zohoPO;
}

/**
 * Format date for Zoho API (YYYY-MM-DD format)
 */
export function formatDateForZoho(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

