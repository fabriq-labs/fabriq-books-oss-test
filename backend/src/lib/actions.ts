import { AuthContext } from "../auth/types";
import logger from "../utils/logger";
import { calculate_invoice_total, calculate_pr_total, generate_po_from_pr, generate_invoice_from_po, calculate_po_total, calculate_payment_total, calculate_sales_order_total, handle_invoice_reject, send_workflow_notification_email } from './actions/zeiv'
import { generate_invoice_from_so, create_sales_invoice_posting, reverse_sales_invoice_postings } from './actions/sales'
import { calculate_delivery_challan_total, calculate_credit_note_total, calculate_quote_total } from './actions/sales'
import { sync_purchase_order } from './actions/purchase_order'

export type GenericFunction = (context: AuthContext, model: string, instance_id: string, change_set: string[], select_set: any, tx: any, created?: any) => any;

export interface Dependency {
    fields: string[];
    method: GenericFunction
}




export const execute_Action = async (context: AuthContext, action: string, model: string, instance_id: string, change_set: string[], select_set: any, tx: any, created?: any) => {
    logger.debug('Executing action', action, model, instance_id, change_set, !select_set ? 'no select' : 'select');
    if (action === 'UPDATE' && functionMap[model] && change_set.some(field => functionMap[model].fields.includes(field))) {
        // Call once (no parallel races), return [result] — original DAL contract is action_result[0]
        const result = await functionMap[model].method(context, model, instance_id, change_set, select_set, tx);
        return [result];
    }
    else if ((action === 'DELETE' || action === 'ADD') && functionMap[model]) {
        const result = await functionMap[model].method(context, model, instance_id, change_set, select_set, tx, created);
        return [result];
    }
}


export const workflowActionMap: Record<string, any> = {
    generate_po_from_pr: generate_po_from_pr,
    generate_invoice_from_po: generate_invoice_from_po,
    generate_invoice_from_so: generate_invoice_from_so,
    calculate_invoice_total: calculate_invoice_total,
    calculate_pr_total: calculate_pr_total,
    calculate_po_total: calculate_po_total,
    calculate_payment_total: calculate_payment_total,
    calculate_sales_order_total: calculate_sales_order_total,
    handle_invoice_reject: handle_invoice_reject,
    create_sales_invoice_posting: create_sales_invoice_posting,
    reverse_sales_invoice_postings: reverse_sales_invoice_postings,
    calculate_delivery_challan_total: calculate_delivery_challan_total,
    calculate_credit_note_total: calculate_credit_note_total,
    calculate_quote_total: calculate_quote_total,
    send_workflow_notification_email: send_workflow_notification_email,
    sync_po_to_erp: sync_purchase_order
}

export const functionMap: Record<string, Dependency> = {

    "purchase_requisition": {
        fields: ["purchase_reason"],
        method: calculate_pr_total
    },
    "purchase_requisition.items": {
        fields: ["quantity", "rate"],
        method: calculate_pr_total
    },
    // Invoice totals: fire on field save (ADD/UPDATE/DELETE of lines, or header deps).
    // Submit may re-run via workflow side_effect; totals must not depend on Submit alone.
    // Header: only adjustable_value affects the formula today (+ purchase_order_id for PO qty side effects).
    "invoice": {
        fields: ["purchase_order_id", "adjustable_value"],
        method: calculate_invoice_total
    },
    "invoice.invoice_line_item": {
        fields: ["invoice_qty", "rate", "tax_rate", "discount_rate", "tax_group_id"],
        method: calculate_invoice_total
    },
    "purchase_order.purchase_order_item": {
        fields: ["quantity", "rate"],
        method: calculate_po_total
    },
    "invoice.payment_receipt": {
        fields: ["amount", "invoice_id"],
        method: calculate_payment_total
    },
    "sales_order.sales_order_items": {
        fields: ["quantity", "rate", "discount_rate", "tax_rate"],
        method: calculate_sales_order_total
    },
    "delivery_challan.delivery_challan_items": {
        fields: ["quantity_delivered", "rate", "tax_rate", "discount_rate"],
        method: calculate_delivery_challan_total
    },
    "credit_note.credit_note_item": {
        fields: ["quantity", "rate", "tax_rate", "discount_rate"],
        method: calculate_credit_note_total
    },

    "quote.quote_items": {
        fields: ["quantity", "rate", "tax_rate", "discount_rate"],
        method: calculate_quote_total
    },
    "quote": {
        fields: ["adjustable_value"],
        method: calculate_quote_total
    },
    "credit_note": {
        fields: ["adjustable_value"],
        method: calculate_credit_note_total
    },
    "sales_order": {
        fields: ["adjustable_value"],
        method: calculate_sales_order_total
    },
    "delivery_challan": {
        fields: ["adjustable_value"],
        method: calculate_delivery_challan_total
    }
};

export const customActionMap: Record<string, Record<string, any>> = {
    purchase_order: {
        generate_invoice: generate_invoice_from_po,
        // Add more actions here as needed
    },
    // Add more models here as needed

};



export async function executeCustomAction(
    context: AuthContext,
    model: string,
    id: string,
    action: string,
    attributes: any,
    options: any,
    tx: any,
    created?: any
) {
    if (customActionMap[model] && customActionMap[model][action]) {
        return await customActionMap[model][action](context, id, attributes, options, tx);
    }
    throw new Error(`Unknown custom action: ${model}.${action}`);
}