/**
 * IncludedFieldsTable - Compact table showing only included scalar fields
 *
 * Shows a streamlined view of configured fields with inline editing
 * and a remove button to quickly exclude fields.
 */

import React from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MergedScalarField, PermissionType, ColumnType } from './types';
import { mapPrismaTypeToColumnType } from './utils';

interface IncludedFieldsTableProps {
  fields: MergedScalarField[];
  onChange: (fieldName: string, updates: Partial<MergedScalarField>) => void;
  disabled?: boolean;
}

const PERMISSION_OPTIONS: { value: PermissionType; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'update', label: 'Update' },
];

const COLUMN_TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'int', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
];

function getTypeBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  const typeMap: Record<string, 'default' | 'secondary' | 'outline'> = {
    String: 'outline',
    Int: 'secondary',
    Float: 'secondary',
    Decimal: 'secondary',
    Boolean: 'default',
    DateTime: 'default',
    Json: 'outline',
  };
  return typeMap[type] || 'outline';
}

export const IncludedFieldsTable: React.FC<IncludedFieldsTableProps> = ({
  fields,
  onChange,
  disabled = false,
}) => {
  // Filter to only show included fields
  const includedFields = fields.filter(f => f.included);

  if (includedFields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-md border-dashed">
        No fields included yet. Click "Add Fields" to select fields from the model schema.
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[160px]">Field</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            <TableHead className="w-[90px]">Permission</TableHead>
            <TableHead className="w-[160px]">Display Name</TableHead>
            <TableHead className="w-[60px] text-center">Req</TableHead>
            <TableHead className="w-[60px] text-center">Show</TableHead>
            <TableHead className="w-[100px]">Col Type</TableHead>
            <TableHead className="w-[60px] text-center">Search</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {includedFields.map((field) => {
            const defaultColumnType = mapPrismaTypeToColumnType(field.type);

            return (
              <TableRow key={field.name} className={cn(field.isId && 'bg-blue-50/30')}>
                {/* Field Name */}
                <TableCell className="font-mono text-sm">
                  <div className="flex items-center gap-1">
                    <span className="truncate max-w-[120px]" title={field.name}>
                      {field.name}
                    </span>
                    {field.isId && (
                      <Badge variant="outline" className="text-[10px] px-1">ID</Badge>
                    )}
                  </div>
                </TableCell>

                {/* Type */}
                <TableCell>
                  <Badge variant={getTypeBadgeVariant(field.type)} className="text-[10px]">
                    {field.type}
                  </Badge>
                </TableCell>

                {/* Permission */}
                <TableCell>
                  <Select
                    value={field.permission || 'read'}
                    onValueChange={(value) => onChange(field.name, { permission: value as PermissionType })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 w-[80px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Display Name */}
                <TableCell>
                  <Input
                    value={field.displayName || ''}
                    onChange={(e) => onChange(field.name, { displayName: e.target.value })}
                    disabled={disabled}
                    className="h-7 text-xs"
                    placeholder="Display name"
                  />
                </TableCell>

                {/* Required */}
                <TableCell className="text-center">
                  <Checkbox
                    checked={field.required || false}
                    onCheckedChange={(checked) => onChange(field.name, { required: !!checked })}
                    disabled={disabled}
                  />
                </TableCell>

                {/* Show in Column */}
                <TableCell className="text-center">
                  <Checkbox
                    checked={field.isColumnShow || false}
                    onCheckedChange={(checked) => onChange(field.name, { isColumnShow: !!checked })}
                    disabled={disabled}
                  />
                </TableCell>

                {/* Column Type */}
                <TableCell>
                  <Select
                    value={field.tableProps?.columnType || defaultColumnType}
                    onValueChange={(value) =>
                      onChange(field.name, {
                        tableProps: { ...field.tableProps, columnType: value as ColumnType },
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 w-[90px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Search */}
                <TableCell className="text-center">
                  <Checkbox
                    checked={field.searchProps?.isSearch || false}
                    onCheckedChange={(checked) =>
                      onChange(field.name, {
                        searchProps: { ...field.searchProps, isSearch: !!checked },
                      })
                    }
                    disabled={disabled}
                  />
                </TableCell>

                {/* Remove Button */}
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(field.name, { included: false })}
                    disabled={disabled}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Remove field"
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
  );
};

export default IncludedFieldsTable;
