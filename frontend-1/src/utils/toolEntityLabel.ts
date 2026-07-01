/** Scope metadata returned on tool results after a search/report step. */
export type ToolLegalEntityScope = {
  legal_entity_ids?: string[];
  legal_entity_names?: string[];
};

export function resolveToolLegalEntityLabel(
  toolResult?: {
    filters?: ToolLegalEntityScope;
    legal_entity_names?: string[];
  } | null
): string | null {
  const names =
    toolResult?.legal_entity_names ?? toolResult?.filters?.legal_entity_names;
  if (!Array.isArray(names) || !names.length) return null;
  const label = names.map((n) => String(n).trim()).filter(Boolean).join(', ');
  return label || null;
}
