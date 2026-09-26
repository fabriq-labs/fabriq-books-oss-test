import React, { useMemo } from "react";
import Master from "./Master";
import { useEntity } from "@/contexts/EntityContext";
import { SALES_INVOICE_TYPE } from "@/lib/bills/poMode";

const InvoiceList: React.FC = () => {
    const { currentEntityId } = useEntity();

    const defaultFilters = useMemo(
        () => ({
            ...(currentEntityId ? { legal_entity_id: currentEntityId } : {}),
            invoice_type: SALES_INVOICE_TYPE,
        }),
        [currentEntityId]
    );

    return (
        <Master
            key={currentEntityId ?? "all"}
            type="invoice"
            view="invoice_view"
            displayName="Invoices"
            supportPath="sales"
            createDefaults={{ invoice_type: SALES_INVOICE_TYPE }}
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
