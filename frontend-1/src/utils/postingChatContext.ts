import type { Entity } from '@/contexts/EntityContext';
import { isEntityHeadquarters } from '@/contexts/EntityContext';
import type { PageContext } from '@/contexts/ChatContext';

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

/** Models exposed in finance chat (postings + chart of accounts). */
export const FINANCE_FOCUS_MODELS = ['posting', 'account'] as const;

/** Default agent context when ChatUI has no route pageContext (full-page chat). */
export function buildDefaultPostingChatContext(
  currentEntity: Entity | null,
  entities: Entity[]
): PageContext {
  return {
    modelName: 'posting',
    viewName: 'posting_view',
    recordId: null,
    stateId: null,
    viewId: null,
    modelDisplayName: 'Transactions',
    currentPath: '/chat',
    promptTypes: ['analytics', 'default'],
    focusModels: [...FINANCE_FOCUS_MODELS],
    modelContext: buildPostingModelContext(currentEntity, entities),
  };
}

/** Merge header entity + prompt scope for posting/account chat routes. */
export function enrichFinanceChatContext(
  base: PageContext,
  currentEntity: Entity | null,
  entities: Entity[]
): PageContext {
  const modelName = base.modelName as string | undefined;
  if (modelName !== 'posting' && modelName !== 'account') {
    return base;
  }
  return {
    ...base,
    promptTypes:
      (base.promptTypes as string[] | undefined)?.length
        ? base.promptTypes
        : ['analytics', 'default'],
    focusModels:
      (base.focusModels as string[] | undefined)?.length
        ? base.focusModels
        : [...FINANCE_FOCUS_MODELS],
    modelContext: buildPostingModelContext(
      currentEntity,
      entities,
      base.modelContext as Record<string, unknown> | undefined
    ),
  };
}
