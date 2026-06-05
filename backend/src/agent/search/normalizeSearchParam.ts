import { AuthContext } from '../../auth/types';
import { resolvePostingHeaderLegalEntityId } from '../postingCreateHelpers';
import { normalizeAccountSearchFilters } from './accountSearchNormalize';
import { coerceSearchFilters } from './searchFilterCoercion';
import {
  headerLegalEntityIdFromContext,
  resolveSearchAllEntities,
  userQuestionFromContext,
} from './searchIntent';
import {
  isExplicitPostingAccountSearch,
  normalizePostingSearchFilters,
  resolvePostingSearchAccountNames,
} from './postingSearchNormalize';
import type { PostingSearchToolContext } from './searchFilterTypes';

export async function normalizeSearchParam(
  search: unknown,
  modelName?: string,
  auth?: AuthContext,
  toolContext?: PostingSearchToolContext
): Promise<unknown> {
  const filters = coerceSearchFilters(search);
  if (!filters) return search;
  const searchAllEntities = resolveSearchAllEntities(toolContext);
  let headerLegalEntityId = searchAllEntities
    ? null
    : headerLegalEntityIdFromContext(toolContext);
  if (modelName === 'posting' && auth && !headerLegalEntityId && !searchAllEntities) {
    headerLegalEntityId = await resolvePostingHeaderLegalEntityId(auth, toolContext);
  }
  if (modelName === 'account' && auth) {
    if (!headerLegalEntityId) {
      headerLegalEntityId = await resolvePostingHeaderLegalEntityId(auth, toolContext);
    }
    return normalizeAccountSearchFilters(filters, headerLegalEntityId);
  }
  if (modelName === 'posting' && auth) {
    const accountScoped = isExplicitPostingAccountSearch(filters);
    let normalized = normalizePostingSearchFilters(filters, {
      headerLegalEntityId,
      accountScoped,
      searchAllEntities,
      userQuestion: userQuestionFromContext(toolContext),
    });
    normalized = await resolvePostingSearchAccountNames(
      normalized,
      auth,
      headerLegalEntityId
    );
    return normalized;
  }
  return filters;
}

export { resolvePostingSearchPageSize } from './postingSearchNormalize';
