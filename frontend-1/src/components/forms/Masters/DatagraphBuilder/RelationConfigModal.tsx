/**
 * RelationConfigModal - Modal for configuring nested relation select fields
 *
 * Allows users to select which fields from the related model to include
 * in the relation's select clause.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { RelationConfigModalProps, PermissionType } from './types';
import { useModelSchema } from './hooks';

interface NestedFieldConfig {
  name: string;
  type: string;
  included: boolean;
  permission: PermissionType;
}

export const RelationConfigModal: React.FC<RelationConfigModalProps> = ({
  open,
  onClose,
  relation,
  onSave,
  path,
  maxDepth = 2,
}) => {
  const { schema, loading, error } = useModelSchema(relation.type);
  const [fieldConfigs, setFieldConfigs] = useState<NestedFieldConfig[]>([]);

  // Initialize field configs from existing select or schema
  useEffect(() => {
    if (!schema) return;

    const existingSelect = relation.select || {};

    const configs = schema.scalarFields.map((field) => {
      const existingConfig = existingSelect[field.name];
      const isIncluded = existingConfig !== undefined;

      return {
        name: field.name,
        type: field.type,
        included: isIncluded,
        permission: (typeof existingConfig === 'string'
          ? existingConfig
          : 'read') as PermissionType,
      };
    });

    setFieldConfigs(configs);
  }, [schema, relation.select]);

  const handleFieldToggle = (fieldName: string, included: boolean) => {
    setFieldConfigs((prev) =>
      prev.map((f) =>
        f.name === fieldName ? { ...f, included } : f
      )
    );
  };

  const handlePermissionChange = (fieldName: string, permission: PermissionType) => {
    setFieldConfigs((prev) =>
      prev.map((f) =>
        f.name === fieldName ? { ...f, permission } : f
      )
    );
  };

  const handleSelectAll = () => {
    setFieldConfigs((prev) =>
      prev.map((f) => ({ ...f, included: true }))
    );
  };

  const handleSelectNone = () => {
    setFieldConfigs((prev) =>
      prev.map((f) => ({ ...f, included: false }))
    );
  };

  const handleSave = () => {
    const select: Record<string, string> = {};

    for (const config of fieldConfigs) {
      if (config.included) {
        select[config.name] = config.permission;
      }
    }

    onSave(select);
  };

  const includedCount = fieldConfigs.filter((f) => f.included).length;
  const isNestingTooDeep = path.length >= maxDepth;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Configure Relation: {relation.name}
          </DialogTitle>
          <DialogDescription>
            <div className="flex items-center gap-1 text-xs">
              {path.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span>{p}</span>
                </React.Fragment>
              ))}
              <ChevronRight className="h-3 w-3" />
              <span className="font-medium">{relation.name}</span>
              <span className="text-muted-foreground">({relation.type})</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-[200px] w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load schema for {relation.type}: {error}
              </AlertDescription>
            </Alert>
          ) : isNestingTooDeep ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Maximum nesting depth ({maxDepth}) reached. Deeper relations cannot be configured.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {includedCount} of {fieldConfigs.length} fields selected
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectNone}>
                    Select None
                  </Button>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px]">Include</TableHead>
                      <TableHead>Field Name</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead className="w-[120px]">Permission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fieldConfigs.map((config) => (
                      <TableRow
                        key={config.name}
                        className={!config.included ? 'opacity-50' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={config.included}
                            onCheckedChange={(checked) =>
                              handleFieldToggle(config.name, !!checked)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {config.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {config.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={config.permission}
                            onValueChange={(value) =>
                              handlePermissionChange(
                                config.name,
                                value as PermissionType
                              )
                            }
                            disabled={!config.included}
                          >
                            <SelectTrigger className="h-8 w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="read">Read</SelectItem>
                              <SelectItem value="update">Update</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {schema && schema.relations.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  Note: Nested relations from {relation.type} are not shown.
                  Configure them separately if needed.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading || !!error}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RelationConfigModal;
