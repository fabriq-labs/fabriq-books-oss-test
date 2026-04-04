/**
 * Types for Datagraph Builder
 *
 * These types support the visual datagraph builder that allows admins
 * to configure view data_graphs without writing JSON manually.
 */

// ============================================================================
// Backend Schema Types (from /api/models/:modelName/schema)
// ============================================================================

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

// ============================================================================
// Datagraph Field Configuration Types
// ============================================================================

export type PermissionType = 'read' | 'update';

export type ColumnType = 'text' | 'select' | 'checkbox' | 'date' | 'int' | 'number' | 'currency';

export type SearchOperation = 'startswith' | 'contains' | 'equals';

export type ListPropsType = 'badge' | 'text' | 'icon';

export type ListPropsColor = 'blue' | 'green' | 'red' | 'yellow' | 'gray';

export interface SelectProps {
  type: string;
  instanceType: string;
  instanceKey: string;
  instanceLabel: string;
  instanceSourceKey: string;
  searchParams: string;
  limit: string;
}

export interface TableProps {
  width?: string;
  columnType?: ColumnType;
  defaultValue?: string;
  selectProps?: SelectProps;
}

export interface SearchProps {
  isSearch: boolean;
  operation?: SearchOperation;
}

export interface ListProps {
  type?: ListPropsType;
  color?: ListPropsColor;
}

// ============================================================================
// Merged Field Types (Schema + Datagraph State)
// ============================================================================

/**
 * Merged scalar field - combines schema info with datagraph config
 */
export interface MergedScalarField {
  // From schema (read-only)
  name: string;
  type: string;
  schemaRequired: boolean;
  isId: boolean;
  isList: boolean;
  hasDefaultValue: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;

  // Datagraph configuration (editable)
  included: boolean;
  permission?: PermissionType;
  displayName?: string;
  required?: boolean;
  isColumnShow?: boolean;
  tableProps?: TableProps;
  searchProps?: SearchProps;
  listProps?: ListProps;
  orderNo?: number;
}

/**
 * Merged relation field - combines schema info with datagraph config
 */
export interface MergedRelation {
  // From schema (read-only)
  name: string;
  type: string;
  relationType: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
  isList: boolean;
  schemaRequired: boolean;
  foreignKey: string | null;
  relationFromFields: readonly string[];
  relationToFields: readonly string[];

  // Datagraph configuration (editable)
  included: boolean;
  select?: Record<string, any>;
  displayName?: string;
  isColumnShow?: boolean;
  required?: boolean;
}

// ============================================================================
// Datagraph JSON Structure Types
// ============================================================================

/**
 * Scalar field config as stored in datagraph JSON
 */
export interface DatagraphScalarFieldConfig {
  dataType?: string;
  datatype?: string; // Legacy variant
  permission?: PermissionType;
  displayName?: string;
  required?: boolean;
  isColumnShow?: boolean;
  tableProps?: TableProps;
  searchProps?: SearchProps;
  listProps?: ListProps;
  orderNo?: number;
}

/**
 * Relation config as stored in datagraph JSON
 */
export interface DatagraphRelationConfig {
  type?: 'table';
  dataType?: 'table';
  select?: Record<string, any>;
  displayName?: string;
  isColumnShow?: boolean;
  required?: boolean;
}

/**
 * Complete datagraph object
 */
export type DatagraphConfig = Record<string, DatagraphScalarFieldConfig | DatagraphRelationConfig>;

// ============================================================================
// Component Props Types
// ============================================================================

export interface DatagraphBuilderProps {
  modelName: string;
  value: DatagraphConfig;
  onChange: (datagraph: DatagraphConfig) => void;
  disabled?: boolean;
}

export interface ScalarFieldsTableProps {
  fields: MergedScalarField[];
  onChange: (fieldName: string, updates: Partial<MergedScalarField>) => void;
  disabled?: boolean;
}

export interface RelationsTableProps {
  relations: MergedRelation[];
  onChange: (relationName: string, updates: Partial<MergedRelation>) => void;
  modelName: string;
  disabled?: boolean;
}

export interface RelationConfigModalProps {
  open: boolean;
  onClose: () => void;
  relation: MergedRelation;
  onSave: (select: Record<string, any>) => void;
  path: string[]; // Track nesting depth, e.g., ["supplier", "items", "product"]
  maxDepth?: number;
}

export interface JsonPreviewPanelProps {
  datagraph: DatagraphConfig;
  onClose: () => void;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ModelSchemaResponse {
  success: boolean;
  data: ModelSchema;
  error?: string;
}
