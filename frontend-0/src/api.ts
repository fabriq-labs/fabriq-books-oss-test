const TOKEN_KEY = "__session";

export function getToken(): string | null {
  const match = document.cookie.match(/(?:^|; )__session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setToken(token: string) {
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=86400`;
}

export function clearToken() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.error || body?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export interface RoleUser {
  id: string;
  role?: { id: string; name: string };
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  org_id: string | null;
  role_users?: RoleUser[];
  org?: { id: string; name: string; base_currency?: string | null };
}

export async function login(email: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data.token;
}

export async function getMe(): Promise<CurrentUser> {
  const data = await request<{ data: CurrentUser }>("/api/metadata/user/me");
  return data.data;
}

export function isSuperAdmin(user: CurrentUser | null): boolean {
  return Boolean(
    user?.role_users?.some((row) => row.role?.name?.toLowerCase().includes("super admin"))
  );
}

const HIDDEN = new Set(["password", "api_key", "external_config"]);

export function visibleEntries(row: Record<string, unknown>, fields: string[]) {
  return fields
    .filter((field) => !HIDDEN.has(field))
    .map((field) => [field, row[field]] as const);
}

export async function listRecords(model: string, view: string): Promise<Record<string, unknown>[]> {
  const data = await request<unknown>(`/api/${model}/view/${view}?page=1&pageSize=100`);
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export async function listFlows(): Promise<Record<string, unknown>[]> {
  const data = await request<unknown>("/api/workflow/flows");
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export async function updateUserName(id: string, name: string) {
  return request(`/api/user/${id}/view/user_view`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return request("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
