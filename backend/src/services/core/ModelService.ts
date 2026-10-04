import { DataAccessLayer } from '../dal/DataAccessLayer';
import { PermissionService } from '../permissions/PermissionService';
import { SearchQueryBuilder } from '../query/SearchQueryBuilder';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';
import { DataAccessResult } from '../types';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import { is_workflow_model } from '../../workflow-engine/types/workflow.types';
import { executeCustomAction } from '../../lib/actions';
import { ExtractorRegistry } from '../../lib/extractors/extractor-registry';
import { ImportExtensionRegistry, initializeImportExtensions } from '../../lib/import-extensions';
import { ValidationError } from '../../rest/errors/ApiError';
import { Prisma } from '@prisma/client';

// Types for model schema introspection
export interface ScalarFieldSchema {
  name: string;
  type: string;
  isRequired: boolean;
  isId: boolean;
  isList: boolean;
  hasDefaultValue: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;
}

export interface RelationSchema {
  name: string;
  type: string;
  relationType: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
  isList: boolean;
  isRequired: boolean;
  foreignKey: string | null;
  relationFromFields: readonly string[];
  relationToFields: readonly string[];
}

export interface ModelSchema {
  modelName: string;
  scalarFields: ScalarFieldSchema[];
  relations: RelationSchema[];
}

const workflowEngine = new WorkflowEngine(prisma);

export class ModelService {
  private static instance: ModelService;
  private dal: DataAccessLayer;
  private prisma: any;
  private extractorRegistry: ExtractorRegistry;
  private importExtensionRegistry: ImportExtensionRegistry;

  private constructor() {
    this.dal = DataAccessLayer.getInstance(prisma);
    this.prisma = prisma;
    this.extractorRegistry = ExtractorRegistry.getInstance();
    initializeImportExtensions();
    this.importExtensionRegistry = ImportExtensionRegistry.getInstance();
  }

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  /**
   * Utility: Get select/dataGraph from view and options (no include)
   */
  private async getSelectFromView(
    modelName: string,
    viewName?: string,
    options?: { select?: any }
  ): Promise<{ select?: any; dataGraph?: any }> {
    // 1. Fetch the view
    const view = await PermissionService.getView(viewName ?? null, modelName);
    const dataGraph = view?.data_graph as { select?: any } | null;

    // 2. Prefer user-provided select
    let select = options?.select;

    // 3. Parse from dataGraph if not provided
    if (!select && dataGraph) {
      const { LegacyDataGraphParser } = await import('../../utils/LegacyDataGraphParser');
      select = dataGraph.select || LegacyDataGraphParser.parseToSelect(dataGraph);
    }

    // console.log('-----****----dataGraph', dataGraph);

    return { select, dataGraph };
  }

  /**
   * Create a new record
   */
  async create(modelName: string, context: AuthContext, data: any, options?: any, tx?: any): Promise<DataAccessResult> {
    logger.debug('Creating record', { modelName, userId: context.user?.id, data });
    try {
      const { select, dataGraph } = await this.getSelectFromView(
        modelName,
        options?.viewName,
        options
      );
      // remove dummy_field from data if it exists.   workaround for zod not allowing empty objects
      if (data && 'dummy_field' in data) {
        delete data.dummy_field;
      }
      let dalResult = await this.dal.create(modelName, context, data, { select }, tx);
      if (!dalResult.success || !dalResult.data) {
        logger.error('DAL create failed', { modelName, error: dalResult.error });
        return {
          success: false,
          data: null,
          metaData: dataGraph,
          error: dalResult.error || 'Record creation failed with no data returned'
        };
      }
      if (is_workflow_model(modelName)) {
        logger.debug(`Creating workflow instance for ${modelName}`);
        const createdWorkflowInstance = await workflowEngine.createWorkflowInstance(
          modelName,
          dalResult.data.id,
          context.user,
          tx
        );
        dalResult.data = { ...dalResult.data, wf_instance_id: createdWorkflowInstance.id };
      }
      return {
        success: dalResult.success,
        data: dalResult.data,
        metaData: dataGraph,
        error: dalResult.error
      };
    } catch (error: any) {
      logger.error('Error in ModelService.create', { error: error.message, modelName }, error.stack);
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Update an existing record
   */
  async update(modelName: string, context: AuthContext, id: string, data: any, options?: any): Promise<DataAccessResult> {
    logger.debug('Updating record', { modelName, id, userId: context.user?.id, data });
    try {
      const { select, dataGraph } = await this.getSelectFromView(
        modelName,
        options?.viewName,
        options
      );
      // remove dummy_field from data if it exists.   workaround for zod not allowing empty objects
      if (data && 'dummy_field' in data) {
        delete data.dummy_field;
      }
      const dalResult = await this.dal.update(modelName, context, id, data, { select });
      return {
        success: dalResult.success,
        data: dalResult.data,
        metaData: dataGraph,
        error: dalResult.error
      };
    } catch (error: any) {
      logger.error('Error in ModelService.update', { error: error.message, modelName });
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Delete a record
   */
  async delete(modelName: string, context: AuthContext, id: string): Promise<DataAccessResult> {
    logger.debug('Deleting record', { modelName, id, userId: context.user?.id });
    return this.dal.delete(modelName, context, id);
  }

  /**
   * Get a record by ID
   */
  async getById(modelName: string, context: AuthContext, id: string, options?: any): Promise<DataAccessResult> {
    logger.debug('Getting record by ID', { modelName, id, userId: context.user?.id });
    try {
      const { select, dataGraph } = await this.getSelectFromView(
        modelName,
        options?.viewName,
        options
      );
      const dalResult = await this.dal.findUnique(modelName, context, id, { select });

      let workflowContext;
      if (dalResult.success && dalResult.data?.wf_instance_id) {
        workflowContext = await workflowEngine.getWorkflowContextForUI(
          dalResult.data.wf_instance_id
        );
      }

      return {
        success: dalResult.success,
        data: dalResult.data,
        metaData: dataGraph,
        error: dalResult.error,
        workflow_context: workflowContext
      };
    } catch (error: any) {
      logger.error('Error in ModelService.getById', { error: error.message, modelName });
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Get a record by auth_id (external_id)
   */
  async getByAuthId(modelName: string, context: AuthContext, authId: string, options?: any): Promise<DataAccessResult> {
    try {
      const dalResult = await this.dal.findUniqueByAuthId(modelName, context, authId, { select: options?.select });

      return {
        success: dalResult.success,
        data: dalResult.data,
        metaData: null,
        error: dalResult.error
      };
    } catch (error: any) {
      logger.error('Error in ModelService.getByAuthId', { error: error.message, modelName });
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Search records
   */
  async search(
    modelName: string,
    context: AuthContext,
    query: any,
    options?: { viewName?: string; select?: any }
  ): Promise<DataAccessResult> {

    try {
      const { select, dataGraph } = await this.getSelectFromView(
        modelName,
        options?.viewName,
        options
      );
      const queryForBuilder = { ...query };
      if (queryForBuilder.select && typeof queryForBuilder.select === 'object' && !Array.isArray(queryForBuilder.select)) {
        delete queryForBuilder.select;
      }
      const optionsFromQuery = SearchQueryBuilder.buildQueryOptions(queryForBuilder, modelName);
      if (select) {
        optionsFromQuery.select = select;
      }
      // 3. Validate permissions for selected fields
      const permissions = PermissionService.validatePermissions(context, modelName, 'read');
      if (optionsFromQuery.select) {
        PermissionService.validateFieldPermissions(Object.keys(optionsFromQuery.select), permissions);
      }
      // 4. Call DAL with the correct options
      const dalResult = await this.dal.search(modelName, context, optionsFromQuery);
      return {
        success: dalResult.success,
        data: dalResult.data,
        metaData: dataGraph,
        error: dalResult.error,
        total: dalResult.total,
        page: dalResult.page,
        pageSize: dalResult.pageSize
      };
    } catch (error: any) {
      console.log('error', error);
      logger.error('Error in ModelService.search', { error: error.message, modelName });
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Create many records
   */
  async createMany(modelName: string, context: AuthContext, data: any[], options?: any): Promise<DataAccessResult> {
    logger.debug('Creating many records', { modelName, userId: context.user?.id, count: data.length });
    try {
      const { select, dataGraph } = await this.getSelectFromView(
        modelName,
        options?.viewName,
        options
      );
      const dalResult = await this.dal.createMany(modelName, context, data, { select });
      return {
        success: dalResult.success,
        data: dalResult.data,
        metaData: dataGraph,
        error: dalResult.error
      };
    } catch (error: any) {
      logger.error('Error in ModelService.createMany', { error: error.message, modelName });
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Update a child record through a parent relation
   */
  async updateChild(
    modelName: string,
    context: AuthContext,
    id: string,
    relation: string,
    childId: string,
    data: any,
    options?: { viewName?: string }
  ): Promise<DataAccessResult> {
    try {
      const { select, dataGraph } = await this.getSelectFromView(modelName, options?.viewName);

      const result = await this.prisma.$transaction(async (tx: any) => {
        return await this.dal.updateChild(modelName, context, id, relation, childId, data, { select }, tx);
      });

      return {
        ...result,
        metaData: dataGraph
      };
    } catch (error: any) {
      logger.error('Error in ModelService.updateChild', { error: error.message, modelName });
      // Rethrow the error so the transaction can rollback
      throw error;
    }
  }

  /**
   * Add children to a parent record
   */
  async addChildrenToParent(
    modelName: string,
    parentId: string,
    relation: string,
    context: AuthContext,
    children: any[],
    options?: { viewName?: string },
    tx?: any
  ): Promise<DataAccessResult> {
    try {
      const { select, dataGraph } = await this.getSelectFromView(modelName, options?.viewName);

      const result = tx
        ? await this.dal.addChildrenToParent(modelName, parentId, relation, context, children, { select }, tx)
        : await this.prisma.$transaction(async (transaction: any) => {
          return await this.dal.addChildrenToParent(modelName, parentId, relation, context, children, { select }, transaction);
        });

      return {
        ...result,
        metaData: dataGraph
      };
    } catch (error: any) {
      logger.error('Error in ModelService.addChildrenToParent', { error: error.message, modelName });
      // Rethrow the error so the transaction can rollback
      throw error;
    }
  }

  /**
   * Delete a relation between parent and child
   */
  async deleteRelation<T = any>(
    context: AuthContext,
    modelName: string,
    relation: string,
    id: string,
    childId: string,
    options?: { viewName?: string }
  ): Promise<DataAccessResult<T>> {
    try {
      const { select, dataGraph } = await this.getSelectFromView(modelName, options?.viewName);

      const result = await this.prisma.$transaction(async (tx: any) => {
        return await this.dal.deleteRelation<T>(context, modelName, relation, id, childId, { select }, tx);
      });

      return {
        ...result,
        metaData: dataGraph
      };
    } catch (error: any) {
      logger.error('Error in ModelService.deleteRelation', { error: error.message, modelName });
      // Rethrow the error so the transaction can rollback
      throw error;
    }
  }

  /**
   * Run a custom action for a model instance (always handles transaction internally)
   */
  async runCustomAction(
    context: AuthContext,
    model: string,
    id: string,
    action: string,
    attributes: any
  ) {
    const { select, dataGraph } = await this.getSelectFromView(model, undefined);
    return await this.prisma.$transaction(async (tx: any) => {
      return await executeCustomAction(context, model, id, action, attributes, { select }, tx);
    });
  }
  /**
    * Update bulk records
    */

  async updateMany(
    modelName: string,
    context: AuthContext,
    payload: { ids: any[]; data: any },
    options?: any
  ): Promise<DataAccessResult> {
    const { select, dataGraph } = await this.getSelectFromView(
      modelName,
      options?.viewName,
      options
    );
    const dalResult = await this.dal.updateMany(modelName, context, payload, { select });
    return {
      success: dalResult.success,
      data: dalResult.data,
      metaData: dataGraph,
      error: dalResult.error,
    };
  }


  // Delete bulk records
  async deleteMany(
    modelName: string,
    context: AuthContext,
    ids: any,
    options?: any
  ): Promise<DataAccessResult> {
    const { select, dataGraph } = await this.getSelectFromView(
      modelName,
      options?.viewName,
      options
    );
    const dalResult = await this.dal.deleteMany(modelName, context, ids, { select });
    return {
      success: dalResult.success,
      data: dalResult.data,
      metaData: dataGraph,
      error: dalResult.error,
    };
  }

  /**
   * Execute advanced SQL queries for complex operations
   */
  async executeSqlQuery(query: string, context: AuthContext): Promise<DataAccessResult> {
    logger.debug('Executing advanced SQL query', { query: query.substring(0, 100) + '...' });

    try {
      // Require authentication for all SQL queries
      if (!context.user) {
        logger.warn('No user context found for SQL query');
        return { success: false, error: 'Authentication required' };
      }

      // Basic SQL injection prevention - check for dangerous keywords
      // Only block standalone dangerous keywords, not keywords that are part of field names or values
      const dangerousKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'INSERT', 'UPDATE'];
      const upperQuery = query.toUpperCase();

      // Remove "CREATE" from dangerous keywords since it's commonly used in field names like created_at, created_by
      // Instead, we'll rely on the SELECT-only check below

      for (const keyword of dangerousKeywords) {
        if (upperQuery.includes(keyword)) {
          logger.warn('Potentially dangerous SQL keyword detected', { keyword, query: query.substring(0, 100) });
          return {
            success: false,
            error: `SQL query contains potentially dangerous keyword: ${keyword}. Only SELECT queries are allowed.`
          };
        }
      }

      // Ensure query starts with SELECT
      if (!upperQuery.trim().startsWith('SELECT')) {
        logger.warn('Non-SELECT SQL query attempted', { query: query.substring(0, 100) });
        return {
          success: false,
          error: 'Only SELECT queries are allowed for security reasons.'
        };
      }

      // Execute the query using Prisma's $queryRaw
      const result = await this.prisma.$queryRawUnsafe(query);

      logger.debug('SQL query executed successfully', {
        rowCount: Array.isArray(result) ? result.length : 1
      });

      return {
        success: true,
        data: Array.isArray(result) ? result : [result],
        metaData: null,
        error: undefined
      };

    } catch (error: any) {
      logger.error('Error executing SQL query', {
        error: error.message,
        query: query.substring(0, 100) + '...'
      });
      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Parse a PDF document and extract data mapped to the specified model schema
   * Returns raw extracted data without validation or database operations
   *
   * Uses Import Extension pattern:
   * 1. Check if document type is handled by an import extension (custom extraction)
   * 2. Fall back to standard extractor registry if no extension
   */
  async parseDocument(
    modelName: string,
    context: AuthContext,
    pdfBuffer: Buffer,
    options?: {
      mimeType?: string;
      fileSize?: number;
      fileName?: string;
      documentType?: string;
      extractorOptions?: any;
      [key: string]: any;
    }
  ): Promise<DataAccessResult> {
    // Validate file type and size when caller provides them
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (options?.mimeType && options.mimeType !== 'application/pdf') {
      throw new ValidationError('Only PDF files are supported');
    }
    if (options?.fileSize && options.fileSize > MAX_FILE_SIZE) {
      throw new ValidationError('File size must be less than 10MB');
    }

    logger.debug('Parsing document for model', {
      modelName,
      userId: context.user?.id,
      bufferSize: pdfBuffer.length
    });

    try {
      // Build extractor options: start from explicit extractorOptions, add file metadata,
      // then pull any extension-required option keys from the top-level options dict
      const extractorOptions: Record<string, any> = {
        ...(options?.extractorOptions || {}),
        ...(options?.documentType ? { documentType: options.documentType } : {}),
        ...(options?.fileName ? { fileName: options.fileName } : {}),
        ...(options?.fileSize ? { fileSize: options.fileSize } : {}),
      };

      // Pull extension-required option keys from the caller-supplied options
      const extension = this.importExtensionRegistry.getByDocumentType(modelName);
      if (extension) {
        const requiredOptions = extension.getRequiredOptions();
        for (const optionKey of requiredOptions) {
          if (options?.[optionKey] != null) {
            extractorOptions[optionKey] = options[optionKey];
          }
        }
      }
      if (typeof options?.onProgress === 'function') {
        extractorOptions.onProgress = options.onProgress;
      }

      // 1. Check if an import extension handles this document type
      if (extension && extension.customExtract) {
        logger.debug('Using import extension for document', {
          modelName,
          extensionId: extension.extensionId
        });

        // Validate permissions for the extension's target model
        const permissions = PermissionService.validatePermissions(context, extension.targetModel, 'read');
        if (!permissions) {
          return {
            success: false,
            data: null,
            metaData: null,
            error: `No access permissions for model: ${extension.targetModel}`
          };
        }

        // Use extension's custom extraction
        const extensionResult = await extension.customExtract(
          { user: context.user, permissions: context.permissions },
          pdfBuffer,
          extractorOptions
        );

        if (!extensionResult.success) {
          return {
            success: false,
            data: null,
            metaData: null,
            error: `Extension extraction failed: ${extensionResult.errors?.join(', ')}`
          };
        }

        logger.debug('Extension extraction completed', {
          modelName,
          extensionId: extension.extensionId,
          dataFields: Object.keys(extensionResult.data || {}),
          hasCategorizations: !!extensionResult.categorizations?.length
        });

        // Return data with categorizations if present
        return {
          success: true,
          data: {
            ...extensionResult.data,
            categorizations: extensionResult.categorizations
          },
          metaData: {
            modelName,
            ...extensionResult.metadata,
            extensionId: extension.extensionId,
            ...(options?.fileName ? { fileName: options.fileName } : {}),
            ...(options?.fileSize ? { fileSize: options.fileSize } : {}),
            uploadedAt: new Date().toISOString(),
          },
          error: undefined
        };
      }

      // 2. Fall back to standard extractor registry
      let extractor = this.extractorRegistry.getExtractorForModel(modelName);

      if (!extractor) {
        // Try finding by document type
        extractor = this.extractorRegistry.getExtractorForType(modelName);
      }

      if (!extractor) {
        const availableModels = this.extractorRegistry.getAvailableModels();
        const availableTypes = this.extractorRegistry.getSupportedTypes();
        const extensionTypes = this.importExtensionRegistry.getAllSupportedDocumentTypes();
        return {
          success: false,
          data: null,
          metaData: null,
          error: `No extractor found for: ${modelName}. Available models: ${availableModels.join(', ')}. Available types: ${[...availableTypes, ...extensionTypes].join(', ')}`
        };
      }

      // Validate model access permissions
      const targetModel = extractor.getTargetModel();
      const permissions = PermissionService.validatePermissions(context, targetModel, 'read');
      if (!permissions) {
        return {
          success: false,
          data: null,
          metaData: null,
          error: `No access permissions for model: ${targetModel}`
        };
      }

      logger.debug('Using standard extractor for model', { modelName, extractorType: extractor.constructor.name });

      // Extract data using the document extractor
      const extractionResult = await extractor.extract(
        context,
        {
          documentContent: pdfBuffer,
          documentType: modelName,
          options: extractorOptions
        }
      );

      if (!extractionResult.success) {
        return {
          success: false,
          data: null,
          metaData: null,
          error: `Document extraction failed: ${extractionResult.errors?.join(', ')}`
        };
      }

      logger.debug('Document parsing completed', {
        modelName,
        confidence: extractionResult.confidence,
        dataFields: Object.keys(extractionResult.data || {})
      });

      return {
        success: true,
        data: extractionResult.data,
        metaData: {
          confidence: extractionResult.confidence,
          modelName,
          processingTime: extractionResult.metadata?.processingTime,
          extractorType: extractor.constructor.name,
          ...(options?.fileName ? { fileName: options.fileName } : {}),
          ...(options?.fileSize ? { fileSize: options.fileSize } : {}),
          uploadedAt: new Date().toISOString(),
        },
        error: undefined
      };

    } catch (error: any) {
      // Re-throw validation errors so callers can map them to 400 responses
      if (error instanceof ValidationError) {
        throw error;
      }
      logger.error('Error in ModelService.parseDocument', {
        error: error.message,
        modelName
      }, error.stack);

      return {
        success: false,
        data: null,
        metaData: null,
        error: error.message
      };
    }
  }

  /**
   * Get the schema (fields and relations) for a Prisma model
   * Uses Prisma's DMMF (Data Model Meta Format) for introspection
   * TODO: cache this
   */
  getModelSchema(modelName: string): ModelSchema | null {
    try {
      // Access Prisma's DMMF - the canonical source of model metadata
      const dmmf = Prisma.dmmf;

      // Find the model (case-insensitive match)
      const model = dmmf.datamodel.models.find(
        m => m.name.toLowerCase() === modelName.toLowerCase()
      );

      if (!model) {
        logger.warn('Model not found in Prisma schema', { modelName });
        return null;
      }

      // Extract scalar fields (non-relation fields)
      const scalarFields: ScalarFieldSchema[] = model.fields
        .filter(field => field.kind === 'scalar' || field.kind === 'enum')
        .map(field => ({
          name: field.name,
          type: field.type,
          isRequired: field.isRequired,
          isId: field.isId,
          isList: field.isList,
          hasDefaultValue: field.hasDefaultValue,
          isUnique: field.isUnique,
          isUpdatedAt: field.isUpdatedAt ?? false
        }));

      // Extract relations
      const relations: RelationSchema[] = model.fields
        .filter(field => field.kind === 'object')
        .map(field => {
          // Determine relation type
          let relationType: RelationSchema['relationType'];

          if (field.isList) {
            // If this side is a list, it's either oneToMany or manyToMany
            // We'll default to oneToMany - manyToMany would require checking the other side
            relationType = 'oneToMany';
          } else if (field.relationFromFields && field.relationFromFields.length > 0) {
            // This side has the foreign key, it's manyToOne
            relationType = 'manyToOne';
          } else {
            // Single relation without FK on this side - likely oneToOne (back-reference)
            relationType = 'oneToOne';
          }

          return {
            name: field.name,
            type: field.type,
            relationType,
            isList: field.isList,
            isRequired: field.isRequired,
            foreignKey: field.relationFromFields?.[0] || null,
            relationFromFields: field.relationFromFields || [],
            relationToFields: field.relationToFields || []
          };
        });

      logger.debug('Model schema introspected', {
        modelName: model.name,
        scalarFieldCount: scalarFields.length,
        relationCount: relations.length
      });

      return {
        modelName: model.name,
        scalarFields,
        relations
      };
    } catch (error: any) {
      logger.error('Error introspecting model schema', {
        error: error.message,
        modelName
      });
      return null;
    }
  }

  /**
   * Get all available model names from Prisma schema
   */
  getAllModelNames(): string[] {
    try {
      const dmmf = Prisma.dmmf;
      return dmmf.datamodel.models.map(m => m.name);
    } catch (error: any) {
      logger.error('Error getting model names', { error: error.message });
      return [];
    }
  }

} 