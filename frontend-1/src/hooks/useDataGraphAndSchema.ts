import { useEffect, useState } from 'react';
import * as z from 'zod';
import { fetchDataGraph, buildSchemaFromDataGraph, DataGraphResponse, DataGraphFieldConfig } from '@/utils/formUtils';

interface UseDataGraphAndSchemaResult {
    dataGraph: Record<string, DataGraphFieldConfig> | null;
    schema: z.ZodObject<any>;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Custom hook to fetch data graph and build schema for a given model and view
 * 
 * This hook handles:
 * - Fetching the data graph from the API
 * - Building the Zod schema from the data graph
 * - Managing loading and error states
 * 
 * @param model - The model name (e.g., 'item_master', 'supplier')
 * @param view - The view name (e.g., 'item_masterFullAccess', 'item_master_view')
 * @param setExternalLoading - Optional callback to set loading state in the component
 * @returns Object containing dataGraph, schema, isLoading, and error
 * 
 * @example
 * ```typescript
 * const [isLoading, setIsLoading] = useState(false);
 * const { dataGraph, schema, isLoading: isLoadingDataGraph, error } = useDataGraphAndSchema('item_master', 'item_masterFullAccess', setIsLoading);
 * ```
 */
export const useDataGraphAndSchema = (
    model: string | null,
    view: string | null,
    setExternalLoading?: (loading: boolean) => void
): UseDataGraphAndSchemaResult => {
    const [dataGraph, setDataGraph] = useState<Record<string, DataGraphFieldConfig> | null>(null);
    const [schema, setSchema] = useState<z.ZodObject<any>>(z.object({}));
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // Skip if model or view is not provided
        if (!model || !view) {
            setIsLoading(false);
            setExternalLoading?.(false);
            return;
        }

        setIsLoading(true);
        setExternalLoading?.(true);
        setError(null);

        // Fetch data graph once and use it for both dataGraph state and schema building
        fetchDataGraph(model, view)
            .then((response: DataGraphResponse) => {
                const dataGraphObj = response.data.data_graph;
                setDataGraph(dataGraphObj);

                // Build schema from the fetched data graph
                const builtSchema = buildSchemaFromDataGraph(dataGraphObj);
                setSchema(builtSchema);
                setIsLoading(false);
                setExternalLoading?.(false);
            })
            .catch((err) => {
                console.error(`Error fetching data graph and building schema for ${model}/${view}:`, err);
                setError(err instanceof Error ? err : new Error('Unknown error'));
                setIsLoading(false);
                setExternalLoading?.(false);
            });
    }, [model, view, setExternalLoading]);

    return { dataGraph, schema, isLoading, error };
};

