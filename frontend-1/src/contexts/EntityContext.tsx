import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_URL, getAuthToken } from '@/api/apiClient';

const STORAGE_KEY = 'fabriq_current_entity_id';

export interface Entity {
  id: string;
  legal_name: string;
  is_it_headquartres?: boolean;
  is_individual?: boolean;
  financial_year_type?: 'JAN_DEC' | 'APR_MAR' | 'JUL_JUN' | 'OCT_SEP';
  basecurrency_id?: string;
  currency?: { id?: string; code?: string };
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

async function fetchEntities(): Promise<Entity[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const res = await fetch(
      `${API_URL}/api/entity/view/entity_view/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filters: {}, page: 1, limit: 100 }),
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as Entity[];
  } catch {
    return [];
  }
}

export const EntityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [currentEntity, setCurrentEntityState] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEntities().then((list) => {
      if (cancelled) return;
      setEntities(list);

      const storedId = localStorage.getItem(STORAGE_KEY);
      const stored = storedId ? list.find((e) => e.id === storedId) ?? null : null;

      if (stored) {
        setCurrentEntityState(stored);
      } else {
        const hq = list.find((e) => e.is_it_headquartres) ?? list[0] ?? null;
        setCurrentEntityState(hq);
        if (hq) localStorage.setItem(STORAGE_KEY, hq.id);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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
