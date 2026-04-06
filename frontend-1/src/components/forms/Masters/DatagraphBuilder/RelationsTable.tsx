/**
 * RelationsTable - Table component for relation configuration
 *
 * Displays all relations from the model schema and allows configuration
 * of nested select fields.
 */

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RelationsTableProps, MergedRelation } from './types';
import { RelationConfigModal } from './RelationConfigModal';

/**
 * Get badge color based on relation type
 */
function getRelationTypeBadge(relationType: string): 'default' | 'secondary' | 'outline' {
  const typeMap: Record<string, 'default' | 'secondary' | 'outline'> = {
    oneToOne: 'outline',
    oneToMany: 'default',
    manyToOne: 'secondary',
    manyToMany: 'default',
  };
  return typeMap[relationType] || 'outline';
}

/**
 * Format relation type for display
 */
function formatRelationType(relationType: string): string {
  const typeMap: Record<string, string> = {
    oneToOne: '1:1',
    oneToMany: '1:N',
    manyToOne: 'N:1',
    manyToMany: 'N:N',
  };
  return typeMap[relationType] || relationType;
}

export const RelationsTable: React.FC<RelationsTableProps> = ({
  relations,
  onChange,
  modelName,
  disabled = false,
}) => {
  const [configModalRelation, setConfigModalRelation] = useState<MergedRelation | null>(null);

  if (relations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
        No relations available for this model.
      </div>
    );
  }

  const handleConfigSave = (select: Record<string, any>) => {
    if (configModalRelation) {
      onChange(configModalRelation.name, { select });
      setConfigModalRelation(null);
    }
  };

  return (
    <>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[50px]">Include</TableHead>
              <TableHead className="w-[180px]">Relation Name</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[120px]">Related Model</TableHead>
              <TableHead className="w-[180px]">Display Name</TableHead>
              <TableHead className="w-[80px]">Show Col</TableHead>
              <TableHead className="w-[100px]">Configure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relations.map((relation) => {
              const isDisabled = disabled || !relation.included;
              const selectCount = relation.select ? Object.keys(relation.select).length : 0;

              return (
                <TableRow
                  key={relation.name}
                  className={cn(!relation.included && 'opacity-50 bg-muted/30')}
                >
                  {/* Include Checkbox */}
                  <TableCell>
                    <Checkbox
                      checked={relation.included}
                      onCheckedChange={(checked) =>
                        onChange(relation.name, { included: !!checked })
                      }
                      disabled={disabled}
                    />
                  </TableCell>

                  {/* Relation Name */}
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-2">
                      {relation.name}
                      {relation.isList && (
                        <Badge variant="outline" className="text-xs">
                          []
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Relation Type */}
                  <TableCell>
                    <Badge
                      variant={getRelationTypeBadge(relation.relationType)}
                      className="text-xs"
                    >
                      {formatRelationType(relation.relationType)}
                    </Badge>
                  </TableCell>

                  {/* Related Model */}
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {relation.type}
                  </TableCell>

                  {/* Display Name */}
                  <TableCell>
                    <Input
                      value={relation.displayName || ''}
                      onChange={(e) =>
                        onChange(relation.name, { displayName: e.target.value })
                      }
                      disabled={isDisabled}
                      className="h-8"
                      placeholder="Display name..."
                    />
                  </TableCell>

                  {/* Show in Column */}
                  <TableCell className="text-center">
                    <Checkbox
                      checked={relation.isColumnShow || false}
                      onCheckedChange={(checked) =>
                        onChange(relation.name, { isColumnShow: !!checked })
                      }
                      disabled={isDisabled}
                    />
                  </TableCell>

                  {/* Configure Button */}
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigModalRelation(relation)}
                      disabled={isDisabled}
                      className="h-8"
                    >
                      <Settings2 className="h-4 w-4 mr-1" />
                      {selectCount > 0 ? `${selectCount} fields` : 'Configure'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Relation Config Modal */}
      {configModalRelation && (
        <RelationConfigModal
          open={!!configModalRelation}
          onClose={() => setConfigModalRelation(null)}
          relation={configModalRelation}
          onSave={handleConfigSave}
          path={[modelName]}
        />
      )}
    </>
  );
};

export default RelationsTable;
