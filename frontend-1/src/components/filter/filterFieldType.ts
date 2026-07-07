/** Filter UI/input category derived from view metadata. */
export type FilterFieldType = "select" | "number" | "boolean" | "text";

const NUMBER_COLUMN_TYPES = new Set([
    "number",
    "numeric",
    "float",
    "int",
    "integer",
    "decimal",
    "currency",
]);

const NUMBER_DATATYPES = new Set([
    "number",
    "numeric",
    "float",
    "int",
    "integer",
    "decimal",
    "currency",
]);

/** String-like column types used across view JSON files (text, textarea, badge, etc.). */
const TEXT_COLUMN_TYPES = new Set([
    "text",
    "textarea",
    "badge",
    "string",
]);

/**
 * Resolve which operator set and input widget to use for a filterable column.
 *
 * View metadata patterns (all models):
 * - `tableProps.columnType: "select"` + `selectProps` → relation / FK pickers
 * - `columnType` / `datatype`: float, int, number, numeric, decimal, currency → numeric
 * - `columnType: "checkbox"` or `datatype: "boolean"` → boolean
 * - `columnType`: text, textarea, badge (or string datatype) → text
 *
 * Date/datetime columns are excluded from FilterModal; they use the date-range picker instead.
 */
export function resolveFilterFieldType(col: Record<string, any> | undefined): FilterFieldType {
    if (!col) return "text";

    const columnType = String(col.tableProps?.columnType ?? "").toLowerCase();
    const datatype = String(col.datatype ?? col.dataType ?? "").toLowerCase();

    if (columnType === "select" || col.tableProps?.selectProps) {
        return "select";
    }

    if (columnType === "checkbox" || datatype === "boolean") {
        return "boolean";
    }

    if (
        (columnType && NUMBER_COLUMN_TYPES.has(columnType)) ||
        NUMBER_DATATYPES.has(datatype)
    ) {
        return "number";
    }

    if (
        (columnType && TEXT_COLUMN_TYPES.has(columnType)) ||
        datatype === "string"
    ) {
        return "text";
    }

    return "text";
}

export function isSelectFilterField(col: Record<string, any> | undefined): boolean {
    return resolveFilterFieldType(col) === "select";
}

export function isNumberFilterField(col: Record<string, any> | undefined): boolean {
    return resolveFilterFieldType(col) === "number";
}
