import { ToWords } from 'to-words';

/**
 * Utility functions for handling various UI operations
 * 
 * This file contains utility functions for:
 * - Loading state management (addLoaderBasedOnID)
 * - Object construction from field data (constructObject)
 * - Tool response handling and navigation (handleToolResponse)
 * 
 * Tool Response Handling:
 * The handleToolResponse function automatically handles tool responses from AI chat
 * and redirects users to appropriate pages when records are created or updated.
 * 
 * Example usage:
 * ```typescript
 * import { handleToolResponse } from '@/components/utils/helper';
 * import { useNavigate } from 'react-router-dom';
 * 
 * const navigate = useNavigate();
 * 
 * // In your chat component's onFinish callback:
 * if (message.toolInvocations && Array.isArray(message.toolInvocations)) {
 *     handleToolResponse(message.toolInvocations, navigate);
 * }
 * ```
 * 
 * Supported tools:
 * - createRecord: Automatically redirects to the appropriate page based on the model:
 *   - purchase_requisition, invoice, purchase_order: Redirects to `/{model}/{id}/state/Draft`
 *   - Master pages (organization, item_master, supplier, etc.): Redirects to `/{model}/view/view_1`
 * - createChildItem: Creates a child item and stays on the same page (no redirect)
 * - updateChildItem: Updates a child item and stays on the same page (no redirect)
 * - updateRecord: Updates a record and stays on the same page (no redirect)
 * 
 * Future tools can be easily added by extending the handleToolResponse function.
 */

// Types for tool responses
export interface ToolAction {
    type: string;
    urlTemplate: string;
}

export interface ToolResult {
    tool: string;
    model: string;
    resultType: string;
    data: any;
    columns?: any[];
    actions?: ToolAction[];
    uiHint?: string;
    metaData?: any;
}

export interface ToolInvocation {
    state: string;
    step?: number;
    toolCallId?: string;
    toolName: string;
    args?: any;
    result?: ToolResult;
}

export const addLoaderBasedOnID = (data: any[], id: any, isloader: Boolean = false) => {
    const filterAction: any = data.map((item: any) => {
        if (item.id == id) {
            return { ...item, loader: isloader }
        }
        return item
    })
    return filterAction
}
export const constructObject = (data: any, fieldsData: any = []) => {
    return fieldsData.reduce((result: any, field: any) => {
        const value = data?.[field.lookup_field_name];
        if (value !== undefined) {
            result[field.field_name] = value;
        }
        return result;
    }, {});
}

/**
 * Handles tool responses and redirects when tools like createRecord are used
 * @param toolInvocations - Array of tool invocations from the chat response
 * @param navigate - React Router's navigate function
 */
export const handleToolResponse = (toolInvocations: any[], navigate: (path: string) => void) => {
    if (!Array.isArray(toolInvocations)) {
        console.warn('handleToolResponse: toolInvocations is not an array', toolInvocations);
        return;
    }

    if (typeof navigate !== 'function') {
        console.error('handleToolResponse: navigate is not a function', navigate);
        return;
    }

    toolInvocations.forEach((tool: any) => {
        try {
            // Validate tool structure
            if (!tool || typeof tool !== 'object') {
                console.warn('handleToolResponse: invalid tool structure', tool);
                return;
            }

            // Handle createRecord tool
            if (tool.toolName === 'createRecord' && tool.state === 'result' && tool.result) {
                handleCreateRecordResponse(tool.result, navigate);
            }
            // Handle createChildItem tool
            else if (tool.toolName === 'createChildItem' && tool.state === 'result' && tool.result) {
                handleCreateChildItemResponse(tool.result);
            }
            // Handle updateChildItem tool
            else if (tool.toolName === 'updateChildItem' && tool.state === 'result' && tool.result) {
                handleUpdateChildItemResponse(tool.result);
            }
            // Handle updateRecord tool
            else if (tool.toolName === 'updateRecord' && tool.state === 'result' && tool.result) {
                handleUpdateRecordResponse(tool.result);
            }
        } catch (error) {
            console.error('Error handling tool response:', error, tool);
        }
    });
};

/**
 * Handles createRecord tool response and redirects to the appropriate page
 * @param result - The result object from the createRecord tool
 * @param navigate - React Router's navigate function
 */
const handleCreateRecordResponse = (result: ToolResult, navigate: (path: string) => void) => {
    console.log('Handling createRecord response:', result);

    // Validate result structure
    if (!result || typeof result !== 'object') {
        console.warn('handleCreateRecordResponse: invalid result structure', result);
        return;
    }

    // Extract the ID from the result data
    const recordId = result.data?.id;

    if (!recordId || typeof recordId !== 'string') {
        console.warn('createRecord response missing valid record ID:', result);
        return;
    }

    // Map model names to route paths (list/detail pages)
    const modelRouteMap: Record<string, { path: string; draftStateId: string }> = {
        'purchase_requisition': { path: 'purchases/requisitions', draftStateId: '2' },
        'purchase_order': { path: 'purchases/orders', draftStateId: '13' },
        'invoice': { path: 'purchases/bills', draftStateId: '9' },
    };

    const routeConfig = modelRouteMap[result.model];
    if (routeConfig) {
        const redirectUrl = `/${routeConfig.path}/${recordId}/state/${routeConfig.draftStateId}`;
        console.log(`Redirecting ${result.model} to:`, redirectUrl);
        navigate(redirectUrl);
        return;
    }

    // For master pages, use the view-based routing pattern
    // Use the pattern: model/view/:viewId
    const redirectUrl = `/${result.model}/view/${result.model}_view`;
    console.log(`Redirecting ${result.model} to:`, redirectUrl);
    navigate(redirectUrl);
};

/**
 * Handles createChildItem tool response - stays on the same page (no redirect)
 * @param result - The result object from the createChildItem tool
 */
const handleCreateChildItemResponse = (result: ToolResult) => {
    console.log('Handling createChildItem response:', result);

    // Validate result structure
    if (!result || typeof result !== 'object') {
        console.warn('handleCreateChildItemResponse: invalid result structure', result);
        return;
    }

    // Extract the ID from the result data
    const recordId = result.data?.id;

    if (!recordId || typeof recordId !== 'string') {
        console.warn('createChildItem response missing valid record ID:', result);
        return;
    }

    // Log success but don't redirect - stay on the same page
    console.log(`Child item created successfully for ${result.model} with ID: ${recordId}`);
    console.log('Staying on the same page as requested for createChildItem tool');
};

/**
 * Handles updateChildItem tool response - stays on the same page (no redirect)
 * @param result - The result object from the updateChildItem tool
 */
const handleUpdateChildItemResponse = (result: ToolResult) => {
    console.log('Handling updateChildItem response:', result);

    // Validate result structure
    if (!result || typeof result !== 'object') {
        console.warn('handleUpdateChildItemResponse: invalid result structure', result);
        return;
    }

    // Extract the ID from the result data
    const recordId = result.data?.id;

    if (!recordId || typeof recordId !== 'string') {
        console.warn('updateChildItem response missing valid record ID:', result);
        return;
    }

    // Log success but don't redirect - stay on the same page
    console.log(`Child item updated successfully for ${result.model} with ID: ${recordId}`);
    console.log('Staying on the same page as requested for updateChildItem tool');
};

/**
 * Handles updateRecord tool response - stays on the same page (no redirect)
 * @param result - The result object from the updateRecord tool
 */
const handleUpdateRecordResponse = (result: ToolResult) => {
    console.log('Handling updateRecord response:', result);

    // Validate result structure
    if (!result || typeof result !== 'object') {
        console.warn('handleUpdateRecordResponse: invalid result structure', result);
        return;
    }

    // Extract the ID from the result data
    const recordId = result.data?.id;

    if (!recordId || typeof recordId !== 'string') {
        console.warn('updateRecord response missing valid record ID:', result);
        return;
    }

    // Log success but don't redirect - stay on the same page
    console.log(`Record updated successfully for ${result.model} with ID: ${recordId}`);
    console.log('Staying on the same page as requested for updateRecord tool');
};

export const formatUSD = (amount:Number) => {
    return amount?.toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });
  };

const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-US',
};

const CURRENCY_OPTIONS: Record<string, { name: string; plural: string; fractionalName: string; fractionalPlural: string }> = {
  INR: { name: 'Rupee', plural: 'Rupees', fractionalName: 'Paisa', fractionalPlural: 'Paise' },
  USD: { name: 'Dollar', plural: 'Dollars', fractionalName: 'Cent', fractionalPlural: 'Cents' },
  GBP: { name: 'Pound', plural: 'Pounds', fractionalName: 'Penny', fractionalPlural: 'Pence' },
  EUR: { name: 'Euro', plural: 'Euros', fractionalName: 'Cent', fractionalPlural: 'Cents' },
};

/**
 * Converts a numeric amount to words using the `to-words` library.
 * Supports Indian (Lakh/Crore) and Western numbering based on currency.
 */
export const convertToWords = (num: number, currencyCode: string = 'INR'): string => {
  const code = currencyCode.toUpperCase();
  const locale = CURRENCY_LOCALE[code] || 'en-US';
  const curr = CURRENCY_OPTIONS[code] || CURRENCY_OPTIONS['USD'];

  const toWords = new ToWords({
    localeCode: locale,
    converterOptions: {
      currency: true,
      ignoreDecimal: false,
      ignoreZeroCurrency: false,
      doNotAddOnly: true,
      currencyOptions: {
        name: curr.name,
        plural: curr.plural,
        symbol: '',
        fractionalUnit: { name: curr.fractionalName, plural: curr.fractionalPlural, symbol: '' },
      },
    },
  });

  return toWords.convert(num);
};