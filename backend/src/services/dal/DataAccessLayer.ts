import { PrismaClient, Prisma } from '@prisma/client';
import { DataAccessResult } from '../types';
import { PermissionService } from '../permissions/PermissionService';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import prisma from '../../lib/prisma';
import { buildCreateManyErrorLogPayload } from '../../utils/formatPrismaError';
import { execute_Action } from '../../lib/actions';
import { PrismaSchemaParser } from '../../utils/PrismaSchemaParser';
import { EntityDefinition, RelationshipDefinition } from '../../models/ModelRegistry';

export class DataAccessLayer {
  private static instance: DataAccessLayer;
  private prisma: PrismaClient;
  private schemaParser: PrismaSchemaParser;

  // Models that should not have org_id filtering applied
  private static readonly METADATA_MODELS_WITHOUT_ORG_FILTER = [
    'role',
    'workflow_flow',
    'workflow_state',
    'workflow_action',
    'view',
    'permission',
    'role_view',
    'prompt_template',
    'agent_model_tool_config', // Global agent tool assignment per model (no org_id)
    'currency', // Global platform data — seeded once, shared across all tenants
  ];

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.schemaParser = new PrismaSchemaParser();
    logger.info('DataAccessLayer initialized');
  }

  public static getInstance(prisma: PrismaClient): DataAccessLayer {
    if (!DataAccessLayer.instance) {
      DataAccessLayer.instance = new DataAccessLayer(prisma);
    }
    return DataAccessLayer.instance;
  }

  private getModel(modelName: string) {
    const prismaModel = (this.prisma as any)[modelName];
    if (!prismaModel) {
      logger.error(`Model ${modelName} not found in Prisma client`);
      throw new Error(`Model ${modelName} not found`);
    }
    return prismaModel;
  }

  private generateMetadata(modelName: string, context: AuthContext): {
    fields: {
      [fieldName: string]: {
        dataType: string;
        permission: string;
      }
    }
  } {
    const model = this.schemaParser.parseModels().find(m => m.name === modelName);
    if (!model) return { fields: {} };

    const permissions = this.validatePermissions(context, modelName, 'read');

    const metadata: {
      fields: {
        [fieldName: string]: {
          dataType: string;
          permission: string;
        }
      }
    } = { fields: {} };

    // Check for wildcard permission
    const wildcardPermission = permissions['*'];

    model.fields.forEach(field => {
      // Skip relation fields and id fields
      if (field.name.endsWith('Id') || field.name === 'id') return;

      // If wildcard permission exists, use it for all fields
      if (wildcardPermission) {
        metadata.fields[field.name] = {
          dataType: field.type,
          permission: wildcardPermission
        };
      } else {
        // Otherwise use field-specific permission
        metadata.fields[field.name] = {
          dataType: field.type,
          permission: permissions[field.name] || 'none'
        };
      }
    });

    return metadata;
  }

  /**
   * Get metadata about a relation in a model
   * @param modelName The name of the model containing the relation
   * @param relationName The name of the relation field
   * @returns Metadata about the relation including the related model name and whether it's an array
   */
  private getRelationMetadata(modelName: string, relationName: string): { relatedModel: string; isArray: boolean } | null {
    try {
      // Parse all models from the schema
      const models = this.schemaParser.parseModels();

      // Find the model
      const model = models.find((m: EntityDefinition) => m.name === modelName);
      if (!model) {
        logger.error(`Model ${modelName} not found in schema`);
        return null;
      }

      // Find the relation
      const relation = model.relationships?.find((r: RelationshipDefinition) => r.field === relationName);
      if (!relation) {
        logger.error(`Relation ${relationName} not found in model ${modelName}`);
        return null;
      }

      return {
        relatedModel: relation.target,
        isArray: relation.type === 'one-to-many'
      };
    } catch (error) {
      logger.error('Error getting relation metadata', {
        model: modelName,
        relation: relationName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private validatePermissions(context: AuthContext, modelName: string, operation: 'read' | 'write'): { [field: string]: 'read' | 'write' | 'none' } {
    return PermissionService.validatePermissions(context, modelName, operation);
  }

  private addOrgFilter(modelName: string, options: any, context: AuthContext): any {
    // Skip org filtering for metadata models that don't use org_id
    if (DataAccessLayer.METADATA_MODELS_WITHOUT_ORG_FILTER.includes(modelName.toLowerCase())) {
      return options;
    }

    // Skip org filtering if no user context or no org_id
    if (!context.user?.org_id) {
      return options;
    }

    // Create a new options object to avoid mutating the original
    const newOptions = { ...options };

    // Add org_id to where clause
    if (newOptions.where) {
      newOptions.where = {
        ...newOptions.where,
        org_id: context.user.org_id
      };
    } else {
      newOptions.where = {
        org_id: context.user.org_id
      };
    }

    return newOptions;
  }

  public async findMany<T = any>(
    modelName: string,
    context: AuthContext,
    options: { select?: any; where?: any } = {}
  ): Promise<DataAccessResult<T[]>> {
    logger.debug('DataAccessLayer.findMany called', {
      model: modelName,
      options,
      user: context.user?.id
    });

    try {
      // Require authentication for all non-introspection queries
      if (!context.user) {
        logger.warn('No user context found for findMany');
        return { success: false, error: 'Authentication required' };
      }

      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, 'read');
      logger.debug('Permissions validated for findMany', { permissions });

      //if select is empty array, remove select from options
      if (options.select && Object.keys(options.select).length === 0) {
        delete options.select;
      }

      // If select is provided, validate those fields
      if (options.select) {
        PermissionService.validateFieldPermissions(Object.keys(options.select), permissions);
      }

      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }

      // Add org filter to options
      const filteredOptions = this.addOrgFilter(modelName, options, context);

      // Execute query
      const result = await model.findMany(filteredOptions);

      // Apply field-level permissions
      const filteredData = result.map((item: any) =>
        PermissionService.filterFieldsByPermission(item, permissions)
      );

      logger.debug('Data fetched successfully', {
        model: modelName,
        count: filteredData.length
      });

      return {
        success: true,
        data: filteredData
      };
    } catch (error: any) {
      logger.error('Error in findMany', { error: error.message, modelName });
      return { success: false, error: error.message };
    }
  }

  public async findUnique<T = any>(
    modelName: string,
    context: AuthContext,
    id: string,
    options: {
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    } = {}
  ): Promise<DataAccessResult<T>> {
    logger.debug('DataAccessLayer.findUnique called', {
      model: modelName,
      id,
      options,
      user: context.user?.id
    });

    try {
      // Require authentication for all non-introspection queries
      if (!context.user) {
        logger.warn('No user context found for findUnique');
        return { success: false, error: 'Authentication required' };
      }

      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, 'read');
      logger.debug('Permissions validated for findUnique', { permissions });

      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }

      // Build the query options
      const queryOptions: any = {
        where: {
          id
        },
        ...options
      };

      // Add org filter to options
      const filteredOptions = this.addOrgFilter(modelName, queryOptions, context);

      // Handle select options
      if (options.select) {
        filteredOptions.select = options.select;
      }

      // Execute query
      const result = await model.findUnique(filteredOptions);

      if (!result) {
        logger.warn('Record not found', {
          model: modelName,
          id
        });
        return { success: false, error: 'Record not found' };
      }

      // Apply field-level permissions
      const filteredData = PermissionService.filterFieldsByPermission(result, permissions);

      return { success: true, data: filteredData };
    } catch (error) {
      logger.error('Error in findUnique', {
        model: modelName,
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  public async findUniqueByAuthId<T = any>(
    modelName: string,
    context: AuthContext,
    authId: string,
    options: {
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    } = {}
  ): Promise<DataAccessResult<T>> {

    try {
      // Require authentication for all non-introspection queries
      if (!context.user) {
        logger.warn('No user context found for findUniqueByAuthId');
        return { success: false, error: 'Authentication required' };
      }

      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, 'read');      

      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }

      // Build the query options
      const queryOptions: any = {
        where: {
          id: authId
        },
        ...options
      };

      // Add org filter to options
      const filteredOptions = this.addOrgFilter(modelName, queryOptions, context);

      // Handle select options
      if (options.select) {
        filteredOptions.select = options.select;
      } else {
        // Default include if no select is provided
        filteredOptions.include = {
          org: true
        };
      }

      // Execute query      
      const result = await model.findUnique(filteredOptions);

      if (!result) {
        logger.warn('Record not found', {
          model: modelName,
          authId,
          queryOptions
        });
        return { success: false, error: 'Record not found' };
      }

      // Apply field-level permissions
      const filteredData = PermissionService.filterFieldsByPermission(result, permissions);

      return { success: true, data: filteredData };
    } catch (error) {
      logger.error('Error in findUniqueByAuthId', {
        model: modelName,
        authId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  public async create<T = any>(
    modelName: string,
    context: AuthContext,
    data: Record<string, unknown>,
    options: { select?: any },
    tx: any = null
  ): Promise<DataAccessResult<T>> {
    logger.debug('DataAccessLayer.create called', {
      model: modelName,
      data,
      options,
      user: context.user?.id
    });
    const transaction = tx || this.prisma;

    try {
      // Require authentication for all non-introspection queries
      if (!context.user) {
        logger.warn('No user context found for create');
        return { success: false, error: 'Authentication required' };
      }

      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, 'write');
      logger.debug('Permissions validated for create', { permissions });

      // If select is provided, validate those fields
      if (options.select) {
        PermissionService.validateFieldPermissions(Object.keys(options.select), permissions);
        options.select = {
          id: true,
          created_by: true,
          ...options.select
        }
      }

      // Get the Prisma model
      const model = (transaction as any)[modelName.toLowerCase()];
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }

      // Filter input data based on permissions
      const filteredData = PermissionService.filterFieldsByPermission(data, permissions);
      filteredData.created_by = context.user.id;
      filteredData.modified_by = context.user.id;
      filteredData.org_id = context.user.org_id; // Add org_id to created data

      const createArgs = { data: filteredData, ...options };

      const result = tx
        ? await model.create(createArgs)
        : await prisma.$transaction(async (txn: Prisma.TransactionClient) => {
            const txModel = (txn as any)[modelName.toLowerCase()];
            return txModel.create(createArgs);
          });

      logger.debug('Data created successfully', {
        model: modelName,
        id: result.id,
        data: result
      });

      return { success: true, data: result };
    } catch (error) {
      logger.error('Error in create', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error',
        data
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  public async update<T = any>(
    modelName: string,
    context: AuthContext,
    id: string,
    data: Record<string, unknown>,
    options: {
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    } = {}
  ): Promise<DataAccessResult<T>> {
    logger.debug('DataAccessLayer.update called', {
      model: modelName,
      id,
      data,
      user: context.user?.id
    });

    try {
      const permissions = this.validatePermissions(context, modelName, 'write');
      logger.debug('Permissions validated for update', { permissions });

      // Filter input data based on permissions
      const filteredData = PermissionService.filterFieldsByPermission(data, permissions);
      filteredData.modified_by = context.user?.id;

      // Build the query options
      const queryOptions: any = {
        where: {
          id
        },
        data: filteredData,
        ...options
      };

      // Add org filter to where clause
      const filteredOptions = this.addOrgFilter(modelName, queryOptions, context);
      filteredOptions.data = filteredData;

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await this.getModel(modelName).update(filteredOptions);
        const action_result = await execute_Action(context, 'UPDATE', modelName, id, Object.keys(filteredData), options.select, tx as unknown as PrismaClient);
        if (action_result) {
          return action_result[0];
        }
        return updated;
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Error in update', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  public async updateChild<T = any>(
    modelName: string,
    context: AuthContext,
    id: string,
    relation: string,
    childId: string,
    data: Record<string, unknown>,
    options: { select?: any } = {},
    tx: any
  ): Promise<DataAccessResult<T>> {
    logger.debug('DataAccessLayer.updateChild called', {
      model: modelName,
      id,
      relation,
      childId,
      data,
      user: context.user?.id
    });
    try {
      // Get relation metadata to determine child model name
      const relationMetadata = this.getRelationMetadata(modelName, relation);
      if (!relationMetadata) {
        logger.error('Relation metadata not found', { model: modelName, relation });
        return { success: false, error: `Relation ${relation} not found in model ${modelName}` };
      }
      // Validate permissions for both parent and child models
      const parentPermissions = this.validatePermissions(context, modelName, 'write');
      const childPermissions = this.validatePermissions(context, relationMetadata.relatedModel, 'write');
      logger.debug('Permissions validated for updateChild', {
        parentPermissions,
        childPermissions
      });
      // Filter input data based on child model permissions
      const filteredData = PermissionService.filterFieldsByPermission(data, childPermissions);
      filteredData.modified_by = context.user?.id;
      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }
      // Update child through parent relation using transaction client
      const updated = await tx[modelName.toLowerCase()].update({
        where: { id },
        data: {
          [relation]: {
            update: {
              where: { id: childId },
              data: filteredData
            }
          }
        },
        ...options
      });
      const action_result = await execute_Action(context, 'UPDATE', `${modelName}.${relation}`, id, Object.keys(filteredData), options.select, tx);
      if (action_result) {
        return {
          success: true,
          data: action_result[0]
        }
      }
      return {
        success: true,
        data: updated
      }
    } catch (error) {
      logger.error('Error in updateChild', {
        model: modelName,
        relation,
        childId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Rethrow the error so the transaction in ModelService can rollback
      throw error;
    }
  }

  public async delete(
    modelName: string,
    context: AuthContext,
    id: string
  ): Promise<DataAccessResult<boolean>> {
    logger.info('DataAccessLayer.delete called', {
      model: modelName,
      id,
      user: context.user?.id
    });

    try {
      await this.validatePermissions(context, modelName, 'write');

      // Build query options
      const queryOptions: any = {
        where: {
          id
        }
      };

      // Add org filter to where clause
      const filteredOptions = this.addOrgFilter(modelName, queryOptions, context);

      await this.getModel(modelName).delete({
        where: filteredOptions.where
      });

      logger.debug('Data deleted successfully');

      return {
        success: true,
        data: true
      };
    } catch (error) {
      logger.error('Error in delete', {
        model: modelName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  public async addChildrenToParent<T = any>(
    parentModelName: string,
    parentId: string,
    childRelationName: string,
    context: AuthContext,
    children: any[],
    options: { select?: any },
    tx: any
  ): Promise<DataAccessResult<T>> {
    try {
      // Validate permissions for the parent model
      await this.validatePermissions(context, parentModelName, 'write');
      // Get the Prisma model
      const model = this.getModel(parentModelName);
      if (!model) {
        throw new Error(`Model ${parentModelName} not found`);
      }
      // Add created_by and modified_by to all children
      const childrenWithUserInfo = children.map(child => ({
        ...child,
        created_by: context.user?.id,
        modified_by: context.user?.id,
        org_id: context.user?.org_id
      }));
      // Update the parent with new children
      const updated = await tx[parentModelName.toLowerCase()].update({
        where: { id: parentId },
        data: {
          [childRelationName]: {
            create: childrenWithUserInfo
          }
        },
        ...options
      });
      // Collect new child IDs if possible
      const newChildIds = Array.isArray(updated[childRelationName])
        ? updated[childRelationName].map((c: any) => c.id)
        : [];
      const action_result = await execute_Action(
        context,
        'ADD',
        `${parentModelName}.${childRelationName}`,
        parentId,
        newChildIds,
        options.select,
        tx
      );
      if (action_result) {
        return {
          success: true,
          data: action_result[0]
        }
      }
      return {
        success: true,
        data: updated
      }
    } catch (error) {
      logger.error('Error adding children to parent', {
        parentModel: parentModelName,
        parentId,
        childRelation: childRelationName,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      // Rethrow the error so the transaction in RestService can rollback
      throw error;
    }
  }

  public async deleteRelation<T = any>(
    context: AuthContext,
    modelName: string,
    relation: string,
    id: string,
    childId: string,
    options: { select?: any } = {},
    tx: any
  ): Promise<DataAccessResult<T>> {
    try {
      // Validate permissions for the junction model
      // await PermissionService.validatePermissions(context, junctionModel, 'write'); 
      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        throw new Error(`Model ${modelName} not found`);
      }
      // Delete relation using transaction client
      const updated = await tx[modelName.toLowerCase()].update({
        where: { id: id },
        data: {
          [relation]: {
            delete: {
              id: childId
            }
          }
        },
        ...options
      });
      const action_result = await execute_Action(
        context,
        'DELETE',
        `${modelName}.${relation}`,
        id,
        [childId],
        options.select,
        tx
      );
      if (action_result) {
        return {
          success: true,
          data: action_result[0]
        }
      }
      return {
        success: true,
        data: updated
      }
    } catch (error) {
      logger.error('Error deleting relation', {
        modelName,
        relation,
        id,
        childId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Rethrow the error so the transaction in ModelService can rollback
      throw error;
    }
  }

  public async search<T = any>(
    modelName: string,
    context: AuthContext,
    searchQuery: any
  ): Promise<DataAccessResult<T[]>> {

    try {
      // Require authentication for all non-introspection queries
      if (!context.user) {
        logger.warn('No user context found for search');
        return { success: false, error: 'Authentication required' };
      }

      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, 'read');
      // logger.debug('Permissions validated for search', { permissions });

      // Use searchQuery directly as options (already built by ModelService)
      const options = searchQuery;

      // Add org filter to options
      const filteredOptions = this.addOrgFilter(modelName, options, context);

      // If select is provided, validate those fields
      if (filteredOptions.select) {
        PermissionService.validateFieldPermissions(Object.keys(filteredOptions.select), permissions);
      }

      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }

      // Extract and validate pagination parameters
      const page = Math.max(1, filteredOptions.skip !== undefined ? Math.floor(filteredOptions.skip / (filteredOptions.take || 1)) + 1 : 1);
      // Optional: MAX_PAGE_SIZE env; if unset or invalid, default to 200
      const maxPageSize = process.env.MAX_PAGE_SIZE
        ? Math.max(1, parseInt(process.env.MAX_PAGE_SIZE, 10) || 200)
        : 200;
      const pageSize = Math.max(1, Math.min(maxPageSize, filteredOptions.take || 10));
      const skip = (page - 1) * pageSize;

      // Transform orderBy from { field: string, direction: string } to Prisma format
      let orderBy = filteredOptions.orderBy || [{ created_at: "desc" }];
      if (orderBy && !Array.isArray(orderBy) && orderBy.field && orderBy.direction) {
        orderBy = { [orderBy.field]: orderBy.direction };
      }

      // Prepare optimized query options
      const queryOptions = {
        where: filteredOptions.where || {},
        select: filteredOptions.select,
        include: filteredOptions.include,
        skip,
        take: pageSize,
        orderBy
      };
      
      // Execute both queries in parallel for better performance
      const [result, total] = await Promise.all([
        model.findMany(queryOptions),
        model.count({ where: queryOptions.where })
      ]);

      // Apply field-level permissions efficiently
      const filteredData = result.map((item: any) =>
        PermissionService.filterFieldsByPermission(item, permissions)
      );

      // Add total to the result array (like your reference pattern)
      const resultWithTotal = [...filteredData];
      (resultWithTotal as any).total = total;

      // logger.debug('Search completed successfully', {
      //   model: modelName,
      //   count: filteredData.length,
      //   total,
      //   page,
      //   pageSize,
      //   executionTime: Date.now() - Date.now() // Could add timing if needed
      // });

      return {
        success: true,
        data: resultWithTotal,
        total,
        page,
        pageSize
      };
    } catch (error) {
      logger.error('Error in search', {
        model: modelName,
        query: searchQuery,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }


  public async createMany<T = { count: number }>(
    modelName: string,
    context: AuthContext,
    data: Record<string, unknown>[],
    options: { select?: any } = {}
  ): Promise<DataAccessResult<T>> {
    logger.debug('DataAccessLayer.createMany called', {
      model: modelName,
      dataCount: data.length,
      options,
      user: context.user?.id
    });

    let filteredData: Record<string, unknown>[] = [];
    try {
      // Require authentication for all non-introspection queries
      if (!context.user) {
        logger.warn('No user context found for createMany');
        return { success: false, error: 'Authentication required' };
      }

      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, 'write');
      logger.debug('Permissions validated for createMany', { permissions });

      // Get the Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error('Model not found', { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }

      // Filter input data based on permissions and add metadata
      filteredData = data.map((item) => {
        const filtered = PermissionService.filterFieldsByPermission(item, permissions);
        return {
          ...filtered,
          created_by: context.user?.id,
          modified_by: context.user?.id,
          org_id: context.user?.org_id // Add org_id to each record
        };
      });

      // Execute batch create
      const result = await model.createMany({
        data: filteredData
      });

      logger.debug('Data created successfully', {
        model: modelName,
        count: result.count
      });

      return {
        success: true,
        data: { count: result.count } as T
      };
    } catch (error) {
      const batchForLog = filteredData.length > 0 ? filteredData : data;
      logger.error(
        'Error in createMany',
        await buildCreateManyErrorLogPayload({
          prisma: this.prisma,
          modelName,
          orgId: context.user?.org_id,
          error,
          batchRecords: batchForLog
        })
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async updateMany<T = { count: number }>(
    modelName: string,
    context: AuthContext,
    payload: { ids: any[]; data: Record<string, unknown> },
    options: { select?: any } = {}
  ): Promise<DataAccessResult<T>> {
    logger.debug("DataAccessLayer.updateMany called", {
      model: modelName,
      idsCount: payload.ids?.length || 0,
      options,
      user: context.user?.id,
    });
    try {
      // Require authentication
      if (!context.user) {
        logger.warn("No user context found for updateMany");
        return { success: false, error: "Authentication required" };
      }
      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, "write");
      logger.debug("Permissions validated for updateMany", { permissions });
      // Get Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error("Model not found", { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }
      // Filter allowed fields
      const filteredUpdate = PermissionService.filterFieldsByPermission(
        payload.data,
        permissions
      );
      const updateData = {
        ...filteredUpdate,
        modified_by: context.user?.id,
      };
      // Build query options
      const queryOptions: any = {
        where: { id: { in: payload.ids } }
      };
      // Add org filter to where clause
      const filteredOptions = this.addOrgFilter(modelName, queryOptions, context);
      // Execute batch update
      const result = await model.updateMany({
        where: filteredOptions.where,
        data: updateData,
      });
      logger.debug("Data updated successfully", {
        model: modelName,
        count: result.count,
      });
      return {
        success: true,
        data: { count: result.count } as T,
      };
    } catch (error: any) {
      logger.error("Error in updateMany", {
        model: modelName,
        error: error instanceof Error ? error.message : "Unknown error",
        idsCount: payload.ids?.length || 0,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async deleteMany<T = any>(
    modelName: string,
    context: AuthContext,
    payload: { ids: any[] },
    options: { select?: any } = {}
  ): Promise<DataAccessResult<T>> {
    logger.debug("DataAccessLayer.deleteMany called", {
      model: modelName,
      idsCount: payload.ids?.length || 0,
      options,
      user: context.user?.id,
    });
    try {
      // Require authentication
      if (!context.user) {
        logger.warn("No user context found for deleteMany");
        return { success: false, error: "Authentication required" };
      }
      // Validate permissions
      const permissions = this.validatePermissions(context, modelName, "write");
      logger.debug("Permissions validated for deleteMany", { permissions });
      // Get Prisma model
      const model = this.getModel(modelName);
      if (!model) {
        logger.error("Model not found", { model: modelName });
        return { success: false, error: `Model ${modelName} not found` };
      }
      // Perform deletion
      await model.deleteMany({
        where: { id: { in: payload } },
      });
      // Fetch remaining records (excluding deleted ones)
      const remainingRecords = await model.findMany({
        where: {
          id: { notIn: payload.ids },
        },
        select: options.select,
      });
      logger.debug("Records deleted and remaining data fetched", {
        model: modelName,
        remainingCount: remainingRecords.length,
      });
      return {
        success: true,
        data: remainingRecords as T,
      };
    } catch (error: any) {
      logger.error("Error in deleteMany", {
        model: modelName,
        error: error instanceof Error ? error.message : "Unknown error",
        idsCount: payload.ids?.length || 0,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }


} 