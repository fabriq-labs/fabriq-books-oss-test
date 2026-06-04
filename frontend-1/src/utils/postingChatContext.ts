import type { Entity } from '@/contexts/EntityContext';
import { isEntityHeadquarters } from '@/contexts/EntityContext';

/** Entity for posting chat/create — selected header entity, else HQ, else first. */
export function resolvePostingLegalEntity(
  currentEntity: Entity | null,
  entities: Entity[]
): { legalEntityId: string | null; legalEntityName: string | null } {
  const entity =
    currentEntity ??
    entities.find((e) => isEntityHeadquarters(e)) ??
    entities[0] ??
    null;
  return {
    legalEntityId: entity?.id ?? null,
    legalEntityName: entity?.legal_name ?? null,
  };
}

export function buildPostingModelContext(
  currentEntity: Entity | null,
  entities: Entity[],
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const { legalEntityId, legalEntityName } = resolvePostingLegalEntity(
    currentEntity,
    entities
  );
  return {
    ...extra,
    legalEntityId,
    legalEntityName,
  };
}

/** Default agent context when ChatUI has no route pageContext (full-page chat). */
export function buildDefaultPostingChatContext(
  currentEntity: Entity | null,
  entities: Entity[]
) {
  return {
    modelName: 'posting' as const,
    viewName: 'posting_view',
    recordId: null,
    stateId: null,
    viewId: null,
    modelDisplayName: 'Transactions',
    currentPath: '/chat',
    promptTypes: ['analytics', 'default'] as string[],
    focusModels: ['posting', 'account'] as string[],
    modelContext: buildPostingModelContext(currentEntity, entities),
  };
}
