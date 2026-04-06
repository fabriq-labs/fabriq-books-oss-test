/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import React from 'react';

interface ToolData {
    toolName: string;
    state: string;
    result?: any;
}

/**
 * Custom hook to handle form tool responses and update details when createRecord or createChildItem is received
 * 
 * @param latestFormToolResponse - The latest form tool response from ToolContext
 * @param setDetails - State setter function to update form details
 * 
 * @example
 * ```tsx
 * const { latestFormToolResponse } = useTool();
 * const [details, setDetails] = useState({});
 * 
 * useFormToolResponse(latestFormToolResponse, setDetails);
 * ```
 */
export const useFormToolResponse = (
    latestFormToolResponse: ToolData | null,
    setDetails: React.Dispatch<React.SetStateAction<any>>
) => {
    useEffect(() => {
        if (!latestFormToolResponse) {
            return;
        }

        // Handle createRecord and createChildItem - update details with the response data
        if (
            (latestFormToolResponse.toolName === 'createRecord' ||
                latestFormToolResponse.toolName === 'createChildItem') &&
            latestFormToolResponse.state === 'result' &&
            latestFormToolResponse.result?.data
        ) {
            const responseData = latestFormToolResponse.result.data;
            setDetails(responseData);
        }

    }, [latestFormToolResponse, setDetails]);
};

