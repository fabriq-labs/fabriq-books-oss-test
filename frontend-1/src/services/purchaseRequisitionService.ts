
import { supabase } from "@/integrations/supabase/client";
import type { PurchaseRequisition, PurchaseLineItem } from "@/models/PurchaseRequisition";
import { Database } from "@/integrations/supabase/types";

/**
 * Create a new purchase requisition with line items
 */
export async function createPurchaseRequisition(
  requisitionData: Omit<PurchaseRequisition, 'id' | 'created_at' | 'updated_at'>,
  lineItems: Omit<PurchaseLineItem, 'id' | 'pr_id' | 'created_at' | 'updated_at'>[]
) {
  try {
    console.log("Creating requisition with data:", requisitionData);
    console.log("Line items:", lineItems);

    // Ensure the status is one of the allowed values
    const validStatus = [
      'Draft',
      'Department Approval',
      'Finance Approval',
      'Procurement Approval',
      'Approved',
      'Pending Completion',
      'Completed',
      'Rejected'
    ].includes(requisitionData.pr_status);

    if (!validStatus) {
      console.error(`Invalid status value: ${requisitionData.pr_status}`);
      return { success: false, error: new Error('Invalid status value') };
    }

    // Insert the purchase requisition
    const { data: requisition, error: requisitionError } = await supabase
      .from('purchase_requisitions')
      .insert({
        pr_number: requisitionData.pr_number,
        pr_date: new Date(requisitionData.pr_date).toISOString(),
        requester: requisitionData.requester,
        requester_department: requisitionData.requester_department,
        on_behalf_of: requisitionData.on_behalf_of,
        on_behalf_of_user: requisitionData.on_behalf_of_user,
        on_behalf_of_department: requisitionData.on_behalf_of_department,
        purchase_reason: requisitionData.purchase_reason,
        delivery_location: requisitionData.delivery_location,
        deliver_to: requisitionData.deliver_to,
        legal_entity: requisitionData.legal_entity,
        is_budgeted: requisitionData.is_budgeted,
        budget_level: requisitionData.budget_level,
        cost_center: requisitionData.cost_center,
        budget_period: requisitionData.budget_period,
        budget_line: requisitionData.budget_line,
        is_for_project: requisitionData.is_for_project,
        project_name: requisitionData.project_name,
        purchase_total: requisitionData.purchase_total,
        pr_status: requisitionData.pr_status,
        attachments: requisitionData.attachments
      })
      .select('id')
      .single();

    if (requisitionError) {
      console.error("Error creating requisition:", requisitionError);
      throw requisitionError;
    }

    // Prepare line items with the requisition ID
    const lineItemsWithPrId = lineItems.map(item => ({
      pr_id: requisition?.id,
      item_code: item.item_code,
      item_image: item.item_image,
      item_description: item.item_description,
      quantity: item.quantity,
      rate: item.rate,
      item_total: item.item_total,
      cost_center: item.cost_center
    }));

    // Insert line items
    if (lineItemsWithPrId.length > 0 && requisition) {
      const { error: lineItemsError } = await supabase
        .from('purchase_line_items')
        .insert(lineItemsWithPrId);

      if (lineItemsError) {
        console.error("Error inserting line items:", lineItemsError);
        throw lineItemsError;
      }
    }

    console.log("Successfully created requisition with ID:", requisition?.id);
    return { id: requisition?.id, success: true };
  } catch (error) {
    console.error("Error creating purchase requisition:", error);
    return { success: false, error };
  }
}

/**
 * Get all purchase requisitions
 */
export async function getPurchaseRequisitions() {
  try {
    const { data, error } = await supabase
      .from('purchase_requisitions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Convert string dates to Date objects to match the PurchaseRequisition type
    const formattedData = data.map(item => ({
      ...item,
      pr_date: new Date(item.pr_date),
      created_at: new Date(item.created_at),
      updated_at: new Date(item.updated_at)
    })) as PurchaseRequisition[];

    return { data: formattedData, success: true };
  } catch (error) {
    console.error("Error fetching purchase requisitions:", error);
    return { success: false, error };
  }
}

/**
 * Get a purchase requisition by ID with its line items
 */
export async function getPurchaseRequisitionById(id: string) {
  try {
    // Get the purchase requisition
    const { data: requisition, error: requisitionError } = await supabase
      .from('purchase_requisitions')
      .select('*')
      .eq('id', id)
      .single();

    if (requisitionError) {
      throw requisitionError;
    }

    // Get the line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('purchase_line_items')
      .select('*')
      .eq('pr_id', id)
      .order('created_at', { ascending: true });

    if (lineItemsError) {
      throw lineItemsError;
    }

    // Convert string dates to Date objects
    const formattedRequisition = {
      ...requisition,
      pr_date: new Date(requisition.pr_date),
      created_at: new Date(requisition.created_at),
      updated_at: new Date(requisition.updated_at)
    } as PurchaseRequisition;

    return { requisition: formattedRequisition, lineItems, success: true };
  } catch (error) {
    console.error("Error fetching purchase requisition by ID:", error);
    return { success: false, error };
  }
}

/**
 * Update a purchase requisition's status
 */
export async function updatePurchaseRequisitionStatus(
  id: string,
  status: string
) {
  try {
    console.log(`Updating requisition status: ID=${id}, new status=${status}`);

    // Ensure the status is one of the allowed values
    const validStatus = [
      'Draft',
      'Department Approval',
      'Finance Approval',
      'Procurement Approval',
      'Approved',
      'Pending Completion',
      'Completed',
      'Rejected'
    ].includes(status);

    if (!validStatus) {
      console.error(`Invalid status value: ${status}`);
      return { success: false, error: new Error('Invalid status value') };
    }

    const { data, error } = await supabase
      .from('purchase_requisitions')
      .update({ pr_status: status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Error updating status:", error);
      throw error;
    }

    console.log("Successfully updated status:", data);
    return { data, success: true };
  } catch (error) {
    console.error("Error updating purchase requisition status:", error);
    return { success: false, error };
  }
}

/**
 * Delete a purchase requisition and its associated line items
 */
export async function deletePurchaseRequisition(id: string) {
  try {
    console.log(`Deleting requisition with ID: ${id}`);

    // Supabase will automatically delete the line items due to ON DELETE CASCADE
    const { error } = await supabase
      .from('purchase_requisitions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting requisition:", error);
      throw error;
    }

    console.log("Successfully deleted requisition and its line items");
    return { success: true };
  } catch (error) {
    console.error("Error deleting purchase requisition:", error);
    return { success: false, error };
  }
}
