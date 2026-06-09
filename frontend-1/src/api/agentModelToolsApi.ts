import Cookies from 'js-cookie';

const API_URL = import.meta.env.VITE_API_BASE_URL || '';

export type ToolCatalogEntry = {
  name: string;
  label: string;
  description: string;
  category: string;
};

export type AgentModelToolConfig = {
  id: string;
  model_name: string;
  display_name: string;
  description: string | null;
  model_tools: string[];
  include_analytics_tools: boolean;
  is_active: boolean;
  sort_order: number;
};

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = Cookies.get('__session');
  const res = await fetch(`${API_URL}/api/agent/admin/model-tools${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json();
}

export async function fetchModelToolConfigs(): Promise<AgentModelToolConfig[]> {
  const res = await adminFetch('');
  return res.data ?? [];
}

export async function fetchToolCatalog(): Promise<ToolCatalogEntry[]> {
  const res = await adminFetch('/catalog');
  return res.data ?? [];
}

export async function fetchModelToolConfig(modelName: string): Promise<AgentModelToolConfig> {
  const res = await adminFetch(`/${encodeURIComponent(modelName)}`);
  return res.data;
}

export async function saveModelToolConfig(
  modelName: string,
  body: Partial<AgentModelToolConfig>
): Promise<AgentModelToolConfig> {
  const res = await adminFetch(`/${encodeURIComponent(modelName)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function seedModelToolConfigs(): Promise<number> {
  const res = await adminFetch('/seed', { method: 'POST' });
  return res.count ?? res.created ?? 0;
}
