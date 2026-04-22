import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_URL, getAuthToken } from '@/api/apiClient';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'fabriq_current_entity_id';

export interface Entity {
  id: string;
  legal_name: string;
  /** API uses `"Yes"` / `"No"` strings; booleans may appear from other paths */
  is_it_headquartres?: boolean | string;
  is_individual?: boolean;
  financial_year_type?: 'JAN_DEC' | 'APR_MAR' | 'JUL_JUN' | 'OCT_SEP';
  basecurrency_id?: string;
  currency?: { id?: string; code?: string };
}

/** Matches headquarters flag as returned by entity views and forms */
export function isEntityHeadquarters(e: Pick<Entity, 'is_it_headquartres'>): boolean {
  const v = e.is_it_headquartres as unknown;
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  return false;
}

function findHeadquartersInList(list: Entity[]): Entity | null {
  return list.find((e) => isEntityHeadquarters(e)) ?? null;
}

interface EntityContextType {
  entities: Entity[];
  currentEntity: Entity | null;
  currentEntityId: string | null;
  setCurrentEntity: (entity: Entity | null) => void;
  loading: boolean;
}

const EntityContext = createContext<EntityContextType | undefined>(undefined);

export function useEntity() {
  const ctx = useContext(EntityContext);
  if (!ctx) throw new Error('useEntity must be used within EntityProvider');
  return ctx;
}

async function entitySearch(body: Record<string, unknown>): Promise<Entity[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/api/entity/view/entity_view/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as Entity[];
  } catch {
    return [];
  }
}

async function fetchEntities(): Promise<Entity[]> {
  // RestService only applies pagination from `page` + `pageSize` (not `limit`).
  return entitySearch({ filters: {}, page: 1, pageSize: 200 });
}

/** When HQ field is stripped by field permissions, DB-filtered search still returns the row */
async function fetchHeadquartersEntityId(): Promise<string | null> {
  const rows = await entitySearch({
    filters: { is_it_headquartres: { eq: 'Yes' } },
    page: 1,
    pageSize: 1,
  });
  return rows[0]?.id ?? null;
}

export const EntityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [currentEntity, setCurrentEntityState] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEntities([]);
      setCurrentEntityState(null);
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchEntities().then(async (list) => {
      if (cancelled) return;
      setEntities(list);

      const storedId = localStorage.getItem(STORAGE_KEY);
      const stored = storedId ? list.find((e) => e.id === storedId) ?? null : null;

      if (stored) {
        setCurrentEntityState(stored);
        setLoading(false);
        return;
      }

      let hq = findHeadquartersInList(list);
      if (!hq && list.length > 0) {
        const hqId = await fetchHeadquartersEntityId();
        if (!cancelled && hqId) {
          hq = list.find((e) => e.id === hqId) ?? null;
        }
      }
      if (!hq && list.length > 0) {
        hq = list[0] ?? null;
      }
      setCurrentEntityState(hq);
      if (hq) localStorage.setItem(STORAGE_KEY, hq.id);
      else localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const setCurrentEntity = (entity: Entity | null) => {
    setCurrentEntityState(entity);
    if (entity) {
      localStorage.setItem(STORAGE_KEY, entity.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <EntityContext.Provider
      value={{
        entities,
        currentEntity,
        currentEntityId: currentEntity?.id ?? null,
        setCurrentEntity,
        loading,
      }}
    >
      {children}
    </EntityContext.Provider>
  );
};
