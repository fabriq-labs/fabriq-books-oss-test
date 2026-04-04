import { BaseDocumentExtractor } from './base-extractor';

export class InvoiceExtractor extends BaseDocumentExtractor {
  getSupportedTypes(): string[] {
    return ['invoice', 'bill', 'vendor_invoice', 'supplier_invoice', 'purchase_invoice'];
  }

  getTargetModel(): string {
    return 'invoice'; // This extractor maps to invoice model
  }

  getExtractionPrompt(): string {
    return `Extract invoice data from the provided document. Focus on extracting invoice header information and line items.

    Extract the following invoice header information:
    - Invoice number
    - Invoice date
    - Invoice version (if available)
    - Invoice status (if mentioned)
    - Invoice type (e.g., purchase, sales, credit note)
    - Supplier/vendor name
    - Supplier address and contact details
    - Shipping terms and method
    - Payment terms
    - Remit to address
    - Bill to address
    - Deliver to address
    - Requester name and email
    - Purchase order number (if referenced)
    - Chart of accounts code
    - Additional tax amount
    - Shipping cost
    - Tax on shipping
    - Handling cost
    - Tax on handling
    - Miscellaneous cost
    - Tax on miscellaneous
    - Invoice net total
    - Shipping/handling/misc total
    - Invoice total amount
    - Balance amount
    - Terms and conditions

    Extract the following line item information for each item:
    - Item name
    - Item number
    - Item description
    - Item type
    - Rate/unit price
    - Ordered quantity
    - Ordered amount
    - Invoice quantity
    - Line total
    - Invoiced amount
    - Tax type
    - Tax rate
    - Tax rate intra (if applicable)
    - Line tax amount
    - Purchase order number (if referenced)
    - Need by date

    Also extract any attachments or references mentioned in the invoice.

    Return structured data that can be directly mapped to invoice and invoice_line_item models.`;
  }

  getExpectedSchema(): Record<string, any> {
    return {
      // Invoice header data - maps to invoice model
      invoice: {
        invoice_number: 'string',
        invoice_date: 'date',
        invoice_version: 'number',
        invoice_status: 'string',
        invoice_type: 'string',
        supplier_name: 'string',
        attach: 'string',
        supplier_remarks: 'string',
        shipping_terms: 'string',
        shipping_method: 'string',
        payment_terms: 'string',
        remit_to: 'string',
        bill_to: 'string',
        deliver_to: 'string',
        requester_name: 'string',
        requester_email: 'string',
        ap_comment: 'string',
        po_number: 'string',
        coa: 'string',
        additional_tax: 'number',
        shipping_cost: 'number',
        tax_on_shipping: 'number',
        handling_cost: 'number',
        tax_on_handling: 'number',
        misc_cost: 'number',
        tax_on_misc: 'number',
        invoice_net_total: 'number',
        shipping_handling_misc_total: 'number',
        invoice_total: 'number',
        balance_amount: 'number',
        terms_and_conditions: 'string'
      },
      // Line items data - maps to invoice_line_item model
      line_items: [{
        item_name: 'string',
        item_number: 'string',
        item_description: 'string',
        item_type: 'string',
        rate: 'number',
        ordered_quantity: 'number',
        ordered_amount: 'number',
        invoice_qty: 'number',
        line_total: 'number',
        invoiced_amount: 'number',
        tax_type: 'string',
        tax_rate: 'number',
        tax_rate_intra: 'number',
        line_tax_amount: 'number',
        po_number: 'string',
        need_by_date: 'date'
      }],
      // Additional context information
      context: {
        currency: 'string',
        language: 'string',
        documentType: 'string',
        pageCount: 'number',
        extractedAt: 'date'
      }
    };
  }
}
