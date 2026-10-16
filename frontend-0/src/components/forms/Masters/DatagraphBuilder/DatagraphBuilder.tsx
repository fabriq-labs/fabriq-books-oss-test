/**
 * DatagraphBuilder - Main component for visual datagraph editing
 *
 * Allows admin users to configure view datagraphs through a tabbed interface
 * with compact tables showing only included fields/relations and modals for adding more.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Eye, EyeOff, Plus, AlertCircle } from 'lucide-react';

import { IncludedFieldsTable } from './IncludedFieldsTable';
import { IncludedRelationsTable } from './IncludedRelationsTable';
import { AddFieldModal } from './AddFieldModal';
import { AddRelationModal } from './AddRelationModal';
import { JsonPreviewPanel } from './JsonPreviewPanel';
import { useDatagraphBuilder } from './hooks';
import { DatagraphBuilderProps } from './types';

export const DatagraphBuilder: React.FC<DatagraphBuilderProps> = ({
  modelName,
  value,
  onChange,
  disabled = false,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [showAddRelationModal, setShowAddRelationModal] = useState(false);
  const [activeTab, setActiveTab] = useState('fields');

  const {
    fields,
    relations,
    loading,
    error,
    updateField,
    updateRelation,
    getDatagraph,
    includeFields,
    includeRelations,
  } = useDatagraphBuilder(modelName, value, onChange);

  // Count included items
  const includedFieldCount = fields.filter(f => f.included).length;
  const includedRelationCount = relations.filter(r => r.included).length;
  const unincludedFieldCount = fields.filter(f => !f.included).length;
  const unincludedRelationCount = relations.filter(r => !r.included).length;

  if (!modelName) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Please select a model name first to configure the datagraph.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datagraph Builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load model schema: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Datagraph Builder</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configure which fields and relations are included in this view.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                Hide JSON
              </>
            ) : (
              <>
                <Code className="h-4 w-4 mr-1" />
                Preview JSON
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="fields">
                Fields
                {includedFieldCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded">
                    {includedFieldCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="relations">
                Relations
                {includedRelationCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded">
                    {includedRelationCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Add buttons based on active tab */}
            {activeTab === 'fields' && unincludedFieldCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddFieldModal(true)}
                disabled={disabled}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Fields ({unincludedFieldCount})
              </Button>
            )}
            {activeTab === 'relations' && unincludedRelationCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddRelationModal(true)}
                disabled={disabled}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Relations ({unincludedRelationCount})
              </Button>
            )}
          </div>

          <TabsContent value="fields" className="mt-4">
            <IncludedFieldsTable
              fields={fields}
              onChange={updateField}
              disabled={disabled}
            />
          </TabsContent>

          <TabsContent value="relations" className="mt-4">
            {relations.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center border rounded-md border-dashed">
                No relations available for this model.
              </div>
            ) : (
              <IncludedRelationsTable
                relations={relations}
                onChange={updateRelation}
                modelName={modelName}
                disabled={disabled}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* JSON Preview */}
        {showPreview && (
          <JsonPreviewPanel
            datagraph={getDatagraph()}
            onClose={() => setShowPreview(false)}
          />
        )}

        {/* Add Field Modal */}
        <AddFieldModal
          open={showAddFieldModal}
          onClose={() => setShowAddFieldModal(false)}
          fields={fields}
          onAddFields={includeFields}
        />

        {/* Add Relation Modal */}
        <AddRelationModal
          open={showAddRelationModal}
          onClose={() => setShowAddRelationModal(false)}
          relations={relations}
          onAddRelations={includeRelations}
        />
      </CardContent>
    </Card>
  );
};

export default DatagraphBuilder;
