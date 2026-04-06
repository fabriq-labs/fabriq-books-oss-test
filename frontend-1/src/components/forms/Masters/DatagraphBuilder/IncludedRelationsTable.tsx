/**
 * IncludedRelationsTable - Compact table showing only included relations
 *
 * Shows a streamlined view of configured relations with configure button
 * and a remove button to quickly exclude relations.
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MergedRelation } from './types';
import { RelationConfigModal } from './RelationConfigModal';

interface IncludedRelationsTableProps {
  relations: MergedRelation[];
  onChange: (relationName: string, updates: Partial<MergedRelation>) => void;
  modelName: string;
  disabled?: boolean;
}

function getRelationTypeBadge(relationType: string): 'default' | 'secondary' | 'outline' {
  const typeMap: Record<string, 'default' | 'secondary' | 'outline'> = {
    oneToOne: 'outline',
    oneToMany: 'default',
    manyToOne: 'secondary',
    manyToMany: 'default',
  };
  return typeMap[relationType] || 'outline';
}

function formatRelationType(relationType: string): string {
  const typeMap: Record<string, string> = {
    oneToOne: '1:1',
    oneToMany: '1:N',
    manyToOne: 'N:1',
    manyToMany: 'N:N',
  };
  return typeMap[relationType] || relationType;
}

export const IncludedRelationsTable: React.FC<IncludedRelationsTableProps> = ({
  relations,
  onChange,
  modelName,
  disabled = false,
}) => {
  const [configModalRelation, setConfigModalRelation] = useState<MergedRelation | null>(null);

  // Filter to only show included relations
  const includedRelations = relations.filter(r => r.included);

  if (includedRelations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-md border-dashed">
        No relations included yet. Click "Add Relations" to select relations from the model schema.
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
              <TableHead className="w-[160px]">Relation</TableHead>
              <TableHead className="w-[70px]">Type</TableHead>
              <TableHead className="w-[120px]">Model</TableHead>
              <TableHead className="w-[160px]">Display Name</TableHead>
              <TableHead className="w-[60px] text-center">Show</TableHead>
              <TableHead className="w-[100px]">Fields</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {includedRelations.map((relation) => {
              const selectCount = relation.select ? Object.keys(relation.select).length : 0;

              return (
                <TableRow key={relation.name}>
                  {/* Relation Name */}
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[120px]" title={relation.name}>
                        {relation.name}
                      </span>
                      {relation.isList && (
                        <Badge variant="outline" className="text-[10px] px-1">[]</Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Relation Type */}
                  <TableCell>
                    <Badge
                      variant={getRelationTypeBadge(relation.relationType)}
                      className="text-[10px]"
                    >
                      {formatRelationType(relation.relationType)}
                    </Badge>
                  </TableCell>

                  {/* Related Model */}
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {relation.type}
                  </TableCell>

                  {/* Display Name */}
                  <TableCell>
                    <Input
                      value={relation.displayName || ''}
                      onChange={(e) => onChange(relation.name, { displayName: e.target.value })}
                      disabled={disabled}
                      className="h-7 text-xs"
                      placeholder="Display name"
                    />
                  </TableCell>

                  {/* Show in Column */}
                  <TableCell className="text-center">
                    <Checkbox
                      checked={relation.isColumnShow || false}
                      onCheckedChange={(checked) => onChange(relation.name, { isColumnShow: !!checked })}
                      disabled={disabled}
                    />
                  </TableCell>

                  {/* Configure Button */}
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigModalRelation(relation)}
                      disabled={disabled}
                      className="h-7 text-xs"
                    >
                      <Settings2 className="h-3 w-3 mr-1" />
                      {selectCount > 0 ? `${selectCount}` : 'Config'}
                    </Button>
                  </TableCell>

                  {/* Remove Button */}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(relation.name, { included: false })}
                      disabled={disabled}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Remove relation"
                    >
                      <X className="h-4 w-4" />
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

export default IncludedRelationsTable;
