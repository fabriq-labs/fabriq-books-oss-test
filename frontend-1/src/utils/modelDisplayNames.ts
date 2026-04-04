/**
 * Gets a human-readable model display name from the model name
 */
export const getModelDisplayName = (modelName: string): string => {
    const modelNames: Record<string, string> = {
        'purchase_requisition': 'Purchase Requisition',
        'purchase_order': 'Purchase Order',
        'invoice': 'Invoice',
        'organization': 'Organization',
        'item_master': 'Item Master',
        'item_category': 'Item Category',
        'supplier': 'Supplier',
        'supplier_items': 'Supplier Items',
        'location': 'Location',
        'business_unit': 'Business Unit',
        'department': 'Department',
        'project_master': 'Project Master',
        'user': 'User',
        'user_master': 'User Master',
        'employee_master': 'Employee Master',
        'user_roles': 'User Roles',
        'cost_center': 'Cost Center',
        'account': 'Account',
        'general_ledger': 'General Ledger',
        'budget_period': 'Budget Period',
        'budget_line': 'Budget Line',
        'uom': 'Unit of Measure',
        'payment_terms': 'Payment Terms',
        'shipping_terms': 'Shipping Terms',
        'shipping_method': 'Shipping Method',
        'currency_master': 'Currency Master',
        'currency': 'Currency'
    };

    return modelNames[modelName] || modelName;
};

/**
 * Gets the view name for a model
 */
export const getViewName = (modelName: string): string => {
    if (modelName === 'purchase_requisition') {
        return 'view_1';
    }
    return modelName + '_view';
};

