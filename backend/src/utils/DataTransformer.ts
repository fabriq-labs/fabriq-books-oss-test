import { PrismaSchemaParser } from './PrismaSchemaParser';
import { EntityDefinition } from '../models/ModelRegistry';
import logger from './logger';

export class DataTransformer {
  private static instance: DataTransformer;
  private schemaParser: PrismaSchemaParser;
  private modelDefinitions: Map<string, EntityDefinition>;

  private constructor() {
    this.schemaParser = new PrismaSchemaParser();
    this.modelDefinitions = new Map();
    this.initializeModelDefinitions();
  }

  public static getInstance(): DataTransformer {
    if (!DataTransformer.instance) {
      DataTransformer.instance = new DataTransformer();
    }
    return DataTransformer.instance;
  }

  private initializeModelDefinitions() {
    const models = this.schemaParser.parseModels();
    models.forEach(model => {
      this.modelDefinitions.set(model.name.toLowerCase(), model);
    });
  }

  private getFieldType(modelName: string, fieldName: string, fieldsets?: Record<string, any>): string | null {
    // First check fieldsets metadata if available (more reliable for arrays)
    if (fieldsets && fieldsets[fieldName]) {
      const fieldMeta = fieldsets[fieldName];
      // Check if field has listProps (indicates array type)
      if (fieldMeta.listProps) {
        return 'array'; // Return 'array' type for fields with listProps
      }
      // Return datatype from metadata
      if (fieldMeta.datatype) {
        return fieldMeta.datatype;
      }
    }

    // Fallback to schema parser
    const model = this.modelDefinitions.get(modelName.toLowerCase());
    if (!model) {
      logger.warn(`Model ${modelName} not found in schema`);
      return null;
    }

    const field = model.fields.find(f => f.name === fieldName);
    return field?.type || null;
  }

  private transformValue(value: any, fieldType: string | null, fieldName?: string): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (!fieldType) {
      return value;
    }

    try {
      // Handle array types (detected from listProps in metadata)
      if (fieldType === 'array') {
        // Scalar relation IDs (e.g. account_id, credit_account_id): Prisma expects String | null, not array.
        // View may use listProps for UI; when writing to DB we must send a single id or null.
        //TODO: does this mean all foriegn keys should be named with _id?
        const isScalarRelationId = fieldName && fieldName.endsWith('_id');
        if (isScalarRelationId) {
          if (Array.isArray(value)) {
            return value.length === 0 ? null : value[0];
          }
          return value;
        }
        // If already an array, return as-is
        if (Array.isArray(value)) {
          return value;
        }
        // If string, split by comma and trim
        if (typeof value === 'string') {
          return value.split(',').map(item => item.trim()).filter(item => item !== '');
        }
        // If single value, wrap in array
        return [value];
      }

      switch (fieldType) {
        case 'datetime':
        case 'date':
          return this.transformDate(value);
        case 'float':
        case 'int':
          return this.transformNumber(value);
        case 'boolean':
          return this.transformBoolean(value);
        case 'string':
        case 'id':
          return String(value);
        default:
          return value;
      }
    } catch (error) {
      logger.error('Error transforming value', { value, fieldType, error });
      return value;
    }
  }

  private transformDate(value: string | Date): Date {
    if (value instanceof Date) {
      return value;
    }

    if (!value) {
      return new Date();
    }

    // Handle DD/MM/YYYY or DD-MM-YYYY format (common in CSV imports)
    if (
      typeof value === 'string' &&
      (/^\d{2}\/\d{2}\/\d{4}$/.test(value) || /^\d{2}-\d{2}-\d{4}$/.test(value))
    ) {
      const delimiter = value.includes('/') ? '/' : '-';
      const [day, month, year] = value.split(delimiter);
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${value}`);
      }
      return date;
    }

    // Handle other date formats
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${value}`);
    }

    return date;
  }

  private transformNumber(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const num = parseFloat(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number format: ${value}`);
    }

    return num;
  }

  private transformBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
        return true;
      }
      if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
        return false;
      }
    }

    throw new Error(`Invalid boolean format: ${value}`);
  }

  public transformRecord(modelName: string, record: Record<string, any>, fieldsets?: Record<string, any>): Record<string, any> {
    const transformed: Record<string, any> = {};

    for (const [fieldName, value] of Object.entries(record)) {
      const fieldType = this.getFieldType(modelName, fieldName, fieldsets);
      transformed[fieldName] = this.transformValue(value, fieldType, fieldName);
    }

    return transformed;
  }

  public transformRecords(modelName: string, records: Record<string, any>[], fieldsets?: Record<string, any>): Record<string, any>[] {
    return records.map(record => this.transformRecord(modelName, record, fieldsets));
  }
}