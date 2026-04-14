import { viewAPI } from "@/api/api";


export const filterUniqueRecords = async (dataset: any, key: string) => {
  return new Promise((resolve) => {
    const seen = new Set();
    const uniqueRecords = [];
    for (const record of dataset) {
      if (!seen.has(record[key])) {
        seen.add(record[key]);
        uniqueRecords.push(record[key]);
      }
    }
    resolve(uniqueRecords);
  });
};
export const buildDataWithLookupFields = async (dataset: any, lookupData: any, filedSets: any) => {
  return new Promise((resolve) => {
    const normalizeLookupValue = (value: any) =>
      value === null || value === undefined
        ? ""
        : String(value).trim().toLowerCase();
    const lookupMap = lookupData.reduce((acc: { [key: string]: any }, data: { key: string; csvKey: string; lookupData: any[] }) => {
      const targetField = data.key;
      const sourceField = data.csvKey;
      acc[sourceField] = data.lookupData.reduce((innerAcc: { [key: string]: any }, item: any) => {
        const selectProps = filedSets[targetField]?.tableProps?.selectProps || {};
        const instanceLabel = selectProps?.instanceLabel || selectProps?.searchParams;
        const instanceKey = selectProps?.instanceKey || "id";
        const lookupValue = normalizeLookupValue(item?.[instanceLabel]);
        if (lookupValue) {
          innerAcc[lookupValue] = item?.[instanceKey] ?? null;
        }
        return innerAcc;
      }, {});
      return acc;
    }, {});
    const transformedArray = dataset.map((row: any) => {
      const updatedRow = { ...row };
      lookupData.forEach((mapping: { csvKey: string }) => {
        const sourceField = mapping.csvKey;
        const currentValue = row[sourceField];
        const lookupValue = currentValue?.isNotAvailable ? currentValue.oldValue : currentValue;
        updatedRow[sourceField] = lookupMap[sourceField]?.[normalizeLookupValue(lookupValue)] || null;
      });
      return updatedRow;
    });
    resolve(transformedArray);
  });
};

export const fetchColumns = async (
  selectedValues?: any,
  setColumnsData?: any,
  fieldSet?: any
) => {
  const filterSet = Object.fromEntries(
    Object.entries(fieldSet).filter(([key]) => {
      return selectedValues.includes(key);
    })
  );
  const columns = await buildColumn(filterSet);
  setColumnsData(columns);
};


const buildColumn = async (fieldSet: any) => {
  const entries = Object.entries(fieldSet).filter(
    ([, value]: any) => value.isColumnShow
  );

  const columns = await Promise.all(
    entries.map(async ([key, value]: any) => ({
      title: value.displayName,
      dataIndex: key,
      key: key,
      columnType: value.tableProps?.columnType || value.datatype,
      permission: value?.permission || "read",
      tableProps: await buildProps(value.tableProps),
    }))
  );

  return columns;
};

const buildProps = async (tableProps: any) => {
  const { columnType } = tableProps;
  if (columnType === "select") {
    return {
      ...tableProps,
      defaultValue: await retrieveDropdownList(tableProps?.selectProps),
    };
  }
  return tableProps;
};

const retrieveDropdownList = async (params: any) => {
  const res = await viewAPI.getAll(
    params?.instanceType,
    `${params?.instanceType}_view`,
    1,
    params?.limit,
    "",
    params?.searchParams
  );
  return res;
};