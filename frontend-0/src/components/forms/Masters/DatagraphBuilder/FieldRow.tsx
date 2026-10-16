/**
 * FieldRow - Individual field row with inline editing
 *
 * Renders a single scalar field row in the datagraph builder table.
 * Supports inline editing of all configurable properties.
 */

import React from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { MergedScalarField, PermissionType, ColumnType } from './types';
import { mapPrismaTypeToColumnType } from './utils';

interface FieldRowProps {
  field: MergedScalarField;
  onChange: (updates: Partial<MergedScalarField>) => void;
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

/**
 * Get badge variant based on field type
 */
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

export const FieldRow: React.FC<FieldRowProps> = ({
  field,
  onChange,
  disabled = false,
}) => {
  const isDisabled = disabled || !field.included;
  const defaultColumnType = mapPrismaTypeToColumnType(field.type);

  return (
    <TableRow
      className={cn(
        !field.included && 'opacity-50 bg-muted/30',
        field.isId && 'bg-blue-50/30'
      )}
    >
      {/* Include Checkbox */}
      <TableCell>
        <Checkbox
          checked={field.included}
          onCheckedChange={(checked) => onChange({ included: !!checked })}
          disabled={disabled}
        />
      </TableCell>

      {/* Field Name (read-only) */}
      <TableCell className="font-mono text-sm">
        <div className="flex items-center gap-2">
          {field.name}
          {field.isId && (
            <Badge variant="outline" className="text-xs">
              ID
            </Badge>
          )}
          {field.isUnique && !field.isId && (
            <Badge variant="outline" className="text-xs">
              Unique
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Type (read-only) */}
      <TableCell>
        <Badge variant={getTypeBadgeVariant(field.type)} className="text-xs">
          {field.type}
        </Badge>
      </TableCell>

      {/* Permission */}
      <TableCell>
        <Select
          value={field.permission || 'read'}
          onValueChange={(value) => onChange({ permission: value as PermissionType })}
          disabled={isDisabled}
        >
          <SelectTrigger className="h-8 w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERMISSION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
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
          onChange={(e) => onChange({ displayName: e.target.value })}
          disabled={isDisabled}
          className="h-8"
          placeholder="Display name..."
        />
      </TableCell>

      {/* Required */}
      <TableCell className="text-center">
        <Checkbox
          checked={field.required || false}
          onCheckedChange={(checked) => onChange({ required: !!checked })}
          disabled={isDisabled}
        />
      </TableCell>

      {/* Show in Column */}
      <TableCell className="text-center">
        <Checkbox
          checked={field.isColumnShow || false}
          onCheckedChange={(checked) => onChange({ isColumnShow: !!checked })}
          disabled={isDisabled}
        />
      </TableCell>

      {/* Column Type */}
      <TableCell>
        <Select
          value={field.tableProps?.columnType || defaultColumnType}
          onValueChange={(value) =>
            onChange({
              tableProps: {
                ...field.tableProps,
                columnType: value as ColumnType,
              },
            })
          }
          disabled={isDisabled}
        >
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLUMN_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Search Enabled */}
      <TableCell className="text-center">
        <Checkbox
          checked={field.searchProps?.isSearch || false}
          onCheckedChange={(checked) =>
            onChange({
              searchProps: {
                ...field.searchProps,
                isSearch: !!checked,
              },
            })
          }
          disabled={isDisabled}
        />
      </TableCell>
    </TableRow>
  );
};

export default FieldRow;
