import React, { useMemo } from "react";
import Master from "./Master";
import { useEntity } from "@/contexts/EntityContext";

const InvoiceList: React.FC = () => {
    const { currentEntityId } = useEntity();

    const defaultFilters = useMemo(
        () => (currentEntityId ? { legal_entity_id: currentEntityId } : {}),
        [currentEntityId]
    );

    return (
        <Master
            key={currentEntityId ?? "all"}
            type="invoice"
            view="invoice_view"
            displayName="Invoices"
            supportPath="sales"
            duplicateActionConfig={{
                enabled: true,
                queryParam: "duplicateOf",
                openInNewTab: true,
            }}
            defaultFilters={defaultFilters}
        />
    );
};

export default InvoiceList;
