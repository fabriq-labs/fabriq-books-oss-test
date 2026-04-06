/**
 * Hooks for Datagraph Builder
 */

import { useState, useEffect, useCallback } from 'react';
import { modelSchemaAPI } from '@/api/api';
import {
  ModelSchema,
  MergedScalarField,
  MergedRelation,
  DatagraphConfig,
} from './types';
import {
  mergeScalarFieldsWithDatagraph,
  mergeRelationsWithDatagraph,
  generateDatagraphFromMerged,
} from './utils';

interface UseModelSchemaResult {
  schema: ModelSchema | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch model schema from the backend
 *
 * @param modelName - The Prisma model name (e.g., "supplier")
 * @returns Schema, loading state, and error state
 */
export function useModelSchema(modelName: string | undefined): UseModelSchemaResult {
  const [schema, setSchema] = useState<ModelSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = useCallback(async () => {
    if (!modelName) {
      setSchema(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await modelSchemaAPI.getSchema(modelName) as { success: boolean; data: ModelSchema; error?: string };

      if (response.success && response.data) {
        setSchema(response.data);
      } else {
        setError(response.error || 'Failed to fetch model schema');
        setSchema(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch model schema');
      setSchema(null);
    } finally {
      setLoading(false);
    }
  }, [modelName]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return {
    schema,
    loading,
    error,
    refetch: fetchSchema,
  };
}

interface UseDatagraphBuilderResult {
  // Merged state
  fields: MergedScalarField[];
  relations: MergedRelation[];

  // Loading/error states
  loading: boolean;
  error: string | null;

  // Actions
  updateField: (fieldName: string, updates: Partial<MergedScalarField>) => void;
  updateRelation: (relationName: string, updates: Partial<MergedRelation>) => void;
  getDatagraph: () => DatagraphConfig;
  includeAllFields: () => void;
  excludeAllFields: () => void;
  includeFields: (fieldNames: string[]) => void;
  includeRelations: (relationNames: string[]) => void;
}

/**
 * Hook to manage datagraph builder state
 *
 * Handles merging schema with existing datagraph and generating output
 *
 * @param modelName - The Prisma model name
 * @param initialDatagraph - Existing datagraph configuration (if editing)
 * @param onChange - Callback when datagraph changes
 */
export function useDatagraphBuilder(
  modelName: string | undefined,
  initialDatagraph: DatagraphConfig,
  onChange?: (datagraph: DatagraphConfig) => void
): UseDatagraphBuilderResult {
  const { schema, loading, error } = useModelSchema(modelName);

  const [fields, setFields] = useState<MergedScalarField[]>([]);
  const [relations, setRelations] = useState<MergedRelation[]>([]);

  // Merge schema with datagraph when schema loads
  useEffect(() => {
    if (!schema) {
      setFields([]);
      setRelations([]);
      return;
    }

    const mergedFields = mergeScalarFieldsWithDatagraph(
      schema.scalarFields,
      initialDatagraph
    );
    const mergedRelations = mergeRelationsWithDatagraph(
      schema.relations,
      initialDatagraph
    );

    setFields(mergedFields);
    setRelations(mergedRelations);
  }, [schema, initialDatagraph]);

  // Update a single field
  const updateField = useCallback((fieldName: string, updates: Partial<MergedScalarField>) => {
    setFields(prev => {
      const newFields = prev.map(f =>
        f.name === fieldName ? { ...f, ...updates } : f
      );

      // Trigger onChange with new datagraph
      if (onChange) {
        const newDatagraph = generateDatagraphFromMerged(newFields, relations);
        onChange(newDatagraph);
      }

      return newFields;
    });
  }, [relations, onChange]);

  // Update a single relation
  const updateRelation = useCallback((relationName: string, updates: Partial<MergedRelation>) => {
    setRelations(prev => {
      const newRelations = prev.map(r =>
        r.name === relationName ? { ...r, ...updates } : r
      );

      // Trigger onChange with new datagraph
      if (onChange) {
        const newDatagraph = generateDatagraphFromMerged(fields, newRelations);
        onChange(newDatagraph);
      }

      return newRelations;
    });
  }, [fields, onChange]);

  // Get current datagraph
  const getDatagraph = useCallback(() => {
    return generateDatagraphFromMerged(fields, relations);
  }, [fields, relations]);

  // Include all fields
  const includeAllFields = useCallback(() => {
    setFields(prev => {
      const newFields = prev.map(f => ({ ...f, included: true }));

      if (onChange) {
        const newDatagraph = generateDatagraphFromMerged(newFields, relations);
        onChange(newDatagraph);
      }

      return newFields;
    });
  }, [relations, onChange]);

  // Exclude all fields
  const excludeAllFields = useCallback(() => {
    setFields(prev => {
      const newFields = prev.map(f => ({ ...f, included: false }));

      if (onChange) {
        const newDatagraph = generateDatagraphFromMerged(newFields, relations);
        onChange(newDatagraph);
      }

      return newFields;
    });
  }, [relations, onChange]);

  // Include specific fields by name (batch)
  const includeFields = useCallback((fieldNames: string[]) => {
    setFields(prev => {
      const fieldSet = new Set(fieldNames);
      const newFields = prev.map(f =>
        fieldSet.has(f.name) ? { ...f, included: true } : f
      );

      if (onChange) {
        const newDatagraph = generateDatagraphFromMerged(newFields, relations);
        onChange(newDatagraph);
      }

      return newFields;
    });
  }, [relations, onChange]);

  // Include specific relations by name (batch)
  const includeRelations = useCallback((relationNames: string[]) => {
    setRelations(prev => {
      const relationSet = new Set(relationNames);
      const newRelations = prev.map(r =>
        relationSet.has(r.name) ? { ...r, included: true } : r
      );

      if (onChange) {
        const newDatagraph = generateDatagraphFromMerged(fields, newRelations);
        onChange(newDatagraph);
      }

      return newRelations;
    });
  }, [fields, onChange]);

  return {
    fields,
    relations,
    loading,
    error,
    updateField,
    updateRelation,
    getDatagraph,
    includeAllFields,
    excludeAllFields,
    includeFields,
    includeRelations,
  };
}
