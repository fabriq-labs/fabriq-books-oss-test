import { GraphQLSchema, GraphQLObjectType, GraphQLList, GraphQLNonNull, GraphQLInputObjectType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLScalarType } from 'graphql';
import { ModelRegistry, EntityDefinition } from '../models/ModelRegistry';
import logger from '../utils/logger';
import { PermissionService } from '../services/permissions/PermissionService';
import { DataAccessLayer } from '../services/dal/DataAccessLayer';
import prisma from '../lib/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthContext } from '../auth/types';

type PrismaModels = {
  [K in keyof PrismaClient]: PrismaClient[K] extends { findMany: Function } ? K : never;
}[Extract<keyof PrismaClient, string>];

interface ResolverContext {
  id?: string;
  input?: Record<string, any>;
  user?: any;
  permissions?: { [model: string]: { [field: string]: 'read' | 'write' | 'none' } };
}

export class SchemaBuilder {
  private modelRegistry: ModelRegistry;
  private dal: DataAccessLayer;

  constructor() {
    this.modelRegistry = ModelRegistry.getInstance();
    this.dal = DataAccessLayer.getInstance(prisma);
  }

  private isJunctionTable(entityName: string): boolean {
    const entity = this.modelRegistry.getEntityDefinition(entityName);
    if (!entity) return false;

    // Check if this is a junction table (has exactly two many-to-many relationships)
    const manyToManyRelations = entity.relationships?.filter(rel => 
      rel.type === 'many-to-many'
    ) || [];
    return manyToManyRelations.length === 2;
  }

  buildSchema(): GraphQLSchema {
    const queryType = this.buildQueryType();
    const mutationType = this.buildMutationType();

    return new GraphQLSchema({
      query: queryType,
      mutation: mutationType
    });
  }

  private buildFieldSelection(selectionSet: any): Record<string, any> {
    return selectionSet.selections
      .filter((selection: any) => selection.kind === 'Field')
      .reduce((acc: any, selection: any) => {
        if (selection.selectionSet) {
          // Has nested fields
          acc[selection.name.value] = {
            select: this.buildFieldSelection(selection.selectionSet)
          };
        } else {
          // Scalar field
          acc[selection.name.value] = true;
        }
        return acc;
      }, {});
  }

  private buildQueryType(): GraphQLObjectType {
    const fields: any = {};

    this.modelRegistry.getAllEntityNames().forEach(entityName => {
      // Skip junction tables in queries
      if (this.isJunctionTable(entityName)) return;

      const entityType = this.modelRegistry.getGraphQLType(entityName);
      if (!entityType) return;

      // Query for all entities
      fields[`all${entityName}s`] = {
        type: new GraphQLList(entityType),
        resolve: async (_: unknown, __: unknown, context: ResolverContext, info: any) => {
          logger.debug('Starting resolver execution', {
            entity: entityName,
            operation: 'all',
            context: {
              user: context.user?.id,
              hasPermissions: !!context.permissions
            }
          });

          // Build nested field selection
          const select = this.buildFieldSelection(info.fieldNodes[0].selectionSet);
          
          logger.debug('Field selection', { 
            entity: entityName,
            select 
          });

          // Validate permissions for all selected fields (including nested)
          if (context.user) {
            const permissions = PermissionService.validatePermissions(context as AuthContext, entityName, 'read');
            this.validateNestedPermissions(select, permissions, entityName, context);
          }

          const result = await this.dal.findMany(entityName, context as AuthContext, { select });
          
          if (!result.success) {
            logger.error('Data fetch failed', {
              error: result.error,
              entity: entityName
            });
            throw new Error(result.error || 'Failed to fetch data');
          }

          return result.data;
        }
      };

      // Query for single entity by ID
      fields[entityName.toLowerCase()] = {
        type: entityType,
        args: {
          id: { type: GraphQLString }
        },
        resolve: async (_: unknown, args: { id: string }, context: ResolverContext, info: any) => {
          logger.info('Starting user query resolver', {
            entity: entityName,
            args,
            context: {
              user: context.user?.id,
              hasPermissions: !!context.permissions
            }
          });

          // Get requested fields from the query
          const requestedFields = info.fieldNodes[0].selectionSet.selections
            .filter((selection: any) => selection.kind === 'Field')
            .reduce((acc: any, selection: any) => {
              const fieldName = selection.name.value;
              // Handle relationship fields
              if (selection.selectionSet) {
                acc[fieldName] = {
                  select: selection.selectionSet.selections
                    .filter((nested: any) => nested.kind === 'Field')
                    .reduce((nestedAcc: any, nested: any) => {
                      if (nested.selectionSet) {
                        nestedAcc[nested.name.value] = {
                          select: Object.fromEntries(
                            nested.selectionSet.selections
                              .filter((deep: any) => deep.kind === 'Field')
                              .map((deep: any) => [deep.name.value, true])
                          )
                        };
                      } else {
                        nestedAcc[nested.name.value] = true;
                      }
                      return nestedAcc;
                    }, {})
                };
              } else {
                acc[fieldName] = true;
              }
              return acc;
            }, {});

          const result = await this.dal.findUnique(entityName, context as AuthContext, args.id, { select: requestedFields });          
          
          if (!result.success) {
            logger.error('Data fetch failed', {
              error: result.error,
              entity: entityName,
              id: args.id
            });
            throw new Error(result.error || 'Failed to fetch data');
          }

          return result.data;
        }
      };
    });

    return new GraphQLObjectType({
      name: 'Query',
      fields
    });
  }

  private validateNestedPermissions(
    select: Record<string, any>, 
    permissions: { [field: string]: 'read' | 'write' | 'none' },
    entityName: string,
    context: ResolverContext
  ) {
    Object.keys(select).forEach(field => {
      if (select[field] === true) {
        PermissionService.validateFieldPermissions([field], permissions);
      } else if (typeof select[field] === 'object' && select[field].select) {
        // Get related entity definition for nested permissions
        const entity = this.modelRegistry.getEntityDefinition(entityName);
        const relation = entity?.relationships?.find(r => field.toLowerCase() === r.target.toLowerCase());
        if (relation) {
          const nestedPermissions = PermissionService.validatePermissions(
            context as AuthContext, 
            relation.target, 
            'read'
          );
          this.validateNestedPermissions(
            select[field].select,
            nestedPermissions,
            relation.target,
            context
          );
        }
      }
    });
  }

  private buildMutationType(): GraphQLObjectType {
    const fields: any = {};

    this.modelRegistry.getAllEntityNames().forEach(entityName => {
      // Skip junction tables in mutations
      if (this.isJunctionTable(entityName)) return;

      const entityType = this.modelRegistry.getGraphQLType(entityName);
      if (!entityType) return;

      const createInputType = this.createInputType(entityName, true);
      const updateInputType = this.createInputType(entityName, false);
      if (!createInputType || !updateInputType) return;

      // Create mutation
      fields[`create${entityName}`] = {
        type: entityType,
        args: {
          input: { type: new GraphQLNonNull(createInputType) }
        },
        resolve: async (_: unknown, args: { input: any }, context: ResolverContext, info: any) => {
          logger.info('Starting create mutation resolver', {
            entity: entityName,
            input: args.input,
            context: {
              user: context.user?.id,
              hasPermissions: !!context.permissions
            }
          });

          // Get requested fields from the query
          const requestedFields = info.fieldNodes[0].selectionSet.selections
            .filter((selection: any) => selection.kind === 'Field')
            .reduce((acc: any, selection: any) => {
              if (selection.selectionSet) {
                // Handle nested selections
                acc[selection.name.value] = {
                  select: selection.selectionSet.selections
                    .filter((nested: any) => nested.kind === 'Field')
                    .reduce((nestedAcc: any, nested: any) => {
                      if (nested.selectionSet) {
                        nestedAcc[nested.name.value] = {
                          select: Object.fromEntries(
                            nested.selectionSet.selections
                              .filter((deep: any) => deep.kind === 'Field')
                              .map((deep: any) => [deep.name.value, true])
                          )
                        };
                      } else {
                        nestedAcc[nested.name.value] = true;
                      }
                      return nestedAcc;
                    }, {})
                };
              } else {
                acc[selection.name.value] = true;
              }
              return acc;
            }, {});

          logger.info('Requested fields', { 
            entity: entityName,
            fields: requestedFields 
          });

          // Validate permissions for requested fields
          if (context.user) {
            // logger.info('Validating permissions', {
            //   model: entityName,
            //   user: context.user.id,
            //   permissions: context.permissions
            // });
            
            try {
              const permissions = PermissionService.validatePermissions(context as AuthContext, entityName, 'write');            
              PermissionService.validateFieldPermissions(Object.keys(requestedFields), permissions);
            } catch (error: unknown) {
              logger.error('Permission validation failed', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                model: entityName,
                fields: Object.keys(requestedFields)
              });
              throw error;
            }
          } else {
            logger.warn('No user context found for permission validation');
          }

          // Create select object with only requested fields
          const select = Object.fromEntries(
            Object.keys(requestedFields).map((field: string) => [field, requestedFields[field]])
          );

          logger.info('Creating data', {
            entity: entityName,
            input: args.input,
            select
          });

          const result = await this.dal.create(entityName, context as AuthContext, args.input, { select }, prisma);
          
          if (!result.success) {
            logger.error('Data creation failed', {
              error: result.error,
              entity: entityName,
              input: args.input
            });
            throw new Error(result.error || 'Failed to create data');
          }

          // logger.info('Data created successfully', {
          //   entity: entityName,
          //   id: result.data?.id,
          //   data: result.data
          // });

          return result.data;
        }
      };

      // Update mutation
      fields[`update${entityName}`] = {
        type: entityType,
        args: {
          id: { type: new GraphQLNonNull(GraphQLString) },
          input: { type: new GraphQLNonNull(updateInputType) }
        },
        resolve: async (_: unknown, { id, input }: ResolverContext, context: ResolverContext) => {
          if (!id) throw new Error('ID is required');
          if (!input) throw new Error('Input is required');
          return this.dal.update(entityName, context as AuthContext, id, input);
        }
      };

      // Delete mutation
      fields[`delete${entityName}`] = {
        type: GraphQLBoolean,
        args: {
          id: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, { id }: ResolverContext, context: ResolverContext) => {
          if (!id) throw new Error('ID is required');
          await this.dal.delete(entityName, context as AuthContext, id);
          return true;
        }
      };
    });

    return new GraphQLObjectType({
      name: 'Mutation',
      fields
    });
  }

  private createInputType(entityName: string, isCreate: boolean): GraphQLInputObjectType | null {
    const entityDefinition = this.modelRegistry.getEntityDefinition(entityName);
    if (!entityDefinition) return null;

    // Skip creating input types for junction tables
    if (this.isJunctionTable(entityName)) return null;

    const fields: any = {};
    entityDefinition.fields.forEach(field => {
        // Skip timestamp fields and id field for create operations
        if (field.name === 'createdAt' || 
            field.name === 'updatedAt' || 
            (isCreate && field.name === 'id')) return;
        
        let inputType: GraphQLScalarType;
        switch (field.type) {
          case 'string':
            inputType = GraphQLString;
            break;
          case 'int':
            inputType = GraphQLInt;
            break;
          case 'float':
            inputType = GraphQLFloat;
            break;
          case 'boolean':
            inputType = GraphQLBoolean;
            break;
          case 'id':
            inputType = GraphQLString;
            break;
          default:
            inputType = GraphQLString; // Default to string if type is unknown
        }

        // For create operations, use the field's required status
        // For update operations, make all fields optional
        fields[field.name] = {
          type: isCreate && field.isRequired ? new GraphQLNonNull(inputType) : inputType
        };
    });

    // Add relationship fields
    if (entityDefinition.relationships) {
      entityDefinition.relationships.forEach(rel => {
        if (rel.type === 'many-to-one' || rel.type === 'one-to-one') {
          const foreignKey = rel.foreignKey || `${rel.target.toLowerCase()}Id`;
          fields[foreignKey] = {
            type: isCreate ? new GraphQLNonNull(GraphQLString) : GraphQLString
          };
        }
      });
    }

    // If no fields were added, return null to prevent creating an empty input type
    if (Object.keys(fields).length === 0) return null;

    return new GraphQLInputObjectType({
      name: isCreate ? `${entityName}CreateInput` : `${entityName}UpdateInput`,
      fields
    });
  }
} 