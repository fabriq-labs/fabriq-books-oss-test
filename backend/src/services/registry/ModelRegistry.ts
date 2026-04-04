import logger from '../../utils/logger';
import { PrismaSchemaParser } from '../../utils/PrismaSchemaParser';

export const SYSTEM_FIELDS = [
  'id',
  'created_at',
  'modified_at',
  'org_id',
  'assigned_to',
  'status',
  'created_by',
  'updated_by',
  'modified_by',
  'wf_instance_id'
];

export interface FieldDefinition {
  name: string;
  type: 'string' | 'int' | 'float' | 'boolean' | 'id' | 'datetime';
  isRequired: boolean;
  isUnique: boolean;
  defaultValue?: any;
}

export interface RelationshipDefinition {
  type: 'one-to-many' | 'many-to-one';
  target: string;
  field: string;
  foreignKey: string;
}

export interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  relationships: RelationshipDefinition[];
}

export interface ModelMetadata {
  name: string;
  description: string;
  businessContext: string;
  examples: string[];
  synonyms: string[];
  fields: FieldDefinition[];
  relationships: RelationshipDefinition[];
  requiredFields: string[];
}

export class ModelRegistry {
  private static instance: ModelRegistry;
  private registry: Record<string, ModelMetadata>;
  private schemaParser: PrismaSchemaParser;

  private constructor() {
    this.schemaParser = new PrismaSchemaParser();
    this.registry = this.loadRegistry();
  }

  private loadRegistry(): Record<string, ModelMetadata> {
    try {
      // Load model definitions from Prisma schema
      const entityDefinitions = this.schemaParser.parseModels();

      // Load business metadata from JSON config
      const registryData = require('../../config/model-registry.json');
      const businessMetadata = registryData.models;

      // Merge schema and business metadata
      const mergedRegistry: Record<string, ModelMetadata> = {};

      for (const entity of entityDefinitions) {
        const businessMeta = businessMetadata[entity.name];
        if (!businessMeta) {
          logger.debug(`No business metadata found for model ${entity.name}`);
          continue;
        }

        // Filter out system fields from required fields
        const requiredFields = entity.fields
          .filter(field => field.isRequired && !SYSTEM_FIELDS.includes(field.name))
          .map(field => field.name);

        mergedRegistry[entity.name] = {
          ...businessMeta,
          fields: entity.fields,
          relationships: entity.relationships,
          requiredFields
        };
      }

      logger.info('Model registry loaded successfully', {
        modelCount: Object.keys(mergedRegistry).length
      });

      return mergedRegistry;
    } catch (error) {
      logger.error('Failed to load model registry', error);
      return {};
    }
  }

  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  public getAccessibleModels(permissions: Record<string, any>): ModelMetadata[] {
    return Object.entries(this.registry)
      .filter(([modelName]) =>
        permissions[modelName] &&
        (permissions[modelName]['*'] === 'read' || permissions[modelName]['*'] === 'write')
      )
      .map(([_, metadata]) => metadata);
  }

  public getModelMetadata(modelName: string): ModelMetadata | null {
    return this.registry[modelName] || null;
  }

  public getAllModels(): ModelMetadata[] {
    return Object.values(this.registry);
  }

  public getRequiredFields(modelName: string): string[] {
    const metadata = this.getModelMetadata(modelName);
    return metadata?.requiredFields || [];
  }

  public getFieldType(modelName: string, fieldName: string): string | null {
    const metadata = this.getModelMetadata(modelName);
    const field = metadata?.fields.find(f => f.name === fieldName);
    return field?.type || null;
  }

  public reload(): void {
    this.registry = this.loadRegistry();
    logger.info('Model registry reloaded');
  }
} 