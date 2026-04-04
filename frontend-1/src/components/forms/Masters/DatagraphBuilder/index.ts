/**
 * Datagraph Builder - Visual editor for view data_graph configuration
 *
 * Usage:
 * ```tsx
 * import { DatagraphBuilder } from '@/components/forms/Masters/DatagraphBuilder';
 *
 * <DatagraphBuilder
 *   modelName="supplier"
 *   value={existingDatagraph}
 *   onChange={(newDatagraph) => form.setValue('data_graph', newDatagraph)}
 * />
 * ```
 */

export { DatagraphBuilder } from './DatagraphBuilder';
export { IncludedFieldsTable } from './IncludedFieldsTable';
export { IncludedRelationsTable } from './IncludedRelationsTable';
export { AddFieldModal } from './AddFieldModal';
export { AddRelationModal } from './AddRelationModal';
export { RelationConfigModal } from './RelationConfigModal';
export { JsonPreviewPanel } from './JsonPreviewPanel';

// Legacy exports (may be removed in future)
export { ScalarFieldsTable } from './ScalarFieldsTable';
export { RelationsTable } from './RelationsTable';
export { FieldRow } from './FieldRow';

// Hooks
export { useModelSchema, useDatagraphBuilder } from './hooks';

// Utils
export {
  mergeScalarFieldsWithDatagraph,
  mergeRelationsWithDatagraph,
  generateDatagraphFromMerged,
  toDisplayName,
  validateDatagraph,
} from './utils';

// Types
export type {
  ModelSchema,
  ScalarFieldSchema,
  RelationSchema,
  MergedScalarField,
  MergedRelation,
  DatagraphConfig,
  DatagraphBuilderProps,
  PermissionType,
  ColumnType,
} from './types';
