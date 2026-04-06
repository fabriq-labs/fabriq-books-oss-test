import { Background } from "reactflow";
import { SearchDropDown } from "../search_dropdown/dropdown";
import { Input } from "../ui/input";
import { ModernDropDown } from "../search_dropdown/modern_dropdown";

interface FilterInputsProps {
    value: string;
    onChange: (value: string) => void;
    col: Record<string, any>;
    className?: string;
    setSelectFilterValues?: any;
    selectFilterValues?: any;
    operator?: string;
}

export function FilterInputs({ value, onChange, col, className, setSelectFilterValues, selectFilterValues, operator }: FilterInputsProps) {
    const { columnType, tableProps } = col;
    if (operator === 'is_null' || operator === 'is_not_null') {
        return null;
    }
    const handleSelectChange = (sourceKey: any, key: any, value: any) => {
        if (setSelectFilterValues) {
            setSelectFilterValues([...selectFilterValues, value]);
        }
        // Stop propagation to prevent dialog from closing
        onChange(value?.id);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Stop propagation to prevent dialog from closing
        e.stopPropagation();
        onChange(e.target.value);
    };

    const handleClear = (e: any) => {
        // Stop propagation to prevent dialog from closing
        if (e) e.stopPropagation();
        onChange('');
    };

    switch (tableProps?.columnType) {
        case "select":
            return (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-[200px]"
                >
                    <ModernDropDown
                        instanceType={tableProps.selectProps?.instanceType}
                        instanceSourceKey={tableProps.selectProps?.instanceSourceKey}
                        instanceKey={tableProps.selectProps?.instanceKey}
                        instanceLabel={tableProps.selectProps?.instanceLabel}
                        instanceValue={selectFilterValues?.find((item: any) => item[tableProps.selectProps?.instanceKey] === value) || null}
                        onSelectItem={handleSelectChange}
                        onClear={handleClear}
                        limit={tableProps.selectProps?.limit}
                        searchParams={tableProps.selectProps?.searchParams}
                        type={tableProps.selectProps?.type}
                        lookup_id_name={tableProps.selectProps?.lookup_id_name}
                        instanceSubLabel={tableProps.selectProps?.instanceSubLabel}
                        style={{
                            flex: 1,
                            backgroundColor: '#F1F0FB',
                            borderColor: '#E5DEFF'
                        }}
                    />
                </div>
            );
        case "text":
        default:
            return (
                <Input
                    className={className}
                    placeholder="Value"
                    value={value}
                    onChange={handleInputChange}
                    onClick={(e) => e.stopPropagation()}
                />
            );
    }
}
