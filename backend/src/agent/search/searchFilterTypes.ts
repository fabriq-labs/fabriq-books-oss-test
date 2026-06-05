/** Agent searchRecords filter entry (field / operator / value). */
export type SearchFilterEntry = { field: string; operator: string; value: unknown };

export type PostingSearchToolContext = {
  modelContext?: Record<string, unknown>;
  searchAllEntities?: boolean;
  userQuestion?: unknown;
  lastUserMessage?: unknown;
  questionText?: unknown;
};

export type PostingSearchFilterOptions = {
  headerLegalEntityId?: string | null;
  accountScoped?: boolean;
  searchAllEntities?: boolean;
  userQuestion?: unknown;
};
