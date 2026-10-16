import { tool } from 'ai';
import { ModelService } from '../services/core/ModelService';
import {
  getCreateRecordSchema,
  getUpdateRecordSchema,
  searchRecordsSchema,
  identifyModelSchema,
  GENERIC_FUNCTIONS,
  updateChildRelationSchema,
  addChildrenToParentSchema,
  createChildItemSchema,
  deleteRelationSchema,
  updateChildItemSchema,
  advancedSqlQuerySchema,
} from './GenericFunctions';
import { AuthContext } from '../auth/types';
import { SYSTEM_FIELDS } from '../services/registry/ModelRegistry';
import { ModelRegistry } from '../services/registry/ModelRegistry';
import logger from '../utils/logger';

const modelService = ModelService.getInstance();

function getDescription(name: string) {
  const fn = GENERIC_FUNCTIONS.find(f => f.name === name);
  return fn ? fn.description : '';
}

function enrichRecordResult(result: any, modelName: string, toolName: 'createRecord' | 'updateRecord' | 'createChildItem' | 'updateChildItem') {
  const record = result.data?.data || result.data || result;
  const metadata = ModelRegistry.getInstance().getModelMetadata(modelName);
  const columns = metadata
    ? metadata.fields
      .filter(f => !SYSTEM_FIELDS.includes(f.name))
      .map(f => ({
        field: f.name,
        label: f.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
      }))
    : [];
  return {
    tool: toolName,
    model: modelName,
    resultType: 'record',
    data: record,
    columns,
    metaData: result.metaData || null,
  };
}

function enrichSearchResult(
  result: any,
  modelName: string,
  pagination?: { page?: number; pageSize?: number }
) {
  const raw = result?.data;
  const records = Array.isArray(raw)
    ? raw.filter((row: unknown) => row && typeof row === 'object' && 'id' in (row as object))
    : [];
  const returnedCount = records.length;
  const totalCount = typeof result?.total === 'number' ? result.total : returnedCount;
  const truncated = totalCount > returnedCount;
  const page = pagination?.page ?? result?.page ?? 1;
  const pageSize = pagination?.pageSize ?? result?.pageSize;
  const columns = records.length > 0
    ? Object.keys(records[0])
      .filter(field => !SYSTEM_FIELDS.includes(field))
      .map(field => ({
        field,
        label: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      }))
    : [];
  const summary = totalCount === 0
    ? 'No records found matching your search criteria.'
    : `Found ${totalCount} record(s).`;
  return {
    tool: 'searchRecords',
    model: modelName,
    resultType: records.length === 1 ? 'record' : 'list',
    recordCount: totalCount,
    totalCount,
    returnedCount,
    truncated,
    page,
    pageSize,
    summary,
    data: records,
    columns,
    metaData: result.metaData || null,
  };
}

export function createRecordTool(
  auth: AuthContext,
  toolContext?: { modelName?: string; modelContext?: Record<string, any> }
) {
  return tool({
    parameters: getCreateRecordSchema(toolContext),
    description: getDescription('createRecord'),
    execute: async ({ modelName, data }: { modelName: string; data?: any }) => {
      const finalModelName = modelName || toolContext?.modelName;
      if (!finalModelName) {
        throw new Error('Model name is required.');
      }
      if (!data) {
        throw new Error('Data is required for creating a record');
      }
      const result = await modelService.create(finalModelName, auth, data);
      return JSON.parse(JSON.stringify(enrichRecordResult(result, finalModelName, 'createRecord')));
    },
  });
}

export function updateRecordTool(auth: AuthContext, toolContext?: { modelName?: string }) {
  return tool({
    parameters: getUpdateRecordSchema(toolContext),
    description: getDescription('updateRecord'),
    execute: async ({ modelName, id, data }: { modelName: string; id: string; data?: any }) => {
      const finalModelName = modelName || toolContext?.modelName;
      if (!finalModelName) {
        throw new Error('Model name is required.');
      }
      if (!data) {
        throw new Error('Data is required for updating a record');
      }
      const result = await modelService.update(finalModelName, auth, id, data);
      return JSON.parse(JSON.stringify(enrichRecordResult(result, finalModelName, 'updateRecord')));
    },
  });
}

export function searchRecordsTool(auth: AuthContext, _toolContext?: { modelName?: string }) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchRecords'),
    execute: async (params: { modelName: string; search?: any; page?: number; pageSize?: number }) => {
      const normalized = {
        ...params,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 50,
      };
      const result = await modelService.search(normalized.modelName, auth, normalized);
      return JSON.parse(JSON.stringify(enrichSearchResult(result, params.modelName, {
        page: normalized.page,
        pageSize: normalized.pageSize,
      })));
    },
  });
}

export function searchUsersTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchUsers'),
    execute: async (params: { modelName: string; search?: any; page?: number; pageSize?: number }) => {
      const searchParams = { ...params, modelName: 'user' };
      const result = await modelService.search('user', auth, searchParams);
      return JSON.parse(JSON.stringify(enrichSearchResult(result, 'user')));
    },
  });
}

export function identifyModelTool(_auth: AuthContext) {
  return tool({
    parameters: identifyModelSchema,
    description: getDescription('identifyModel'),
    execute: async () => {
      throw new Error('identifyModel tool is not implemented.');
    },
  });
}

export function updateChildRelationTool(auth: AuthContext) {
  return tool({
    parameters: updateChildRelationSchema,
    description: getDescription('updateChildRelation'),
    execute: async ({ modelName, id, relation, childId, data }) => {
      const result = await modelService.updateChild(modelName, auth, id, relation, childId, data);
      return JSON.parse(JSON.stringify(result));
    },
  });
}

export function addChildrenToParentTool(auth: AuthContext) {
  return tool({
    parameters: addChildrenToParentSchema,
    description: getDescription('addChildrenToParent'),
    execute: async ({ modelName, id, relation, childIds }) => {
      const result = await modelService.addChildrenToParent(modelName, id, relation, auth, childIds);
      return JSON.parse(JSON.stringify(result));
    },
  });
}

export function createChildItemTool(auth: AuthContext) {
  return tool({
    parameters: createChildItemSchema,
    description: getDescription('createChildItem'),
    execute: async ({ parentModelName, parentId, childModelName, data }) => {
      await modelService.create(childModelName, auth, data || {});
      const parentResult = await modelService.getById(parentModelName, auth, parentId);
      return JSON.parse(JSON.stringify(enrichRecordResult(parentResult, parentModelName, 'createChildItem')));
    },
  });
}

export function deleteRelationTool(auth: AuthContext) {
  return tool({
    parameters: deleteRelationSchema,
    description: getDescription('deleteRelation'),
    execute: async ({ modelName, id, relation, childId }) => {
      const result = await modelService.deleteRelation(auth, modelName, id, relation, childId);
      return JSON.parse(JSON.stringify(result));
    },
  });
}

export function updateChildItemTool(auth: AuthContext) {
  return tool({
    parameters: updateChildItemSchema,
    description: getDescription('updateChildItem'),
    execute: async ({ parentModelName, parentId, childModelName, data }) => {
      logger.debug('updateChildItemTool', { parentModelName, parentId, childModelName });
      const parentResult = await modelService.getById(parentModelName, auth, parentId);
      return JSON.parse(JSON.stringify(enrichRecordResult(parentResult, parentModelName, 'updateChildItem')));
    },
  });
}

function createColumnMetadata(field: string, value: any) {
  return {
    field,
    label: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    dataType: typeof value,
  };
}

export function advancedSqlQueryTool(auth: AuthContext) {
  return tool({
    parameters: advancedSqlQuerySchema,
    description: getDescription('advancedSqlQuery'),
    execute: async ({ query, description, uiHint }: { query: string; description: string; uiHint?: string }) => {
      const result = await modelService.executeSqlQuery(query, auth);
      const data = result.data || [];
      const fields = data.length > 0 ? Object.keys(data[0]) : [];
      const response = {
        tool: 'advancedSqlQuery',
        description,
        error: result.error || null,
        resultType: uiHint === 'metrics' ? 'metrics' : 'sql_result',
        data: uiHint === 'metrics' && data.length > 0 ? data[0] : data,
        columns: fields.map(field => createColumnMetadata(field, data[0]?.[field])),
        rowCount: data.length,
        uiHint: uiHint || 'table',
      };
      return JSON.parse(JSON.stringify(response, (_key, value) => typeof value === 'bigint' ? Number(value) : value));
    },
  });
}
