import { AuthContext } from "../../auth/types";
import { WorkflowContext } from "../../workflow-engine/types/workflow.types";
import { ModelService } from "../../services/core/ModelService";
import { WorkflowEngine } from "../../workflow-engine/core/WorkflowEngine";
import logger from '../../utils/logger';

/**
 * Generate an invoice and invoice_line_items from a sales order and its line items.
 * @param context WorkflowContext | AuthContext
 * @param model string
 * @param instance_id string
 * @param change_set string[]
 * @param select_set any
 * @param tx transaction client
 * @returns created invoice and line items
 */
export const generate_invoice_from_so = async (
  context: WorkflowContext | AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Extract WorkflowContext from the context parameter
    const workflowContext = (context as any).authContext ? context as WorkflowContext : null;
    const authContext = workflowContext ? workflowContext.authContext : context as AuthContext;
    const modelId = workflowContext ? workflowContext.instance.model_id : instance_id;

    if (!authContext) {
      throw new Error('AuthContext is required but not provided');
    }

    if (!tx || !tx.sales_order) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    const modelService = ModelService.getInstance();
    const workflowEngine = new WorkflowEngine(tx);

    logger.info('Generating invoice from sales order', {
      context: workflowContext || authContext,
      instance_id: modelId,
    });

    // 1. Fetch sales order and customer details
    const salesOrder = await tx.sales_order.findUnique({
      where: { id: modelId },
      select: {
        id: true,
        so_number: true,
        so_date: true,
        customer_id: true,
        location_id: true,
        notes: true,
        total_amount: true,
        status: true,
        created_at: true,
        created_by: true,
        modified_by: true,
        modified_at: true,
        assigned_to: true,
        org_id: true,
        customer: {
          select: {
            id: true,
            customer_name: true,
            customer_address: true,
            primary_phone: true,
            primary_email: true,
            payment_term_id: true,
            payment_terms: {
              select: {
                id: true,
                payment_terms: true,
                description: true,
              },
            },
          },
        },
        location: {
          select: {
            id: true,
            location: true,
            address: true,
            city: true,
            state: true,
            country: true,
            zip_code: true,
          },
        },
        shipping_method: {
          select: {
            id: true,
            shipping_method: true,
          },
        },
        shipping_terms: {
          select: {
            id: true,
            shipping_terms: true,
            description: true,
          },
        },
        payment_terms: {
          select: {
            id: true,
            payment_terms: true,
            description: true,
          },
        },
      },
    });

    if (!salesOrder) throw new Error('Sales order not found');

    // 2. Prepare invoice data
    const invoiceData = {
      invoice_type: 'SALES',
      customer_id: salesOrder.customer_id,
      location_id: salesOrder.location_id,
      sales_order_id: salesOrder.id,
      requester_name: salesOrder.customer?.customer_name,
      requester_email: salesOrder.customer?.primary_email,
      deliver_to: salesOrder.location?.location,
      terms_and_conditions: salesOrder.notes,
      payment_terms: salesOrder.payment_terms?.payment_terms,
      shipping_method: salesOrder.shipping_method?.shipping_method,
      shipping_terms: salesOrder.shipping_terms?.shipping_terms,
      invoice_date: salesOrder.so_date,
      created_at: salesOrder.created_at,
      created_by: salesOrder.created_by,
      modified_by: salesOrder.modified_by,
      modified_at: salesOrder.modified_at,
      assigned_to: salesOrder.assigned_to,
      org_id: salesOrder.org_id,
      status: '9',
      invoice_total: 0,
      invoice_net_total: 0,
    };

    // 3. Create invoice
    const createdInvoiceResult = await modelService.create('invoice', authContext, invoiceData, {}, tx);
    if (!createdInvoiceResult.success) throw new Error('Failed to create invoice: ' + createdInvoiceResult.error);
    const createdInvoice = createdInvoiceResult.data;

    // 4. Fetch sales order line items
    const salesOrderItems = await tx.sales_order_item.findMany({
      where: { sales_order_id: salesOrder.id },
      orderBy: { item_number: 'asc' },
      select: {
        id: true,
        sales_order_id: true,
        item_master_id: true,
        item_name: true,
        item_description: true,
        item_type: true,
        rate: true,
        quantity: true,
        line_total: true,
        uom: true,
        item_number: true,
        created_at: true,
        created_by: true,
        modified_by: true,
        modified_at: true,
        assigned_to: true,
        org_id: true,
        item_master: {
          select: {
            id: true,
            item_name: true,
            item_description: true,
            item_type: true,
          },
        },
      },
    });

    if (!salesOrderItems || salesOrderItems.length === 0) throw new Error('No sales order line items found');

    // 5. Prepare invoice line items
    // Note: item_master_id cannot be set in nested creates - it needs to be set separately
    const invoiceLineItems = salesOrderItems.map((item: any) => ({
      item_name: item?.item_master?.item_name || item?.item_name,
      item_description: item?.item_master?.item_description || item?.item_description,
      item_type: item?.item_master?.item_type || item?.item_type,
      rate: item?.rate,
      ordered_amount: item?.line_total,
      invoice_qty: item?.quantity,
      line_total: item?.line_total,
      created_by: item?.created_by,
      modified_by: item?.modified_by,
      assigned_to: item?.assigned_to,
      org_id: item?.org_id,
    }));

    // 6. Add invoice line items to invoice
    const result = await modelService.addChildrenToParent(
      'invoice',
      createdInvoice.id,
      'invoice_line_item',
      authContext,
      invoiceLineItems,
      {},
      tx
    );

    if (!result.success) throw new Error('Failed to create invoice line items: ' + result.error);

    // 7. Update invoice line items with item_master_id (can't be set in nested create)
    const salesOrderItemsData = await tx.sales_order_item.findMany({
      where: { sales_order_id: salesOrder.id },
      select: { item_master_id: true }
    });

    if (result.data.invoice_line_item) {
      const lineItems = Array.isArray(result.data.invoice_line_item)
        ? result.data.invoice_line_item
        : [result.data.invoice_line_item];

      await Promise.all(
        lineItems.map(async (lineItem: any, index: number) => {
          const itemMasterId = salesOrderItemsData[index]?.item_master_id;
          if (itemMasterId) {
            await tx.invoice_line_item.update({
              where: { id: lineItem.id },
              data: { item_master_id: itemMasterId }
            });
          }
        })
      );
    }

    // 8. Get workflow context for the created invoice
    const invoiceWorkflowContext = await workflowEngine.getWorkflowContextForUI(
      result.data.wf_instance_id
    );
    result.workflow_context = invoiceWorkflowContext;

    return result;

  } catch (error: any) {
    logger.error('Error generating invoice from sales order', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      instance_id: (context as any)?.instance?.model_id || instance_id,
      context: {
        model_id: (context as any)?.instance?.model_id || instance_id,
        model_name: (context as any)?.instance?.model_name || model,
      }
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to generate invoice from sales order: ${error.message}`
      : "Failed to generate invoice from sales order";
    throw new Error(errorMessage);
  }
};

/**
 * Create ledger postings when a sales invoice is approved
 * DR: Accounts Receivable, CR: Revenue
 * @param context WorkflowContext
 * @param model string
 * @param instance_id string
 * @param change_set string[]
 * @param select_set any
 * @param tx transaction client
 */
export const create_sales_invoice_posting = async (
  context: WorkflowContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    logger.debug('Creating sales invoice postings', {
      instance_id,
      model,
      context: context.authContext?.user.id
    });

    if (!tx || !tx.invoice || !tx.posting || !tx.account) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    // 1. Fetch invoice details
    const invoice = await tx.invoice.findUnique({
      where: { id: instance_id },
      select: {
        id: true,
        invoice_number: true,
        invoice_type: true,
        invoice_total: true,
        invoice_net_total: true,
        customer_id: true,
        org_id: true,
        invoice_date: true,
        customers: {
          select: {
            id: true,
            customer_name: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${instance_id} not found`);
    }

    if (invoice.invoice_type !== 'SALES') {
      throw new Error(`Invoice ${instance_id} is not a sales invoice`);
    }

    // 2. Get accounts (simplified - in production, this should be configurable)
    // Accounts Receivable account
    const accountsReceivableAccount = await tx.account.findFirst({
      where: {
        name: { contains: 'Accounts Receivable' },
        org_id: invoice.org_id
      }
    });

    // Revenue account
    const revenueAccount = await tx.account.findFirst({
      where: {
        name: { contains: 'Revenue' },
        org_id: invoice.org_id
      }
    });

    // if (!accountsReceivableAccount || !revenueAccount) {
    //   throw new Error('Required accounts not found: Accounts Receivable or Revenue');
    // }

    // 3. Create journal entries
    const postings = [
      {
        // account_id: accountsReceivableAccount.id,    // DR: Accounts Receivable
        // credit_account_id: revenueAccount.id,        // CR: Revenue
        amount: invoice.invoice_total,
        description: `Sales Invoice ${invoice.invoice_number} - ${invoice.customers?.customer_name}`,
        posting_type: 'SALES_INVOICE',
        value_date: invoice.invoice_date,
        posting_date: new Date(),
        invoice_id: invoice.id,
        name: `SI-${invoice.invoice_number}`,
        org_id: invoice.org_id,
        created_by: context.authContext?.user.id,
        modified_by: context.authContext?.user.id,
      }
    ];

    // 4. Insert postings
    await tx.posting.createMany({ data: postings });

    logger.debug('Created sales invoice postings', {
      invoice_id: instance_id,
      invoice_number: invoice.invoice_number,
      postings_count: postings.length,
      total_amount: invoice.invoice_total
    });

    return {
      success: true,
      postings_created: postings.length,
      invoice_id: instance_id,
      total_amount: invoice.invoice_total
    };

  } catch (error: any) {
    logger.error('Error creating sales invoice postings', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      instance_id,
      model,
    });
    throw new Error(`Failed to create sales invoice postings: ${error.message}`);
  }
};

/**
 * Calculate delivery challan total amount based on line items.
 * Calculates line totals considering rate, quantity_delivered, discount_rate, and tax_rate.
 * @param context AuthContext
 * @param model string
 * @param instance_id string
 * @param change_set string[]
 * @param select_set any
 * @param tx transaction client
 * @returns updated delivery challan with calculated total_amount
 */
export const calculate_delivery_challan_total = async (
  context: AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Validate transaction client
    if (!tx || !tx.delivery_challan) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    logger.info('Calculating delivery challan total', {
      model,
      instance_id,
      change_set,
    });

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    // Fetch delivery challan with items
    const delivery_challan: any = await tx.delivery_challan.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        challan_number: true,
        total_amount: true,
        delivery_challan_items: {
          select: {
            id: true,
            quantity_delivered: true,
            rate: true,
            discount_rate: true,
            discount_amount: true,
            tax_rate: true,
            tax_amount: true,
            line_total: true,
          },
        },
      },
    });

    if (!delivery_challan) {
      throw new Error(`Delivery challan with id ${instance_id} not found`);
    }

    // Calculate totals for each line item (same pattern as calculate_sales_order_total)
    const challan_calculations = delivery_challan.delivery_challan_items.reduce(
      (acc: any, item: any) => {
        const quantity_delivered = Number(item.quantity_delivered || 0);
        const rate = Number(item.rate || 0);
        const discount_rate = Number(item.discount_rate || 0);
        const tax_rate = Number(item.tax_rate || 0);

        // Step 1: Base line total (quantity_delivered × rate)
        const base_line_total = roundToTwoDecimals(quantity_delivered * rate);

        // Step 2: Discount amount from discount_rate (% of base)
        let discount_amount = 0;
        if (discount_rate > 0) {
          discount_amount = roundToTwoDecimals(base_line_total * (discount_rate / 100));
        }

        // Step 3: Line total after discount
        const line_total_after_discount = roundToTwoDecimals(base_line_total - discount_amount);

        // Step 4: Tax amount from tax_rate (% of amount after discount)
        let tax_amount = 0;
        if (tax_rate > 0) {
          tax_amount = roundToTwoDecimals(line_total_after_discount * (tax_rate / 100));
        }

        // Step 5: Final line total (after discount + tax)
        const line_total = roundToTwoDecimals(line_total_after_discount + tax_amount);

        acc.modified_items.push({
          where: { id: item.id },
          data: { line_total, discount_amount, tax_amount },
        });

        return {
          sub_total: roundToTwoDecimals(acc.sub_total + base_line_total),
          total_amount: roundToTwoDecimals(acc.total_amount + line_total),
          total_discount_amount: roundToTwoDecimals(acc.total_discount_amount + discount_amount),
          total_tax_amount: roundToTwoDecimals(acc.total_tax_amount + tax_amount),
          modified_items: acc.modified_items,
        };
      },
      {
        sub_total: 0,
        total_amount: 0,
        total_discount_amount: 0,
        total_tax_amount: 0,
        modified_items: [],
      }
    );

    const updatedChallan = await tx.delivery_challan.update({
      where: { id: instance_id },
      data: {
        total_amount: challan_calculations.total_amount,
        delivery_challan_items: {
          updateMany: challan_calculations.modified_items,
        },
      },
      select: (select_set && Object.keys(select_set || {}).length > 0) ? select_set : undefined,
    });

    return {
      ...updatedChallan,
      sub_total: challan_calculations.sub_total,
      total_amount: challan_calculations.total_amount,
      total_discount_amount: challan_calculations.total_discount_amount,
      total_tax_amount: challan_calculations.total_tax_amount,
    };
  } catch (error: any) {
    logger.error("Error in calculate_delivery_challan_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate delivery challan total: ${error.message}`
      : "Failed to calculate delivery challan total";
    throw new Error(errorMessage);
  }
};

/**
 * Reverse ledger postings when a sales invoice is rejected back to draft
 * DR: Revenue, CR: Accounts Receivable (reverse of approval entries)
 * @param context WorkflowContext
 * @param model string
 * @param instance_id string
 * @param change_set string[]
 * @param select_set any
 * @param tx transaction client
 */
export const reverse_sales_invoice_postings = async (
  context: WorkflowContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    logger.debug('Reversing sales invoice postings', {
      instance_id,
      model,
      context: context.authContext?.user.id
    });

    if (!tx || !tx.invoice || !tx.posting) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    // 1. Fetch invoice details
    const invoice = await tx.invoice.findUnique({
      where: { id: instance_id },
      select: {
        id: true,
        invoice_number: true,
        invoice_type: true,
        invoice_total: true,
        org_id: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${instance_id} not found`);
    }

    // 2. Find existing sales invoice postings
    const existingPostings = await tx.posting.findMany({
      where: {
        invoice_id: instance_id,
        posting_type: 'SALES_INVOICE'
      },
      select: {
        id: true,
        account_id: true,
        credit_account_id: true,
        amount: true,
        description: true,
        name: true,
        org_id: true,
      },
    });

    if (existingPostings.length === 0) {
      logger.debug('No active postings found to reverse', { invoice_id: instance_id });
      return { success: true, postings_reversed: 0, reversals_created: 0 };
    }

    // Create reversal entries for existing postings (swap debit/credit)
    const reversalPostings = existingPostings.map((posting: any) => ({
      account_id: posting.credit_account_id,        // DR: Revenue (was CR)
      credit_account_id: posting.account_id,        // CR: Accounts Receivable (was DR)
      amount: posting.amount,
      description: `REVERSAL: ${posting.description}`,
      posting_type: 'REVERSAL',
      value_date: new Date(),
      posting_date: new Date(),
      invoice_id: instance_id,
      reversal_of_posting_id: posting.id,
      name: `REV-${posting.name}`,
      org_id: posting.org_id,
      created_by: context.authContext?.user.id,
      modified_by: context.authContext?.user.id,
    }));

    // Insert reversal postings
    await tx.posting.createMany({ data: reversalPostings });

    // Mark original postings as reversed
    await tx.posting.updateMany({
      where: {
        invoice_id: instance_id,
        posting_type: 'SALES_INVOICE',
        reversed_at: null,
      },
      data: {
        reversed_at: new Date(),
        status: 'REVERSED',
        modified_by: context.authContext?.user.id,
      }
    });

    logger.debug('Created reversal postings for sales invoice', {
      invoice_id: instance_id,
      invoice_number: invoice.invoice_number,
      original_postings: existingPostings.length,
      reversal_postings: reversalPostings.length,
      total_amount: invoice.invoice_total
    });

    return {
      success: true,
      postings_reversed: existingPostings.length,
      reversals_created: reversalPostings.length,
      invoice_id: instance_id,
      total_amount: invoice.invoice_total
    };

  } catch (error: any) {
    logger.error('Error reversing sales invoice postings', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      instance_id,
      model,
    });
    throw new Error(`Failed to reverse sales invoice postings: ${error.message}`);
  }
};

/**
 * Calculate credit note total amount based on line items.
 * Calculates line totals considering rate, quantity, and tax_rate.
 * @param context AuthContext
 * @param model string
 * @param instance_id string
 * @param change_set string[]
 * @param select_set any
 * @param tx transaction client
 * @returns updated credit note with calculated totals
 */
export const calculate_credit_note_total = async (
  context: AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Validate transaction client
    if (!tx || !tx.credit_note) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    logger.info('Calculating credit note total', {
      model,
      instance_id,
      change_set,
    });

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    // Fetch credit note with items
    const credit_note: any = await tx.credit_note.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        credit_note_number: true,
        credit_note_date: true,
        credit_note_total: true,
        credit_note_item: {
          select: {
            id: true,
            quantity: true,
            rate: true,
            discount_rate: true,
            discount_amount: true,
            tax_rate: true,
            tax_amount: true,
            line_total: true,
          },
        },
      },
    });

    if (!credit_note) {
      throw new Error(`Credit note with id ${instance_id} not found`);
    }

    // Calculate totals for each line item (same pattern as calculate_sales_order_total)
    const credit_note_calculations = credit_note.credit_note_item.reduce(
      (acc: any, item: any) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const discount_rate = Number(item.discount_rate || 0);
        const tax_rate = Number(item.tax_rate || 0);

        // Step 1: Base line total (quantity × rate)
        const base_line_total = roundToTwoDecimals(quantity * rate);

        // Step 2: Discount amount from discount_rate (% of base)
        let discount_amount = 0;
        if (discount_rate > 0) {
          discount_amount = roundToTwoDecimals(
            base_line_total * (discount_rate / 100)
          );
        }

        // Step 3: Line total after discount
        const line_total_after_discount = roundToTwoDecimals(
          base_line_total - discount_amount
        );

        // Step 4: Tax amount from tax_rate (% of amount after discount)
        let tax_amount = 0;
        if (tax_rate > 0) {
          tax_amount = roundToTwoDecimals(
            line_total_after_discount * (tax_rate / 100)
          );
        }

        // Step 5: Final line total (after discount + tax)
        const line_total = roundToTwoDecimals(
          line_total_after_discount + tax_amount
        );

        // Prepare update for this item
        acc.modified_items.push({
          where: { id: item.id },
          data: {
            line_total,
            discount_amount,
            tax_amount,
          },
        });

        // Accumulate totals
        return {
          sub_total: roundToTwoDecimals(acc.sub_total + base_line_total),
          credit_note_total: roundToTwoDecimals(
            acc.credit_note_total + line_total
          ),
          total_discount_amount: roundToTwoDecimals(
            acc.total_discount_amount + discount_amount
          ),
          total_tax_amount: roundToTwoDecimals(
            acc.total_tax_amount + tax_amount
          ),
          modified_items: acc.modified_items,
        };
      },
      {
        sub_total: 0,
        credit_note_total: 0,
        total_discount_amount: 0,
        total_tax_amount: 0,
        modified_items: [],
      }
    );

    // Update credit note and items
    const updatedCreditNote = await tx.credit_note.update({
      where: {
        id: instance_id,
      },
      data: {
        credit_note_total: credit_note_calculations.credit_note_total,
        credit_note_item: {
          updateMany: credit_note_calculations.modified_items,
        },
      },
      select:
        select_set && Object.keys(select_set || {}).length > 0
          ? select_set
          : undefined,
    });

    return {
      ...updatedCreditNote,
      sub_total: credit_note_calculations.sub_total,
      credit_note_total: credit_note_calculations.credit_note_total,
      total_discount_amount: credit_note_calculations.total_discount_amount,
      total_tax_amount: credit_note_calculations.total_tax_amount,
    };
  } catch (error: any) {
    logger.error("Error in calculate_credit_note_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate credit note total: ${error.message}`
      : "Failed to calculate credit note total";
    throw new Error(errorMessage);
  }
};

/**
 * Calculate quote total amount based on line items.
 * Calculates line totals considering rate, quantity, discount_rate, and tax_rate.
 * @param context AuthContext
 * @param model string
 * @param instance_id string
 * @param change_set string[]
 * @param select_set any
 * @param tx transaction client
 * @returns updated quote with calculated totals
 */
export const calculate_quote_total = async (
  context: AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Validate transaction client
    if (!tx || !tx.quote) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    logger.info('Calculating quote total', {
      model,
      instance_id,
      change_set,
    });

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    // Fetch quote with items
    const quote: any = await tx.quote.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        quote_number: true,
        quote_date: true,
        total_amount: true,
        quote_items: {
          select: {
            id: true,
            quantity: true,
            rate: true,
            discount_rate: true,
            discount_amount: true,
            tax_rate: true,
            tax_amount: true,
            line_total: true,
          },
        },
      },
    });

    if (!quote) {
      throw new Error(`Quote with id ${instance_id} not found`);
    }

    // Calculate totals for each line item (same pattern as calculate_sales_order_total)
    const quote_calculations = quote.quote_items.reduce(
      (acc: any, item: any) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const discount_rate = Number(item.discount_rate || 0);
        const tax_rate = Number(item.tax_rate || 0);

        // Step 1: Base line total (quantity × rate)
        const base_line_total = roundToTwoDecimals(quantity * rate);

        // Step 2: Discount amount from discount_rate (% of base)
        let discount_amount = 0;
        if (discount_rate > 0) {
          discount_amount = roundToTwoDecimals(
            base_line_total * (discount_rate / 100)
          );
        }

        // Step 3: Line total after discount
        const line_total_after_discount = roundToTwoDecimals(
          base_line_total - discount_amount
        );

        // Step 4: Tax amount from tax_rate (% of amount after discount)
        let tax_amount = 0;
        if (tax_rate > 0) {
          tax_amount = roundToTwoDecimals(
            line_total_after_discount * (tax_rate / 100)
          );
        }

        // Step 5: Final line total (after discount + tax)
        const line_total = roundToTwoDecimals(
          line_total_after_discount + tax_amount
        );

        acc.modified_items.push({
          where: { id: item.id },
          data: { line_total, discount_amount, tax_amount },
        });

        return {
          sub_total: roundToTwoDecimals(acc.sub_total + base_line_total),
          total_amount: roundToTwoDecimals(acc.total_amount + line_total),
          total_discount_amount: roundToTwoDecimals(
            acc.total_discount_amount + discount_amount
          ),
          total_tax_amount: roundToTwoDecimals(
            acc.total_tax_amount + tax_amount
          ),
          modified_items: acc.modified_items,
        };
      },
      {
        sub_total: 0,
        total_amount: 0,
        total_discount_amount: 0,
        total_tax_amount: 0,
        modified_items: [],
      }
    );

    // Update quote and items
    const updatedQuote = await tx.quote.update({
      where: {
        id: instance_id,
      },
      data: {
        total_amount: quote_calculations.total_amount,
        quote_items: {
          updateMany: quote_calculations.modified_items,
        },
      },
      select:
        select_set && Object.keys(select_set || {}).length > 0
          ? select_set
          : undefined,
    });

    return {
      ...updatedQuote,
      sub_total: quote_calculations.sub_total,
      total_amount: quote_calculations.total_amount,
      total_discount_amount: quote_calculations.total_discount_amount,
      total_tax_amount: quote_calculations.total_tax_amount,
    };
  } catch (error: any) {
    logger.error("Error in calculate_quote_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate quote total: ${error.message}`
      : "Failed to calculate quote total";
    throw new Error(errorMessage);
  }
};




