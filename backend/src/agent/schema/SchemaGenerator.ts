import { z } from 'zod';
import { ModelRegistry, SYSTEM_FIELDS, FieldDefinition } from '../../services/registry/ModelRegistry';
import logger from '../../utils/logger';

export interface SchemaOptions {
    allFieldsOptional?: boolean;
}

/**
 * Maps Prisma field types to Zod types
 */
function mapFieldTypeToZod(fieldType: FieldDefinition['type']): z.ZodTypeAny {
    switch (fieldType) {
        case 'string':
            return z.string();
        case 'int':
            return z.number().int();
        case 'float':
            return z.number();
        case 'boolean':
            return z.boolean();
        case 'datetime':
            return z.string().describe('ISO datetime string (YYYY-MM-DDTHH:mm:ss.sssZ)');
        case 'id':
            return z.string().describe('UUID or ID string');
        default:
            return z.any();
    }
}

/**
 * Checks if a field should be excluded from the schema
 * Excludes system fields and auto-generated fields (with @default)
 */
function shouldExcludeField(field: FieldDefinition): boolean {
    const skipFields = [...SYSTEM_FIELDS, 'requester_department', 'requester'];
    // Exclude system fields
    if (skipFields.includes(field.name)) {
        return true;
    }

    // Exclude fields with auto-generated default values
    // These are typically: uuid(), now(), autoincrement(), etc.
    if (field.defaultValue !== undefined) {
        const defaultValue = String(field.defaultValue);
        // Check for common auto-generated patterns
        if (
            defaultValue.includes('uuid()') ||
            defaultValue.includes('now()') ||
            defaultValue.includes('autoincrement()') ||
            defaultValue.includes('gen_random_uuid()') ||
            defaultValue.includes('gen_random_uuid') ||
            defaultValue.includes('concat(') // For custom ID generation like 'preq_' || gen_random_uuid()
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Generates a Zod schema for model data fields
 * @param modelName - Name of the model
 * @param options - Schema generation options
 * @returns Zod object schema for the model's data fields
 */
export function generateModelDataSchema(
    modelName: string,
    options: SchemaOptions = { allFieldsOptional: false }
): z.ZodObject<any> {
    const modelRegistry = ModelRegistry.getInstance();
    const metadata = modelRegistry.getModelMetadata(modelName);

    if (!metadata) {
        logger.warn(`Model metadata not found for ${modelName}, returning passthrough schema`);
        return z.object({}).passthrough();
    }

    const schemaShape: Record<string, z.ZodTypeAny> = {};

    for (const field of metadata.fields) {
        // Skip excluded fields
        if (shouldExcludeField(field)) {
            continue;
        }

        // Map field type to Zod type
        let zodType = mapFieldTypeToZod(field.type);

        // Add description for better AI understanding
        const fieldDescription = `${field.type} field${field.isUnique ? ' (unique)' : ''}`;
        zodType = zodType.describe(fieldDescription);

        // Make optional if:
        // 1. Options specify all fields optional (for update operations)
        // 2. Field is not required in the model
        if (options.allFieldsOptional || !field.isRequired) {
            zodType = zodType.optional();
        }

        schemaShape[field.name] = zodType;
    }

    // return z.object(schemaShape).strict();
    return z.object(schemaShape).passthrough();
}

/**
 * Gets field descriptions for a model to help AI understand available fields
 */
export function getModelFieldDescriptions(modelName: string): string {
    const modelRegistry = ModelRegistry.getInstance();
    const metadata = modelRegistry.getModelMetadata(modelName);

    if (!metadata) {
        return '';
    }

    const fieldDescriptions: string[] = [];
    const requiredFields: string[] = [];
    const optionalFields: string[] = [];

    for (const field of metadata.fields) {
        if (shouldExcludeField(field)) {
            continue;
        }

        const fieldInfo = `${field.name} (${field.type}${field.isUnique ? ', unique' : ''})`;

        if (field.isRequired) {
            requiredFields.push(fieldInfo);
        } else {
            optionalFields.push(fieldInfo);
        }
    }

    if (requiredFields.length > 0) {
        fieldDescriptions.push(`Required fields: ${requiredFields.join(', ')}`);
    }
    if (optionalFields.length > 0) {
        fieldDescriptions.push(`Optional fields: ${optionalFields.join(', ')}`);
    }

    return fieldDescriptions.join('. ') || 'No fields available';
}



