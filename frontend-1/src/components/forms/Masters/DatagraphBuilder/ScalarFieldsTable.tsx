/**
 * ScalarFieldsTable - Table component for scalar field configuration
 *
 * Displays all scalar fields from the model schema and allows inline editing
 * of datagraph properties like permission, displayName, required, etc.
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FieldRow } from './FieldRow';
import { ScalarFieldsTableProps } from './types';

export const ScalarFieldsTable: React.FC<ScalarFieldsTableProps> = ({
  fields,
  onChange,
  disabled = false,
}) => {
  if (fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
        No scalar fields available for this model.
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[50px]">Include</TableHead>
            <TableHead className="w-[180px]">Field Name</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="w-[100px]">Permission</TableHead>
            <TableHead className="w-[180px]">Display Name</TableHead>
            <TableHead className="w-[80px]">Required</TableHead>
            <TableHead className="w-[80px]">Show Col</TableHead>
            <TableHead className="w-[120px]">Column Type</TableHead>
            <TableHead className="w-[80px]">Search</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              onChange={(updates) => onChange(field.name, updates)}
              disabled={disabled}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ScalarFieldsTable;
