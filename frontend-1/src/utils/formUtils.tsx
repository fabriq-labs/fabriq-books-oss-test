import * as z from 'zod';
import React from 'react';
import { datagraphAPI } from '@/api/api';
import { FormLabel } from '@/components/ui/form';

/**
 * Data Graph API Response Types
 */
export interface DataGraphFieldConfig {
    datatype?: string;
    required?: boolean;
    permission?: string;
    displayName?: string;
    dataType?: string;
    type?: string;
    tableProps?: any;
    [key: string]: any;
}

export interface DataGraphResponse {
    success: boolean;
    data: {
        model_name: string;
        view_name: string;
        data_graph: Record<string, DataGraphFieldConfig>;
        description?: string;
    };
}

/**
 * Checks if a field is required based on the data graph
 * 
 * @param dataGraph - The data graph object from the API response
 * @param fieldName - The name of the field to check
 * @returns true if the field is required, false otherwise
 * 
 * @example
 * ```typescript
 * const isRequired = isFieldRequired(dataGraph.data.data_graph, 'item_name');
 * // Returns true if item_name has required: true in data graph
 * ```
 */
export const isFieldRequired = (
    dataGraph: Record<string, DataGraphFieldConfig> | null | undefined,
    fieldName: string
): boolean => {
    if (!dataGraph || !dataGraph[fieldName]) {
        return false;
    }
    return dataGraph[fieldName].required === true;
};

/**
 * Form label component that automatically shows a red asterisk (*) for required fields
 * based on the data graph configuration.
 * 
 * @param fieldName - The name of the field to check in the data graph
 * @param dataGraph - The data graph object from the API response
 * @param children - The label text to display
 * 
 * @example
 * ```typescript
 * <RequiredFormLabel fieldName="item_name" dataGraph={dataGraph}>
 *   Item Name
 * </RequiredFormLabel>
 * ```
 */
export const RequiredFormLabel: React.FC<{
    fieldName: string;
    dataGraph: Record<string, DataGraphFieldConfig> | null | undefined;
    children: React.ReactNode;
}> = ({ fieldName, dataGraph, children }) => {
    return (
        <FormLabel>
            {children} {isFieldRequired(dataGraph, fieldName) && <span className="text-red-500">*</span>}
        </FormLabel>
    );
};

/**
 * Internal helper function to build Zod schema from data graph object
 */
const buildSchemaFromDataGraphObject = (dataGraph: Record<string, DataGraphFieldConfig> | null | undefined): z.ZodObject<any> => {
    const schemaShape: Record<string, z.ZodTypeAny> = {};

    if (!dataGraph) {
        // Fallback to empty schema if no data graph
        return z.object({});
    }

    Object.keys(dataGraph).forEach((fieldName) => {
        const fieldConfig = dataGraph[fieldName];

        // Skip fields that are tables or relations (not form fields)
        if (fieldConfig.dataType === 'table' || fieldConfig.type === 'table') {
            return;
        }

        const isRequired = fieldConfig.required === true;
        const datatype = fieldConfig.datatype || 'string';
        const displayName = fieldConfig.displayName || fieldName;

        let fieldSchema: z.ZodTypeAny;

        // Build schema based on datatype
        switch (datatype) {
            case 'float':
            case 'number':
                fieldSchema = z.string().refine(
                    (value) => {
                        if (!value || value === '') return !isRequired;
                        return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
                    },
                    { message: `${displayName} must be a valid positive number` }
                );
                break;
            case 'integer':
            case 'int':
                fieldSchema = z.string().refine(
                    (value) => {
                        if (!value || value === '') return !isRequired;
                        return !isNaN(parseInt(value)) && parseInt(value) >= 0;
                    },
                    { message: `${displayName} must be a valid positive integer` }
                );
                break;
            case 'date':
                fieldSchema = z.string();
                break;
            case 'boolean':
                fieldSchema = z.string();
                break;
            default:
                // Default to string
                fieldSchema = z.string();
        }

        // Check if this is a foreign key field (select field)
        const isForeignKey = fieldConfig.tableProps?.columnType === 'select';

        // Add required validation if needed
        if (isRequired) {
            // Only add min validation for string types
            if (fieldSchema instanceof z.ZodString) {
                fieldSchema = fieldSchema.min(1, { message: `${displayName} is required` });
            } else {
                // For refined strings, add a refine check for required
                fieldSchema = fieldSchema.refine(
                    (value) => value !== '' && value !== null && value !== undefined,
                    { message: `${displayName} is required` }
                );
            }
        } else {
            // For optional fields: use nullish() for foreign keys (allows null for clearing), optional() for others
            if (isForeignKey) {
                // Foreign key fields can be null (when cleared) or undefined (when not set)
                fieldSchema = fieldSchema.nullish();
            } else {
                // Non-foreign key fields only need to be optional
                fieldSchema = fieldSchema.optional();
            }
        }

        schemaShape[fieldName] = fieldSchema;
    });

    return z.object(schemaShape);
};

/**
 * Helper function to build dynamic Zod schema from data graph
 * 
 * This function can be used in two ways:
 * 1. Pass model and view to fetch data graph and build schema automatically
 * 2. Pass the data graph object directly to build schema from existing data
 * 
 * Fields with `required: true` are marked as required, and fields with
 * `required: false` are optional.
 * 
 * @param modelOrDataGraph - The model name (e.g., 'item_master') OR the data graph object
 * @param view - The view name (e.g., 'item_master_view') - required if first param is model
 * @returns A Zod object schema with dynamic validation rules (or Promise if fetching)
 * 
 * @example
 * ```typescript
 * // Option 1: Fetch and build automatically
 * const schema = await buildSchemaFromDataGraph('item_master', 'item_masterFullAccess');
 * 
 * // Option 2: Build from existing data graph object
 * const dataGraph = {
 *   item_name: { required: true, displayName: "Item Name" },
 *   item_description: { required: true, displayName: "Item Description" },
 *   unit_price: { required: false, datatype: "float", displayName: "Unit Price" }
 * };
 * const schema = buildSchemaFromDataGraph(dataGraph);
 * ```
 */
export async function buildSchemaFromDataGraph(
    model: string,
    view: string
): Promise<z.ZodObject<any>>;
export function buildSchemaFromDataGraph(
    dataGraph: Record<string, DataGraphFieldConfig> | null | undefined
): z.ZodObject<any>;
export function buildSchemaFromDataGraph(
    modelOrDataGraph: string | Record<string, DataGraphFieldConfig> | null | undefined,
    view?: string
): z.ZodObject<any> | Promise<z.ZodObject<any>> {
    // If second parameter is provided, treat first as model and fetch data graph
    if (view !== undefined && typeof modelOrDataGraph === 'string') {
        return fetchDataGraph(modelOrDataGraph, view).then((response) => {
            return buildSchemaFromDataGraphObject(response.data.data_graph);
        });
    }

    // Otherwise, treat first parameter as data graph object
    return buildSchemaFromDataGraphObject(modelOrDataGraph as Record<string, DataGraphFieldConfig> | null | undefined);
}

/**
 * Fetches data graph for a given model and view
 * 
 * @param model - The model name (e.g., 'item_master', 'supplier')
 * @param view - The view name (e.g., 'item_master_view', 'item_masterFullAccess')
 * @returns Promise that resolves to the data graph response
 * 
 * @example
 * ```typescript
 * const dataGraph = await fetchDataGraph('item_master', 'item_masterFullAccess');
 * console.log(dataGraph.data.data_graph);
 * ```
 */
export const fetchDataGraph = async (model: string, view: string): Promise<DataGraphResponse> => {
    try {
        const response = await datagraphAPI.getDataGraph(model, view);
        return response as DataGraphResponse;
    } catch (error) {
        console.error(`Error fetching data graph for ${model}/${view}:`, error);
        throw error;
    }
};

/**
 * Hook-like function to get data graph with loading state
 * This can be used in components to fetch and manage data graph state
 * 
 * @param model - The model name
 * @param view - The view name (optional, defaults to model_view)
 * @returns Object with dataGraph, isLoading, and error states
 * 
 * @example
 * ```typescript
 * const { dataGraph, isLoading, error } = useDataGraph('item_master', 'item_masterFullAccess');
 * ```
 * 
 * Note: This is a utility function, not a React hook. For React hooks, use the
 * useDataGraph hook if available, or implement useEffect in your component.
 */
export const getDataGraphState = async (
    model: string,
    view?: string
): Promise<{
    dataGraph: DataGraphResponse | null;
    isLoading: boolean;
    error: Error | null;
}> => {
    const defaultView = view || `${model}_view`;
    let dataGraph: DataGraphResponse | null = null;
    let error: Error | null = null;
    let isLoading = true;

    try {
        dataGraph = await fetchDataGraph(model, defaultView);
        isLoading = false;
    } catch (err) {
        error = err instanceof Error ? err : new Error('Unknown error');
        isLoading = false;
    }

    return { dataGraph, isLoading, error };
};

