import moment from "moment";

const MAX_PREVIEW_LENGTH = 48;

function getNestedValue(record: Record<string, any>, path: string): unknown {
  return path.split(".").reduce((obj: any, prop) => obj?.[prop], record);
}

function truncate(value: string): string {
  if (value.length <= MAX_PREVIEW_LENGTH) return value;
  return `${value.slice(0, MAX_PREVIEW_LENGTH)}…`;
}

/** Plain-text preview of a list cell value (first row sample for column picker). */
export function formatColumnPreviewValue(
  record: Record<string, any> | null | undefined,
  key: string,
  meta: Record<string, any>,
): string | null {
  if (!record) return null;

  const columnType = meta.tableProps?.columnType;
  const selectProps = meta.tableProps?.selectProps;
  const datatype = String(meta.datatype || meta.dataType || "").toLowerCase();

  if (columnType === "select" && selectProps) {
    const nestedObjectKey =
      selectProps.relationName ||
      (selectProps.instanceSourceKey
        ? selectProps.instanceSourceKey.replace(/_id$/, "")
        : undefined) ||
      key.replace(/_id$/, "") ||
      selectProps.instanceType;

    const nested = nestedObjectKey ? record[nestedObjectKey] : undefined;
    if (!nested || typeof nested !== "object") return null;

    const main = selectProps.instanceLabel
      ? nested[selectProps.instanceLabel]
      : undefined;
    const sub = selectProps.instanceSubLabel
      ? nested[selectProps.instanceSubLabel]
      : undefined;

    if (main != null && sub != null) return truncate(`${main} · ${sub}`);
    if (main != null) return truncate(String(main));
    if (sub != null) return truncate(String(sub));
    return null;
  }

  if (meta.listProps) {
    const val = meta.listProps.recordPath
      ? getNestedValue(record, meta.listProps.recordPath)
      : record[key];
    if (Array.isArray(val)) {
      const text = val
        .map((v: any) => v?.label ?? v?.name ?? (typeof v === "string" ? v : null))
        .filter(Boolean)
        .join(", ");
      return text ? truncate(text) : null;
    }
    if (val == null || val === "") return null;
    return truncate(String(val));
  }

  if (meta.select && datatype === "table") {
    const raw = record[key];
    if (!raw || typeof raw !== "object") return null;
    const select = meta.select as Record<string, unknown>;
    const displayField =
      Object.keys(select).find((field) => select[field] === "update") ||
      (typeof select.name === "string" ? "name" : undefined) ||
      Object.keys(select).find(
        (field) => field !== "id" && typeof select[field] === "string",
      );
    if (!displayField) return null;
    const v = raw[displayField];
    return v != null && v !== "" ? truncate(String(v)) : null;
  }

  if (columnType === "checkbox" || datatype === "boolean") {
    const raw = record[key];
    if (raw === null || raw === undefined) return null;
    return raw ? "Yes" : "No";
  }

  const raw = record[key];
  if (raw === null || raw === undefined || raw === "") return null;

  if (datatype === "date") {
    return moment(raw).format("DD-MM-YYYY");
  }
  if (datatype === "datetime") {
    return moment(raw).format("DD-MM-YYYY HH:mm");
  }
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return moment(raw).format("DD-MM-YYYY");
  }
  if (typeof raw === "object") return truncate(JSON.stringify(raw));
  return truncate(String(raw));
}
