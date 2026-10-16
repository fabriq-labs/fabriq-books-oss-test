/**
 * AddFieldModal - Modal to select and add unincluded fields
 *
 * Shows a searchable list of fields not yet included in the datagraph,
 * allowing multi-select and batch adding.
 */

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { MergedScalarField } from './types';
import { toDisplayName } from './utils';

interface AddFieldModalProps {
  open: boolean;
  onClose: () => void;
  fields: MergedScalarField[];
  onAddFields: (fieldNames: string[]) => void;
}

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

export const AddFieldModal: React.FC<AddFieldModalProps> = ({
  open,
  onClose,
  fields,
  onAddFields,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  // Filter to only show unincluded fields
  const unincludedFields = useMemo(() => {
    return fields.filter(f => !f.included);
  }, [fields]);

  // Filter by search term
  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) return unincludedFields;

    const term = searchTerm.toLowerCase();
    return unincludedFields.filter(f =>
      f.name.toLowerCase().includes(term) ||
      toDisplayName(f.name).toLowerCase().includes(term) ||
      f.type.toLowerCase().includes(term)
    );
  }, [unincludedFields, searchTerm]);

  const handleToggleField = (fieldName: string) => {
    setSelectedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedFields(new Set(filteredFields.map(f => f.name)));
  };

  const handleSelectNone = () => {
    setSelectedFields(new Set());
  };

  const handleAdd = () => {
    onAddFields(Array.from(selectedFields));
    setSelectedFields(new Set());
    setSearchTerm('');
    onClose();
  };

  const handleClose = () => {
    setSelectedFields(new Set());
    setSearchTerm('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Fields</DialogTitle>
          <DialogDescription>
            Select fields to include in the datagraph. {unincludedFields.length} fields available.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search fields..."
              className="pl-9"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedFields.size} selected
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleSelectNone}>
                Clear
              </Button>
            </div>
          </div>

          {/* Field List */}
          <ScrollArea className="h-[300px] border rounded-md">
            {filteredFields.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {unincludedFields.length === 0
                  ? 'All fields are already included.'
                  : 'No fields match your search.'}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredFields.map((field) => (
                  <div
                    key={field.name}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                      selectedFields.has(field.name) ? 'bg-muted' : ''
                    }`}
                    onClick={() => handleToggleField(field.name)}
                  >
                    <Checkbox
                      checked={selectedFields.has(field.name)}
                      onCheckedChange={() => handleToggleField(field.name)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm truncate">{field.name}</span>
                        {field.isId && (
                          <Badge variant="outline" className="text-[10px] px-1">ID</Badge>
                        )}
                        {field.schemaRequired && (
                          <Badge variant="secondary" className="text-[10px] px-1">Required</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {toDisplayName(field.name)}
                      </p>
                    </div>
                    <Badge variant={getTypeBadgeVariant(field.type)} className="text-[10px]">
                      {field.type}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={selectedFields.size === 0}
          >
            Add {selectedFields.size > 0 ? `(${selectedFields.size})` : ''} Fields
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddFieldModal;
