import Master from "@/pages/Master";

function splitAccountTypes(formattedData: any) {
  if (!formattedData?.data || !Array.isArray(formattedData.data)) return formattedData;
  formattedData.data = formattedData.data.map((record: Record<string, unknown>) => {
    const transformed = { ...record };
    for (const key of Object.keys(transformed)) {
      if (key !== "account_types" && key.toLowerCase() !== "type") continue;
      const fieldValue = transformed[key];
      let values: string[] = [];
      if (Array.isArray(fieldValue)) {
        values = fieldValue.map((value) => String(value).trim()).filter(Boolean);
      } else if (typeof fieldValue === "string" && fieldValue.trim()) {
        values = fieldValue.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      }
      delete transformed[key];
      transformed.account_types = values;
    }
    return transformed;
  });
  return formattedData;
}

export default function AccountList() {
  return (
    <Master
      type="account"
      view="account_view"
      displayName="Chart of Accounts"
      duplicateActionConfig={{
        enabled: true,
        queryParam: "duplicateOf",
        openInNewTab: true,
      }}
      listConfig={{
        importConfig: {
          updateCSVData: splitAccountTypes,
        },
      }}
    />
  );
}
