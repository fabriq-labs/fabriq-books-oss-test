export interface CatalogItem {
  key: string;
  label: string;
  model: string;
  view: string;
  fields: string[];
  source: "records" | "flows";
}

export const CATALOG: CatalogItem[] = [
  { key: "users", label: "Users", model: "user", view: "user_view", fields: ["name", "email", "org_id"], source: "records" },
  { key: "roles", label: "Roles", model: "role", view: "role_view", fields: ["name", "org_id"], source: "records" },
  { key: "views", label: "Views", model: "view", view: "view", fields: ["name", "model_name", "org_id"], source: "records" },
  { key: "permissions", label: "Permissions", model: "permission", view: "permission_view", fields: ["field_name", "access", "view_id", "org_id"], source: "records" },
  { key: "currencies", label: "Currencies", model: "currency", view: "currency_view", fields: ["code", "name", "symbol", "org_id"], source: "records" },
  { key: "workflows", label: "Workflows", model: "workflow_flow", view: "workflow_flow_view", fields: ["name", "model_name", "org_id"], source: "flows" },
];
