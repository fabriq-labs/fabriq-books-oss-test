import type { PostingSearchToolContext } from './searchFilterTypes';

export function userRequestedAllEntities(text?: unknown): boolean {
  if (!text || typeof text !== 'string') return false;
  return /\b(all entities|any entity|every entity|across all entities|from all entities|all legal entities)\b/i.test(
    text
  );
}

export function userRequestedLastWeek(text?: unknown): boolean {
  if (!text || typeof text !== 'string') return false;
  return /\b(last week|previous week|prior week)\b/i.test(text);
}

export function resolveSearchAllEntities(toolContext?: PostingSearchToolContext): boolean {
  if (Boolean(toolContext?.searchAllEntities)) return true;
  const question =
    toolContext?.userQuestion ??
    toolContext?.lastUserMessage ??
    toolContext?.questionText;
  return userRequestedAllEntities(question);
}

export function headerLegalEntityIdFromContext(
  toolContext?: PostingSearchToolContext
): string | null {
  const mc = toolContext?.modelContext;
  if (!mc) return null;
  const id = mc.legalEntityId ?? mc.legal_entity_id;
  return id != null && String(id).trim() !== '' ? String(id) : null;
}

export function userQuestionFromContext(toolContext?: PostingSearchToolContext): unknown {
  return (
    toolContext?.userQuestion ??
    toolContext?.lastUserMessage ??
    toolContext?.questionText
  );
}
