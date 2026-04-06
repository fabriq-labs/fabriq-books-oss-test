/**
 * Utility functions for Datagraph Builder
 *
 * These functions handle:
 * - Merging model schema with existing datagraph configuration
 * - Generating datagraph JSON from UI table state
 * - Converting between formats
 */

import {
  ScalarFieldSchema,
  RelationSchema,
  MergedScalarField,
  MergedRelation,
  DatagraphConfig,
  DatagraphScalarFieldConfig,
  DatagraphRelationConfig,
  PermissionType,
} from './types';

/**
 * Convert field name to display name
 * e.g., "supplier_name" -> "Supplier Name"
 */
export function toDisplayName(fieldName: string): string {
  return fieldName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Determine default permission based on field characteristics
 */
export function getDefaultPermission(field: ScalarFieldSchema): PermissionType {
  // ID fields and auto-generated fields should be read-only
  if (field.isId || field.isUpdatedAt || field.name === 'created_at' || field.name === 'modified_at') {
    return 'read';
  }
  return 'update';
}

/**
 * Check if a datagraph entry is a relation (has select or type: "table")
 */
export function isRelationConfig(config: any): config is DatagraphRelationConfig {
  if (!config || typeof config !== 'object') return false;
  return config.type === 'table' || config.dataType === 'table' || config.select !== undefined;
}

/**
 * Merge schema scalar fields with existing datagraph configuration
 *
 * For each field in the schema:
 * - If it exists in datagraph, merge the config and mark as included
 * - If it doesn't exist in datagraph, use schema defaults and mark as not included
 */
export function mergeScalarFieldsWithDatagraph(
  schemaFields: ScalarFieldSchema[],
  datagraph: DatagraphConfig
): MergedScalarField[] {
  return schemaFields.map(field => {
    const datagraphField = datagraph[field.name] as DatagraphScalarFieldConfig | undefined;
    const isIncluded = datagraphField !== undefined && !isRelationConfig(datagraphField);

    return {
      // Schema properties (read-only)
      name: field.name,
      type: field.type,
      schemaRequired: field.isRequired,
      isId: field.isId,
      isList: field.isList,
      hasDefaultValue: field.hasDefaultValue,
      isUnique: field.isUnique,
      isUpdatedAt: field.isUpdatedAt,

      // Datagraph properties (editable)
      included: isIncluded,
      permission: isIncluded ? datagraphField?.permission : getDefaultPermission(field),
      displayName: isIncluded ? datagraphField?.displayName : toDisplayName(field.name),
      required: isIncluded ? datagraphField?.required : field.isRequired,
      isColumnShow: isIncluded ? datagraphField?.isColumnShow : false,
      tableProps: isIncluded ? datagraphField?.tableProps : undefined,
      searchProps: isIncluded ? datagraphField?.searchProps : undefined,
      listProps: isIncluded ? datagraphField?.listProps : undefined,
      orderNo: isIncluded ? datagraphField?.orderNo : undefined,
    };
  });
}

/**
 * Merge schema relations with existing datagraph configuration
 */
export function mergeRelationsWithDatagraph(
  schemaRelations: RelationSchema[],
  datagraph: DatagraphConfig
): MergedRelation[] {
  return schemaRelations.map(relation => {
    const datagraphRelation = datagraph[relation.name] as DatagraphRelationConfig | undefined;
    const isIncluded = datagraphRelation !== undefined && isRelationConfig(datagraphRelation);

    return {
      // Schema properties (read-only)
      name: relation.name,
      type: relation.type,
      relationType: relation.relationType,
      isList: relation.isList,
      schemaRequired: relation.isRequired,
      foreignKey: relation.foreignKey,
      relationFromFields: relation.relationFromFields,
      relationToFields: relation.relationToFields,

      // Datagraph properties (editable)
      included: isIncluded,
      select: isIncluded ? datagraphRelation?.select : undefined,
      displayName: isIncluded ? datagraphRelation?.displayName : toDisplayName(relation.name),
      isColumnShow: isIncluded ? datagraphRelation?.isColumnShow : false,
      required: isIncluded ? datagraphRelation?.required : false,
    };
  });
}

/**
 * Generate datagraph JSON from merged field/relation state
 *
 * Only includes fields/relations that are marked as "included"
 */
export function generateDatagraphFromMerged(
  fields: MergedScalarField[],
  relations: MergedRelation[]
): DatagraphConfig {
  const datagraph: DatagraphConfig = {};

  // Process scalar fields
  for (const field of fields) {
    if (!field.included) continue;

    const fieldConfig: DatagraphScalarFieldConfig = {};

    // Use dataType (camelCase) as the canonical form
    if (field.type) {
      fieldConfig.dataType = field.type.toLowerCase();
    }

    if (field.permission) {
      fieldConfig.permission = field.permission;
    }

    if (field.displayName) {
      fieldConfig.displayName = field.displayName;
    }

    if (field.required !== undefined) {
      fieldConfig.required = field.required;
    }

    if (field.isColumnShow !== undefined) {
      fieldConfig.isColumnShow = field.isColumnShow;
    }

    if (field.tableProps && Object.keys(field.tableProps).length > 0) {
      fieldConfig.tableProps = field.tableProps;
    }

    if (field.searchProps && Object.keys(field.searchProps).length > 0) {
      fieldConfig.searchProps = field.searchProps;
    }

    if (field.listProps && Object.keys(field.listProps).length > 0) {
      fieldConfig.listProps = field.listProps;
    }

    if (field.orderNo !== undefined) {
      fieldConfig.orderNo = field.orderNo;
    }

    datagraph[field.name] = fieldConfig;
  }

  // Process relations
  for (const relation of relations) {
    if (!relation.included) continue;

    const relationConfig: DatagraphRelationConfig = {
      type: 'table',
      dataType: 'table',
    };

    if (relation.select && Object.keys(relation.select).length > 0) {
      relationConfig.select = relation.select;
    }

    if (relation.displayName) {
      relationConfig.displayName = relation.displayName;
    }

    if (relation.isColumnShow !== undefined) {
      relationConfig.isColumnShow = relation.isColumnShow;
    }

    if (relation.required !== undefined) {
      relationConfig.required = relation.required;
    }

    datagraph[relation.name] = relationConfig;
  }

  return datagraph;
}

/**
 * Validate that a datagraph has at least one included field
 */
export function validateDatagraph(datagraph: DatagraphConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const fieldCount = Object.keys(datagraph).length;

  if (fieldCount === 0) {
    errors.push('Datagraph must include at least one field or relation');
  }

  // Check if ID field is included (warning, not error)
  const hasIdField = Object.keys(datagraph).some(key => key === 'id');
  if (!hasIdField) {
    // This is a warning, but we'll include it for now
    // errors.push('Warning: ID field is not included in the datagraph');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Deep clone a datagraph config
 */
export function cloneDatagraph(datagraph: DatagraphConfig): DatagraphConfig {
  return JSON.parse(JSON.stringify(datagraph));
}

/**
 * Get simple select config for a relation (id + label field)
 */
export function getDefaultRelationSelect(relationType: string): Record<string, string> {
  return {
    id: 'read',
    name: 'read',
  };
}

/**
 * Convert select object to nested datagraph format
 * Handles both simple permission strings and nested relation objects
 */
export function normalizeSelectConfig(select: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(select)) {
    if (typeof value === 'string') {
      // Simple permission: "read" or "update"
      normalized[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Nested relation with select
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Map Prisma type to column type for UI
 */
export function mapPrismaTypeToColumnType(prismaType: string): string {
  const typeMap: Record<string, string> = {
    String: 'text',
    Int: 'int',
    Float: 'number',
    Decimal: 'currency',
    Boolean: 'checkbox',
    DateTime: 'date',
    Json: 'text',
    BigInt: 'int',
  };

  return typeMap[prismaType] || 'text';
}
