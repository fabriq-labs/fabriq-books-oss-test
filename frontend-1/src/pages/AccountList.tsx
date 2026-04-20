import React, { useMemo } from "react";
import Master from "./Master";
import { useEntity } from "@/contexts/EntityContext";

const AccountList: React.FC = () => {
    const { currentEntityId } = useEntity();

    const defaultFilters = useMemo(
      () => (currentEntityId ? { legal_entity_id: currentEntityId } : {}),
      [currentEntityId]
    );

    // Transform CSV data: convert 'type' field to array (split comma-separated values)
    const updateCSVData = (formattedData: any, relationId: any) => {
        if (formattedData.data && Array.isArray(formattedData.data)) {
            formattedData.data = formattedData.data.map((record: Record<string, unknown>) => {
                const transformed = { ...record };

                // Check all keys in the record for 'type' field (case-insensitive)
                Object.keys(transformed).forEach((key: string) => {
                    // Check if the key is 'type' (case-insensitive)
                    if (key.toLowerCase() === "type") {
                        const fieldValue = transformed[key];

                        if (fieldValue !== undefined && fieldValue !== null) {
                            if (!Array.isArray(fieldValue)) {
                                // If it's a string, split by comma
                                if (typeof fieldValue === "string") {
                                    const trimmedValue = fieldValue.trim();
                                    // If empty string, set to empty array
                                    if (trimmedValue === "") {
                                        transformed[key] = [];
                                    } else {
                                        // Split by comma and trim each value, filter out empty strings
                                        const splitValues = trimmedValue
                                            .split(",")
                                            .map((val: string) => val.trim())
                                            .filter((val: string) => val.length > 0);

                                        // Use the split array
                                        transformed[key] = splitValues;
                                    }
                                } else {
                                    // For non-string, non-array values, wrap in array
                                    transformed[key] = [fieldValue];
                                }
                            }
                            // If it's already an array, leave it as is
                        } else {
                            // If field is missing, set to empty array
                            transformed[key] = [];
                        }
                    }
                });

                return transformed;
            });
        }

        return formattedData;
    };

    return (
        <Master
            key={currentEntityId ?? 'all'}
            type="account"
            view="account_view"
            displayName="Chart of Accounts"
            defaultFilters={defaultFilters}
            listConfig={{
                importConfig: {
                    updateCSVData: updateCSVData,
                    relation: "entity",
                    relationView: "entity_view",
                    relationField: "organization_name",
                    relationFieldId: "legal_entity_id",
                },
            }}
        />
    );
};

export default AccountList;

