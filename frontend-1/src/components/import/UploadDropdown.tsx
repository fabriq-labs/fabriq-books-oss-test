import { Layout, Select } from "antd";

export const UploadDropdown = ({ list, value, index, onChange }: any) => {
  const { Option } = Select;
  const safeList = Array.isArray(list) ? list : [];
  const normalizedValue = value === null || value === undefined ? 0 : value;

  return (
    <Layout>
      <div>
        <Select
          style={{ width: "100%" }}
          placeholder="Select a field"
          value={normalizedValue}
          allowClear
          onChange={(selectedValue) => onChange(selectedValue || 0, index)}
          notFoundContent="No fields available"
        >
          <Option value={0}>Select</Option>
          {safeList.map((item: any) => {
            // Handle both object format {key, displayName} and string format
            const itemKey = typeof item === 'string' ? item : item.key;
            const itemDisplayName = typeof item === 'string' ? item : item.displayName;
            return (
              <Option key={itemKey} value={itemKey}>
                {itemDisplayName}
              </Option>
            );
          })}
        </Select>
      </div>
    </Layout>
  );
};
