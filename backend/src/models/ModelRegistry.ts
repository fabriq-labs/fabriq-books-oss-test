import { GraphQLObjectType, GraphQLSchema, GraphQLString, GraphQLID, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLList } from 'graphql';
import { DateTimeResolver } from 'graphql-scalars';
import prisma from '../lib/prisma';

// Add this helper function to safely access Prisma models
function getPrismaModel(modelName: string) {
  return (prisma as any)[modelName.toLowerCase()];
}

export interface FieldDefinition {
  name: string;
  type: 'string' | 'int' | 'float' | 'boolean' | 'id' | 'datetime';
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: any;
}

export interface RelationshipDefinition {
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  target: string;
  field: string;
  foreignKey?: string;
}

export interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  relationships?: RelationshipDefinition[];
}

export class ModelRegistry {
  private static instance: ModelRegistry;
  private entityDefinitions: Map<string, EntityDefinition> = new Map();
  private graphqlTypes: Map<string, GraphQLObjectType> = new Map();

  private constructor() {}

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  registerEntity(definition: EntityDefinition): void {
    this.entityDefinitions.set(definition.name, definition);
    this.createGraphQLType(definition);
  }

  private createGraphQLType(definition: EntityDefinition): void {
    const fields = () => {
      const fieldConfig: any = {};
      
      // Add scalar fields
      definition.fields.forEach(field => {
        let graphqlType;
        switch (field.type) {
          case 'string':
            graphqlType = GraphQLString;
            break;
          case 'int':
            graphqlType = GraphQLInt;
            break;
          case 'float':
            graphqlType = GraphQLFloat;
            break;
          case 'boolean':
            graphqlType = GraphQLBoolean;
            break;
          case 'id':
            graphqlType = GraphQLID;
            break;
          case 'datetime':
            graphqlType = DateTimeResolver;
            break;
        }

        fieldConfig[field.name] = {
          type: field.isRequired ? graphqlType : graphqlType,
          description: `Field ${field.name} of type ${field.type}`
        };
      });

      // Add relationship fields
      if (definition.relationships) {
        definition.relationships.forEach(rel => {
          const targetType = this.graphqlTypes.get(rel.target);
          if (!targetType) return;

          fieldConfig[rel.field] = {
            type: rel.type === 'one-to-many' ? new GraphQLList(targetType) : targetType,
            resolve: (parent: any) => {
              // Just return the data that's already in the parent object
              return parent[rel.field];
            }
          };
        });
      }

      return fieldConfig;
    };

    const type = new GraphQLObjectType({
      name: definition.name,
      fields
    });

    this.graphqlTypes.set(definition.name, type);
  }

  getEntityDefinition(name: string): EntityDefinition | undefined {
    return this.entityDefinitions.get(name);
  }

  getGraphQLType(name: string): GraphQLObjectType | undefined {
    return this.graphqlTypes.get(name);
  }

  getAllEntityNames(): string[] {
    return Array.from(this.entityDefinitions.keys());
  }
}