import { AuthContext } from "../../auth/types";
import logger from '../../utils/logger';
import moment from "moment";
import { randomUUID } from "crypto";
import { ModelService } from "../../services/core/ModelService";
import { WorkflowContext } from "../../workflow-engine/types/workflow.types";
import { WorkflowEngine } from "../../workflow-engine/core/WorkflowEngine";
import { sendEmail } from './email';
import { generateWorkflowEmailTemplate, getActionSuffix } from './emailTemplates';


export const calculate_invoice_total = async (context: AuthContext, model: string, instance_id: string, change_set: string[], select_set: any, tx: any) => {
  try {
    // Validate transaction client
    if (!tx || !tx.invoice) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    logger.debug('Calculating invoice total', {
      model,
      instance_id,
      change_set,
    });

    let invoice: any = await tx.invoice.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        invoice_number: true,
        invoice_date: true,
        invoice_total: true,
        invoice_net_total: true,
        adjustable_value: true,
        adjustable_label: true,
        wf_instance_id: true,
        payment_terms_id: true,
        payment_terms: {
          select: {
            id: true,
            payment_terms: true,
          },
        },
        invoice_line_item: {
          select: {
            id: true,
            purchase_order_item_id: true,
            rate: true,
            invoice_qty: true,
            line_total: true,
            discount_rate: true,
            discount_amount: true,
            tax_rate: true,
            line_tax_amount: true,
            purchase_order_line_item: {
              select: {
                id: true,
                invoice_qty: true,
                invoice_line_item: {
                  select: {
                    id: true,
                    invoice_qty: true,
                    invoice: {
                      select: {
                        id: true,
                        wf_instance_id: true,
                      }
                    }
                  },
                },
              },
            },
          },
        },
      },
    });

    const workflowInstance = invoice.wf_instance_id ? await tx.workflow_instance.findUnique({
      where: { id: invoice.wf_instance_id },
      select: { id: true, current_state: true }
    }) : null;

    // Collect all unique workflow instance IDs from invoice line items
    const allWfInstanceIds = new Set<string>();
    invoice.invoice_line_item?.forEach((item: any) => {
      if (item.purchase_order_line_item?.invoice_line_item) {
        item.purchase_order_line_item.invoice_line_item.forEach((invItem: any) => {
          if (invItem.invoice?.wf_instance_id) {
            allWfInstanceIds.add(invItem.invoice.wf_instance_id);
          }
        });
      }
    });

    // Fetch all workflow instances for invoices in PO line items
    const allWorkflowInstances = allWfInstanceIds.size > 0
      ? await tx.workflow_instance.findMany({
        where: { id: { in: Array.from(allWfInstanceIds) } },
        select: { id: true, current_state: true }
      })
      : [];

    // Create a map of wf_instance_id -> current_state for quick lookup
    const workflowStateMap = new Map<string, string>();
    allWorkflowInstances.forEach((wf: any) => {
      workflowStateMap.set(wf.id, wf.current_state);
    });

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    const invoice_calculations = invoice.invoice_line_item.reduce(
      (acc: any, item: any) => {
        const quantity = Number(item.invoice_qty || 0);
        const rate = Number(item.rate || 0);
        const discount_rate = Number(item.discount_rate || 0);
        const tax_rate = Number(item.tax_rate || 0);

        // Step 1: Base line total (quantity × rate)
        const base_line_total = roundToTwoDecimals(quantity * rate);

        // Step 2: Discount amount from discount_rate (% of base)
        let discount_amount = 0;
        if (discount_rate > 0) {
          discount_amount = roundToTwoDecimals(base_line_total * (discount_rate / 100));
        }

        // Step 3: Line total after discount
        const line_total_after_discount = roundToTwoDecimals(base_line_total - discount_amount);

        // Step 4: Tax amount from tax_rate (% of amount after discount)
        const line_tax_amount = roundToTwoDecimals(line_total_after_discount * (tax_rate / 100));

        // Step 5: Final line total (after discount + tax)
        const line_total = roundToTwoDecimals(line_total_after_discount + line_tax_amount);

        acc.modified_items.push({
          where: { id: item.id },
          data: {
            line_total,
            line_tax_amount,
            discount_amount,
          },
        });

        // Skip if item is empty or purchase_order_line_item is missing
        if (item && item.purchase_order_line_item && item.purchase_order_line_item.invoice_line_item) {
          if (workflowInstance?.current_state !== "Draft") {
            // Filter out Draft invoices - only include approved/non-Draft invoices
            // Use workflow instance current_state instead of invoice status
            const nonDraftInvoiceLineItems = item.purchase_order_line_item.invoice_line_item.filter(
              (inv_item: any) => {
                const wfInstanceId = inv_item.invoice?.wf_instance_id;
                const workflowState = wfInstanceId ? workflowStateMap.get(wfInstanceId) : null;
                return workflowState !== "Draft";
              }
            );

            const po_item_qty_total =
              nonDraftInvoiceLineItems.reduce(
                (inv_item_acc: any, inv_item: any) => {
                  const quantity = Number(inv_item.invoice_qty || 0);
                  inv_item_acc = inv_item_acc + quantity;
                  return inv_item_acc;
                },
                0
              );

            acc.modified_po_items.push({
              where: { id: item.purchase_order_item_id },
              data: {
                invoice_qty: po_item_qty_total,
              },
            });
          }
        }
        return {
          invoice_net_total: roundToTwoDecimals(acc.invoice_net_total + line_total_after_discount),
          tax_total: roundToTwoDecimals(acc.tax_total + line_tax_amount),
          invoice_total: roundToTwoDecimals(acc.invoice_total + line_total),
          modified_items: acc.modified_items,
          modified_po_items: acc.modified_po_items,
        };
      },
      {
        invoice_net_total: 0,
        tax_total: 0,
        invoice_total: 0,
        modified_items: [],
        modified_po_items: [],
      }
    );

    const poItemUpdates = await Promise.all(
      invoice_calculations.modified_po_items.map((item: any) =>
        tx.purchase_order_item.updateMany({
          where: item.where,
          data: item.data
        })
      )
    );


    const updatedInvoice = await tx.invoice.update({
      where: {
        id: instance_id,
      },
      data: {
        invoice_total: roundToTwoDecimals(
          invoice_calculations.invoice_total + Number(invoice.adjustable_value || 0)
        ),
        invoice_net_total: invoice_calculations.invoice_net_total,
        tax_total: invoice_calculations.tax_total,
        invoice_line_item: {
          updateMany: invoice_calculations.modified_items,
        },
      },
      select: (select_set && Object.keys(select_set || {}).length > 0) ? select_set : undefined,
    });

    return updatedInvoice;
  } catch (error: any) {
    logger.error("Error in calculate_invoice_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate invoice total: ${error.message}`
      : "Failed to calculate invoice total";
    throw new Error(errorMessage);
  }
};
export const calculate_payment_total = async (context: AuthContext, model: string, instance_id: string, change_set: string[], select_set: any, tx: any) => {
  try {
    // Validate transaction client
    if (!tx || !tx.invoice) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };
    // Get invoice with payment receipts using the relation
    const invoice = await tx.invoice.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        invoice_number: true,
        invoice_date: true,
        invoice_version: true,
        customer_id: true,
        location_id: true,
        invoice_net_total: true,
        invoice_total: true,
        balance_amount: true,
        payment_receipt: {
          select: {
            id: true,
            amount: true,
            receipt_number: true,
            receipt_date: true,
            payment_method: true,
            payment_type: true,
          },
        },
      },
    });
    if (!invoice) {
      throw new Error(`Invoice with id ${instance_id} not found`);
    }
    const invoiceTotal = Number(invoice.invoice_total) || 0;
    // Calculate total payment amount from existing receipts
    const totalPaymentAmount = invoice.payment_receipt.reduce((sum: number, receipt: any) => {
      return sum + (Number(receipt.amount) || 0);
    }, 0);
    // Only update the invoice if invoice total is equal to or less than total payments
    const remainingBalance = roundToTwoDecimals(invoiceTotal - totalPaymentAmount);
    // Only update the invoice if validation passes
    let result: any = null; // Initialize result to null
    if (totalPaymentAmount <= invoiceTotal) {
      result = await tx.invoice.update({
        where: { id: instance_id },
        data: {
          balance_amount: remainingBalance,
        },
        select: select_set || {
          id: true,
          invoice_number: true,
          invoice_date: true,
          invoice_version: true,
          customer_id: true,
          location_id: true,
          invoice_net_total: true,
          invoice_total: true,
          balance_amount: true,
          payment_receipt: {
            select: {
              id: true,
              amount: true,
              receipt_number: true,
              receipt_date: true,
              payment_method: true,
              payment_type: true,
            },
          },
        },
      });
    }
    else {
      throw new Error(
        `Total payments (${roundToTwoDecimals(totalPaymentAmount)}) are greater than invoice total (${invoiceTotal}). Cannot update balance amount.`
      );
    }
    // Remove the else block since we already have the check above
    // Move these lines inside the if block above where updatedInvoice is defined
    return result;
  }
  catch (error: any) {
    logger.error("Error in calculate_payment_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model,
        change_set: change_set
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate payment total: ${error.message}`
      : "Failed to calculate payment total";
    throw new Error(errorMessage);
  }
};

export const getPurchaseDetails = async (instance_id: string, tx: any) => {
  try {
    const purchase_requisition = await tx.purchase_requisition.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        status: true,
        requester: true,
        pr_date: true,
        pr_number: true,
        purchase_reason: true,
        org_id: true,
        created_by: true,
        created_at: true,
        modified_by: true,
        modified_at: true,
        on_behalf_of_user: true,
        on_behalf_of: true,
        deliver_to: true,
        attach: true,
        request_for_project: true,
        requester_department: true,
        behalf_user_id: true,
        total_price: true,
        cost_center_id: true,
        location_id: true,
        legal_entity_id: true,
        on_behalf_department: true,

        items: {
          select: {
            id: true,
            product_id: true,
            item_code: true,
            item_description: true,
            item_number: true,
            item_type: true,
            uom: true,
            rate: true,
            quantity: true,
            item_total: true,
            need_by_date: true,
            supplier_id: true,
            supplier: {
              select: {
                id: true,
                supplier_name: true,
                supplier_address: true,
                primary_phone: true,
                primary_email: true,
                status: true,
                payment_term_id: true,
                shipping_term_id: true,
                shipping_method_id: true,
                preferred_currency_id: true,
                payment_terms: {
                  select: {
                    id: true,
                    payment_terms: true,
                    description: true,
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
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                item_name: true,
                item_code: true,
                item_shortname: true,
                item_description: true,
                item_type: true,
                unit_price: true,
                uom_id: true,
                supplier: {
                  select: {
                    id: true,
                  }
                },
                uom: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return purchase_requisition;
  } catch (error) {
    console.error("Error fetching items:", error);
    throw new Error("Failed to fetch items");
  }
};

export const generate_po_from_pr = async (context: WorkflowContext | AuthContext, model: string, instance_id: string, change_set: string[], select_set: any, tx: any) => {
  try {
    // Extract WorkflowContext from the context parameter
    const workflowContext = (context as any).authContext ? context as WorkflowContext : null;
    const authContext = workflowContext ? workflowContext.authContext : (context as AuthContext);
    const modelId = workflowContext ? workflowContext.instance.model_id : instance_id;

    if (!authContext) {
      throw new Error('AuthContext is required but not provided');
    }

    if (!tx || !tx.purchase_requisition) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    logger.info('Generating purchase order from purchase requisition', {
      context: workflowContext || authContext,
      instance_id: modelId,
    });
    const purchase_requisition: any =
      await tx.purchase_requisition.findUnique({
        where: {
          id: modelId,
        },
        select: {
          id: true,
          status: true,
          pr_number: true,
          pr_date: true,
          requester: true,
          purchase_reason: true,
          org_id: true,
          created_by: true,
          created_at: true,
          modified_by: true,
          modified_at: true,
          on_behalf_of_user: true,
          on_behalf_of: true,
          deliver_to: true,
          attach: true,
          request_for_project: true,
          requester_department: true,
          behalf_user_id: true,
          total_price: true,
          cost_center_id: true,
          location_id: true,
          legal_entity_id: true,
          on_behalf_department: true,

          items: {
            select: {
              id: true,
              product_id: true,
              item_code: true,
              item_description: true,
              item_number: true,
              item_type: true,
              uom: true,
              rate: true,
              quantity: true,
              item_total: true,
              need_by_date: true,
              supplier_id: true,
              supplier: {
                select: {
                  id: true,
                  supplier_name: true,
                  supplier_address: true,
                  primary_phone: true,
                  primary_email: true,
                  status: true,
                  payment_term_id: true,
                  shipping_term_id: true,
                  shipping_method_id: true,
                  preferred_currency_id: true,
                  payment_terms: {
                    select: {
                      id: true,
                      payment_terms: true,
                      description: true,
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
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  item_name: true,
                  item_code: true,
                  item_shortname: true,
                  item_description: true,
                  item_type: true,
                  unit_price: true,
                  uom_id: true,
                  supplier: {
                    select: {
                      id: true,
                    }
                  },
                  uom: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    const groupedBySupplier = purchase_requisition.items.reduce(
      (acc: any, item: any) => {
        const formattedDate = moment(item.need_by_date).format("DD-MM-YYYY");
        if (!item.supplier || !item.supplier.id) {
          throw new Error('Supplier is null or undefined for line item with id: ' + item.id);
        }
        const key = `${item.supplier.id},${formattedDate}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(item);
        return acc;
      },
      {}
    );

    for (const key in groupedBySupplier) {
      groupedBySupplier[key].sort((a: any, b: any) => {
        // Handle cases where item_number might be null or undefined
        const aNum = a.item_number || '';
        const bNum = b.item_number || '';
        return aNum.localeCompare(bNum);
      });
    }
    const suppliers = Object.keys(groupedBySupplier);
    const user: any = authContext?.user;
    const purchase_order_data = (await getPurchaseDetails(
      modelId, tx
    )) as any;
    const purchaseOrderResponse = await Promise.all(
      suppliers.map(async (supplier) => {
        logger.debug('creating purchase order for supplier', supplier);
        const [supplierId, formattedDate] = supplier.split(",");

        const supplierItems = groupedBySupplier[supplier];

        const supplierDetails = supplierItems[0];

        const NeedByDate = supplierItems.reduce((earliest: Date, item: any) => {
          const itemDate = new Date(item.need_by_date);
          return itemDate < earliest ? itemDate : earliest;
        }, new Date(supplierItems[0].need_by_date));

        const purchaseOrderData = {
          requester: purchase_order_data?.requester,
          purchase_reason: purchase_order_data?.purchase_reason,
          org_id: purchase_order_data?.org_id,
          // total_price: purchase_order_data?.total_price,
          pr_total: purchase_order_data?.total_price,
          comment: purchase_order_data?.purchase_reason,
          created_by: purchase_order_data?.created_by,
          modified_by: purchase_order_data?.modified_by,
          assigned_to: purchase_order_data?.assigned_to,
          department_id: purchase_order_data?.department_id,
          project_master_id: purchase_order_data?.project_name,
          budget_period_id: purchase_order_data?.budget_period,
          budget_line_id: purchase_order_data?.budget_line,
          pr_number: purchase_order_data?.pr_number,
          pr_date: purchase_order_data?.pr_date,
          deliver_to: purchase_order_data?.deliver_to,
          delivery_address: purchase_order_data?.deliver_to,
          location_id: purchase_order_data?.location_id,
          legal_entity_id: purchase_order_data?.legal_entity_id,
          on_behalf_department: purchase_order_data?.on_behalf_department,
          on_behalf_of: purchase_order_data?.on_behalf_of,
          chart_of_accounts: purchase_order_data?.chart_of_accounts,
          purchase_id: purchase_requisition.id,
          supplier_id: supplierId,
          shipping_terms_id: supplierDetails?.supplier?.shipping_term_id,
          shipping_method_id: supplierDetails?.supplier?.shipping_method_id,
          payment_terms_id: supplierDetails?.supplier?.payment_term_id,
          need_by_date: NeedByDate,
        };

        const modelService = ModelService.getInstance();
        const purchaseOrder = await modelService.create('purchase_order', authContext, purchaseOrderData, {}, tx);
        // Check if purchase order creation was successful
        if (!purchaseOrder.success || !purchaseOrder.data) {
          throw new Error(`Failed to create purchase order: ${purchaseOrder.error || 'Unknown error'}`);
        }

        const purchaseOrderItems = groupedBySupplier[supplier].map((item: any) => ({
          purchase_requisition_id: modelId,
          item_id: item?.id,
          product_id: item?.product_id || item?.product?.id,
          item_code: item?.item_code || item?.product?.item_code,
          item_description: item?.item_description || item?.product?.item_description,
          item_type: item?.item_type || item?.product?.item_type,
          uom: item?.uom || item?.product?.uom?.name,
          rate: item?.rate || item?.product?.unit_price,
          item_name: item?.item_name || item?.product?.item_name,
          quantity: item?.quantity,
          ordered_quantity: item?.quantity,
          org_id: user?.org_id,
          need_by_date: item?.need_by_date,
          supplier_id: item?.supplier_id || item?.product?.supplier?.id,
          item_total: item?.item_total,
          ordered_amount: item?.item_total,
        }));
        await modelService.addChildrenToParent(
          'purchase_order',
          purchaseOrder.data.id,
          'purchase_order_item',
          authContext,
          purchaseOrderItems,
          {},
          tx
        );

        return {
          ...purchaseOrder,
          order_items: purchaseOrderItems,
        };
      }));
    // Check for any failed purchase orders - if any fail, fail completely to rollback transaction
    const failedOrders = purchaseOrderResponse.filter((response: any) => response.success === false);

    if (failedOrders.length > 0) {
      logger.error('Some purchase orders failed to create', {
        failedOrders,
        failedCount: failedOrders.length,
        totalCount: purchaseOrderResponse.length
      });
      const errorMessages = failedOrders
        .map((order: any) => order.error || 'Unknown error')
        .join('; ');
      throw new Error(`Failed to create ${failedOrders.length} of ${purchaseOrderResponse.length} purchase orders: ${errorMessages}`);
    }

    // All orders succeeded
    const successfulOrders = purchaseOrderResponse.filter((response: any) => response.success !== false);

    if (successfulOrders.length === 0) {
      throw new Error('Failed to create any purchase orders');
    }

    return successfulOrders;
  } catch (error: any) {
    logger.error("Error generating purchase order from purchase requisition", {
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
      ? `Failed to generate purchase order: ${error.message}`
      : "Failed to generate purchase order";
    throw new Error(errorMessage);
  }
};


export const calculate_pr_total = async (context: AuthContext, model: string, instance_id: string, change_set: string[], select_set: any, tx: any) => {

  try {
    // Validate transaction client
    if (!tx || !tx.purchase_requisition) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    let purchase_requisition: any = await tx.purchase_requisition.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        total_price: true,
        items: {
          select: {
            id: true,
            rate: true,
            quantity: true,
            item_total: true,
          },
        },
      },
    });

    const pr_calculations = purchase_requisition.items.reduce(
      (acc: any, item: any) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const item_total = roundToTwoDecimals(quantity * rate);

        acc.modified_items.push({
          where: { id: item.id },
          data: {
            item_total,
          },
        });

        return {
          total_price: roundToTwoDecimals(acc.total_price + item_total),
          modified_items: acc.modified_items,
        };
      },
      {
        total_price: 0,
        modified_items: [],
      }
    );

    const updates = await tx.purchase_requisition.update({
      where: {
        id: instance_id,
      },
      data: {
        total_price: pr_calculations.total_price,
        items: {
          updateMany: pr_calculations.modified_items,
        },
      },
      select: select_set,
    });

    return updates;
  } catch (error: any) {
    logger.error("Error in calculate_pr_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate purchase requisition total: ${error.message}`
      : "Failed to calculate purchase requisition total";
    throw new Error(errorMessage);
  }
};

/**
 * Generate an invoice and invoice_line_items from a purchase order and its line items.
 * Uses workflow action signature: (context, model, instance_id, change_set, select_set, tx).
 * @param context AuthContext or WorkflowContext
 * @param model model name (e.g. "purchase_order")
 * @param instance_id purchase order id (when called from workflow)
 * @param change_set unused
 * @param select_set unused
 * @param tx transaction client
 * @returns created invoice and line items
 */
export const generate_invoice_from_po = async (
  context: AuthContext | WorkflowContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Support both workflow (6-arg) and custom action (5-arg) call sites.
    // Custom action: (context, id, attributes, options, tx) → model=id, instance_id=attributes, select_set=tx.
    const isCustomActionCall = select_set?.purchase_order != null && !tx?.purchase_order;
    const effectiveTx = tx?.purchase_order ? tx : select_set?.purchase_order ? select_set : undefined;
    if (!effectiveTx) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }
    const purchase_order_id = (context as any).instance?.model_id ?? (isCustomActionCall ? model : instance_id);
    const data = (isCustomActionCall ? (instance_id && typeof instance_id === 'object' ? instance_id : {}) : (select_set && typeof select_set === 'object' ? select_set : {}));

    const authContext = (context as any).authContext ?? context;

    const modelService = ModelService.getInstance();
    // 1. Fetch purchase order and supplier details
    const purchaseOrder = await effectiveTx.purchase_order.findUnique({
      where: { id: purchase_order_id },
      select: {
        id: true,
        po_number: true,
        pr_number: true,
        pr_date: true,
        requester: true,
        requester_department: true,
        comment: true,
        total_price: true,
        status: true,
        purchase_id: true,
        need_by_date: true,
        pr_total: true,
        supplier_id: true,
        account_id: true,
        created_at: true,
        created_by: true,
        modified_by: true,
        modified_at: true,
        assigned_to: true,
        org_id: true,
        account: { select: { id: true, code: true } },
        supplier_details: {
          select: {
            id: true,
            supplier_name: true,
            supplier_address: true,
            primary_phone: true,
            primary_email: true,
            status: true,
            payment_term_id: true,
            shipping_term_id: true,
            shipping_method_id: true,
            preferred_currency_id: true,
            payment_terms: { select: { id: true, payment_terms: true, description: true } },
            shipping_method: { select: { id: true, shipping_method: true } },
            shipping_terms: { select: { id: true, shipping_terms: true, description: true } },
          },
        },
      },
    });
    if (!purchaseOrder) throw new Error('Purchase order not found');

    // 2. Prepare invoice data
    // Generate id explicitly: Prisma's dbgenerated() default doesn't work
    // reliably inside interactive transactions (workflow side effects).
    const invoiceData: any = {
      id: `invoice_${randomUUID()}`,
      supplier_name: purchaseOrder?.supplier_details?.supplier_name,
      supplier_remarks: purchaseOrder?.comment,
      shipping_terms: purchaseOrder?.supplier_details?.shipping_terms?.shipping_terms,
      shipping_method: purchaseOrder?.supplier_details?.shipping_method?.shipping_method,
      payment_terms_id: purchaseOrder?.supplier_details?.payment_term_id
        ?? purchaseOrder?.supplier_details?.payment_terms?.id
        ?? null,
      requester_name: purchaseOrder?.requester,
      po_number: purchaseOrder?.po_number,
      invoice_type: 'With PO',
      purchase_order_id: purchaseOrder?.id,
      created_at: purchaseOrder?.created_at,
      created_by: purchaseOrder?.created_by,
      modified_by: purchaseOrder?.modified_by,
      modified_at: purchaseOrder?.modified_at,
      assigned_to: purchaseOrder?.assigned_to,
      org_id: purchaseOrder?.org_id,
      account_id: purchaseOrder?.account_id,
      status: '9',
      ...data, // allow override/additional fields
    };

    // 3. Create invoice
    const createdInvoiceResult = await modelService.create('invoice', authContext, invoiceData, {}, effectiveTx);
    if (!createdInvoiceResult.success) throw new Error('Failed to create invoice: ' + createdInvoiceResult.error);
    const createdInvoice = createdInvoiceResult.data;

    // 4. Fetch purchase order line items
    const poLineItems = await effectiveTx.purchase_order_item.findMany({
      where: { instance_id: purchase_order_id },
      orderBy: { purchase_order_item_no: 'asc' },
      select: {
        id: true,
        purchase_requisition_id: true,
        instance_id: true,
        product_id: true,
        supplier_id: true,
        item_code: true,
        item_description: true,
        item_type: true,
        uom: true,
        rate: true,
        quantity: true,
        item_total: true,
        need_by_date: true,
        item_id: true,
        item_name: true,
        ordered_quantity: true,
        ordered_amount: true,
        invoice_qty: true,
        invoiced_amount: true,
        created_at: true,
        created_by: true,
        modified_by: true,
        modified_at: true,
        assigned_to: true,
        org_id: true,
        product: {
          select: {
            item_name: true,
            id: true,
            item_description: true,
            item_type: true,
          },
        },
        purchase_order: {
          select: {
            id: true,
            po_number: true,
            need_by_date: true,
          },
        },
        item: {
          select: {
            id: true,
            item_code: true,
            rate: true,
            quantity: true,
            item_total: true,
            need_by_date: true,
          },
        },
      },
    });
    if (!poLineItems || poLineItems.length === 0) throw new Error('No purchase order line items found');

    // 5. Prepare invoice line items
    const invoiceLineItems = poLineItems.map((item: any) => ({
      item_name: item?.product?.item_name,
      item_description: item?.product?.item_description,
      item_type: item?.product?.item_type,
      rate: item?.rate,
      ordered_quantity: item?.quantity,
      ordered_amount: item?.item_total,
      po_number: item?.purchase_order?.po_number,
      purchase_order_item_id: item?.id,
      item_master_id: item?.product?.id,
      // instance_id: createdInvoice?.id,
      purchase_requisition_id: item?.purchase_requisition_id,
      need_by_date: item?.purchase_order?.need_by_date,
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
      effectiveTx
    );

    if (!result.success) throw new Error('Failed to create invoice line items: ' + result.error);

    const workflowEngine = new WorkflowEngine(effectiveTx);
    const workflowContext = await workflowEngine.getWorkflowContextForUI(
      result.data.wf_instance_id
    );
    result.workflow_context = workflowContext;
    return result;

  } catch (error: any) {
    logger.error('Error generating invoice from purchase order', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      purchase_order_id: (context as any).instance?.model_id ?? instance_id ?? model,
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to generate invoice from purchase order: ${error.message}`
      : "Failed to generate invoice from purchase order";
    throw new Error(errorMessage);
  }
};


export const calculate_po_total = async (context: AuthContext, model: string, instance_id: string, change_set: string[], select_set: any, tx: any) => {

  try {
    // Validate transaction client
    if (!tx || !tx.purchase_order) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    let purchase_order: any = await tx.purchase_order.findUnique({
      where: {
        id: instance_id,
      },
      select: {
        id: true,
        total_price: true,
        purchase_order_item: {
          select: {
            id: true,
            rate: true,
            quantity: true,
            item_total: true,
          },
        },
      },
    });

    const po_calculations = purchase_order.purchase_order_item.reduce(
      (acc: any, item: any) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const item_total = roundToTwoDecimals(quantity * rate);

        acc.modified_items.push({
          where: { id: item.id },
          data: {
            item_total,
          },
        });

        return {
          total_price: roundToTwoDecimals(acc.total_price + item_total),
          modified_items: acc.modified_items,
        };
      },
      {
        total_price: 0,
        modified_items: [],
      }
    );

    const updates = await tx.purchase_order.update({
      where: {
        id: instance_id,
      },
      data: {
        total_price: po_calculations.total_price,
        purchase_order_item: {
          updateMany: po_calculations.modified_items,
        },
      },
      select: select_set,
    });
    return updates;
  } catch (error: any) {
    logger.error("Error in calculate_po_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate purchase order total: ${error.message}`
      : "Failed to calculate purchase order total";
    throw new Error(errorMessage);
  }
};

export const calculate_sales_order_total = async (
  context: AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Validate transaction client
    if (!tx || !tx.sales_order) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    const roundToTwoDecimals = (value: number): number => {
      return parseFloat(value.toFixed(2));
    };

    const sales_order: any = await tx.sales_order.findUnique({
      where: { id: instance_id },
      select: {
        id: true,
        total_amount: true,
        adjustable_value: true,
        sales_order_items: {
          select: {
            id: true,
            quantity: true,
            rate: true,
            tax_rate: true,
            tax_amount: true,
            discount_rate: true,
            discount_amount: true,
            line_total: true,
          },
        },
      },
    });
    const so_calculations = sales_order.sales_order_items.reduce(
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
    const adjustedSalesOrderTotal = roundToTwoDecimals(
      so_calculations.total_amount + Number(sales_order.adjustable_value || 0)
    );
    const updates = await tx.sales_order.update({
      where: { id: instance_id },
      data: {
        total_amount: adjustedSalesOrderTotal,
        sales_order_items: {
          updateMany: so_calculations.modified_items,
        },
      },
      select: select_set,
    });
    return {
      ...updates,
      sub_total: so_calculations.sub_total,
      total_amount: adjustedSalesOrderTotal,
      total_discount_amount: so_calculations.total_discount_amount,
      total_tax_amount: so_calculations.total_tax_amount,
    };
  } catch (error: any) {
    logger.error("Error in calculate_sales_order_total", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id,
        model: model
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to calculate sales order total: ${error.message}`
      : "Failed to calculate sales order total";
    throw new Error(errorMessage);
  }
};

export const handle_invoice_reject = async (
  context: WorkflowContext | AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
) => {
  try {
    // Validate transaction client
    if (!tx || !tx.invoice) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    // Extract WorkflowContext from the context parameter
    const workflowContext = (context as any).authContext ? context as WorkflowContext : null;
    const authContext = workflowContext ? workflowContext.authContext : context as AuthContext;
    const modelId = workflowContext ? workflowContext.instance.model_id : instance_id;

    if (!authContext) {
      throw new Error('AuthContext is required but not provided');
    }

    logger.info('Handling invoice rejection and resetting PO line item quantities', {
      model,
      instance_id: modelId,
    });

    // 1. Get the rejected invoice with its line items
    const invoice: any = await tx.invoice.findUnique({
      where: { id: modelId },
      select: {
        id: true,
        invoice_number: true,
        invoice_line_item: {
          select: {
            id: true,
            purchase_order_item_id: true,
            invoice_qty: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new Error(`Invoice with id ${modelId} not found`);
    }

    if (!invoice.invoice_line_item || invoice.invoice_line_item.length === 0) {
      logger.info('No invoice line items found, skipping PO quantity reset');
      return invoice;
    }

    // 2. Group invoice line items by PO item ID to calculate quantities to subtract
    const poItemQuantityMap = new Map<string, number>();

    invoice.invoice_line_item.forEach((item: any) => {
      if (item.purchase_order_item_id) {
        const currentQty = poItemQuantityMap.get(item.purchase_order_item_id) || 0;
        poItemQuantityMap.set(
          item.purchase_order_item_id,
          currentQty + Number(item.invoice_qty || 0)
        );
      }
    });

    if (poItemQuantityMap.size === 0) {
      logger.info('No PO items found to update');
      return invoice;
    }

    // 3. For each PO item, reduce invoice_qty by the rejected invoice's line item quantities
    const poItemUpdates = await Promise.all(
      Array.from(poItemQuantityMap.entries()).map(async ([poItemId, qtyToReduce]) => {
        // Get current PO item to check its current invoice_qty
        const poItem = await tx.purchase_order_item.findUnique({
          where: { id: poItemId },
          select: {
            id: true,
            invoice_qty: true,
          },
        });

        if (!poItem) {
          logger.warn(`PO item ${poItemId} not found, skipping update`);
          return null;
        }

        // Calculate new invoice_qty by subtracting the rejected invoice's quantities
        const currentInvoiceQty = Number(poItem.invoice_qty || 0);
        const newInvoiceQty = Math.max(0, currentInvoiceQty - qtyToReduce);

        logger.info(`Reducing PO item ${poItemId} invoice_qty: ${currentInvoiceQty} - ${qtyToReduce} = ${newInvoiceQty}`);

        // Update the PO item's invoice_qty
        return tx.purchase_order_item.update({
          where: { id: poItemId },
          data: { invoice_qty: newInvoiceQty },
        });
      })
    );

    const successfulUpdates = poItemUpdates.filter(update => update !== null);
    logger.info('Successfully reset PO line item quantities', {
      invoice_id: modelId,
      po_items_updated: successfulUpdates.length,
      total_po_items: poItemQuantityMap.size,
    });

    return invoice;
  } catch (error: any) {
    logger.error('Error in handle_invoice_reject', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      metadata: {
        instance_id: (context as any)?.instance?.model_id || instance_id,
        model: model,
      },
    });
    // Preserve original error message if available
    const errorMessage = error?.message
      ? `Failed to handle invoice rejection: ${error.message}`
      : 'Failed to handle invoice rejection';
    throw new Error(errorMessage);
  }
};


/**
 * Send workflow notification emails
 * This function is called from workflow side effects to send emails when actions are performed
 * @param context WorkflowContext or AuthContext
 * @param model Model name (purchase_requisition, purchase_order, invoice)
 * @param instance_id Instance ID
 * @param change_set Change set (not used for emails)
 * @param select_set Select set (not used for emails)
 * @param tx Transaction client
 */
export const send_workflow_notification_email = async (
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
    const authContext = workflowContext ? workflowContext.authContext : (context as AuthContext);
    const modelId = workflowContext ? workflowContext.instance.model_id : instance_id;
    if (!authContext) {
      throw new Error('AuthContext is required but not provided');
    }
    if (!tx) {
      throw new Error('Transaction client is required but not provided');
    }
    // Get workflow instance details
    const workflowInstance = workflowContext
      ? workflowContext.instance
      : await tx.workflow_instance.findFirst({
        where: {
          model_id: modelId,
          flow: {
            model_name: model
          }
        },
        include: {
          flow: {
            select: {
              id: true,
              name: true,
              model_name: true
            }
          },
          history: {
            orderBy: { performed_at: 'desc' },
            take: 1,
            include: {
              action: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              },
              performed_by_user: {
                select: {
                  id: true,
                  email: true,
                  name: true
                }
              }
            }
          }
        }
      });
    if (!workflowInstance) {
      logger.warn('Workflow instance not found for email notification', { model, instance_id: modelId });
      return;
    }
    // Get the latest action history
    const latestHistory = Array.isArray(workflowInstance.history) && workflowInstance.history.length > 0
      ? workflowInstance.history[0]
      : await tx.workflow_history.findFirst({
        where: { instance_id: workflowInstance.id },
        orderBy: { performed_at: 'desc' },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          performed_by_user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });
    if (!latestHistory || !latestHistory.action) {
      logger.warn('No action history found for email notification', { instanceId: workflowInstance.id });
      return;
    }
    const actionName = latestHistory.action.name;
    const currentState = workflowInstance?.current_state;
    const performedByUser = latestHistory?.performed_by_user;
    // Use performed_by_user if available, otherwise fall back to performed_by_name/performed_by_email from history
    const performedByName = performedByUser?.name || latestHistory.performed_by_name || null;
    const performedByEmail = performedByUser?.email || latestHistory.performed_by_email || null;
    // Get model type display name
    const typeDisplayName = model
      .replace('_', ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    // Prepare type object for template
    const typeObject = {
      display_name: typeDisplayName
    };
    // Get state_id from workflow instance
    // Prepare action_history object for template
    const actionHistory = {
      action_name: actionName,
      modifiedUser: performedByUser ? {
        name: performedByName,
        email: performedByEmail
      } : null,
      performed_by: performedByName
    };
    // Get created user details
    const createdUserId = workflowInstance.created_by;
    let createdUser = null;
    if (createdUserId) {
      createdUser = await tx.user.findUnique({
        where: { id: createdUserId },
        select: {
          id: true,
          email: true,
          name: true
        }
      });
    }
    // Get assigned user details
    const assignedUserId = workflowInstance.assigned_user_id;
    let assignedUser = null;
    if (assignedUserId) {
      assignedUser = await tx.user.findUnique({
        where: { id: assignedUserId },
        select: {
          id: true,
          email: true,
          name: true
        }
      });
    }
    const emailPromises = [];
    // Send email to creator if they exist and have an email
    if (createdUser && createdUser.email) {
      const creatorTemplate = generateWorkflowEmailTemplate(
        assignedUser,
        createdUser,
        typeObject,
        modelId,
        currentState,
        'creator',
        actionHistory,
        model
      );
      emailPromises.push(
        sendEmail({
          to: [createdUser.email],
          subject: `Your ${typeDisplayName} Request Has Been ${getActionSuffix(actionName)}`,
          text: `Your ${typeDisplayName} (ID: ${modelId}) has been ${getActionSuffix(actionName)}. Current Status: ${currentState}.`,
          html: creatorTemplate,
        }).catch((error: any) => {
          logger.error("Error sending email to creator", {
            error: error?.message || 'Unknown error',
            email: createdUser.email,
            instanceId: modelId
          });
          return { error: true, message: "Failed to send email to creator" };
        })
      );
    }
    // Send email to assigned user if they exist, have an email, and action is required
    // Only send if the assigned user is different from the creator
    if (assignedUser && assignedUser.email && assignedUser.id !== createdUserId) {
      const assignedTemplate = generateWorkflowEmailTemplate(
        assignedUser,
        createdUser,
        typeObject,
        modelId,
        currentState,
        'assigned',
        actionHistory,
        model
      );
      emailPromises.push(
        sendEmail({
          to: [assignedUser.email],
          subject: `Action Required: Review ${typeDisplayName} ${getActionSuffix(actionName)} by ${performedByName || 'User'}`,
          text: `Action Required: You have been assigned to review a ${typeDisplayName} (ID: ${modelId}). Action: ${actionName}. Current Status: ${currentState}.`,
          html: assignedTemplate,
        }).catch((error: any) => {
          logger.error("Error sending email to assigned user", {
            error: error?.message || 'Unknown error',
            email: assignedUser.email,
            instanceId: modelId
          });
          return { error: true, message: "Failed to send email to assigned user" };
        })
      );
    }
    // Execute all email sends in parallel
    const results = await Promise.all(emailPromises);
    logger.info('Workflow notification emails processed', {
      instanceId: modelId,
      model,
      actionName,
      emailsSent: results.filter(r => r && !('error' in r && r.error)).length,
      emailsFailed: results.filter(r => r && 'error' in r && r.error).length
    });

    return {
      message: "Workflow notifications processed",
      results: results,
      action_history: {
        action_name: actionName,
        performed_by: performedByName
      }
    };
  } catch (error: any) {
    logger.error("Error in send_workflow_notification_email", {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      model,
      instance_id: (context as any)?.instance?.model_id || instance_id
    });
    return {
      message: "Failed to send workflow notification emails",
      error: error?.message || 'Unknown error'
    };
  }
};