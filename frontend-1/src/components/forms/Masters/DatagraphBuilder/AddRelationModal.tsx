/**
 * AddRelationModal - Modal to select and add unincluded relations
 *
 * Shows a searchable list of relations not yet included in the datagraph,
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
import { MergedRelation } from './types';
import { toDisplayName } from './utils';

interface AddRelationModalProps {
  open: boolean;
  onClose: () => void;
  relations: MergedRelation[];
  onAddRelations: (relationNames: string[]) => void;
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

export const AddRelationModal: React.FC<AddRelationModalProps> = ({
  open,
  onClose,
  relations,
  onAddRelations,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());

  // Filter to only show unincluded relations
  const unincludedRelations = useMemo(() => {
    return relations.filter(r => !r.included);
  }, [relations]);

  // Filter by search term
  const filteredRelations = useMemo(() => {
    if (!searchTerm.trim()) return unincludedRelations;

    const term = searchTerm.toLowerCase();
    return unincludedRelations.filter(r =>
      r.name.toLowerCase().includes(term) ||
      toDisplayName(r.name).toLowerCase().includes(term) ||
      r.type.toLowerCase().includes(term)
    );
  }, [unincludedRelations, searchTerm]);

  const handleToggleRelation = (relationName: string) => {
    setSelectedRelations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(relationName)) {
        newSet.delete(relationName);
      } else {
        newSet.add(relationName);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedRelations(new Set(filteredRelations.map(r => r.name)));
  };

  const handleSelectNone = () => {
    setSelectedRelations(new Set());
  };

  const handleAdd = () => {
    onAddRelations(Array.from(selectedRelations));
    setSelectedRelations(new Set());
    setSearchTerm('');
    onClose();
  };

  const handleClose = () => {
    setSelectedRelations(new Set());
    setSearchTerm('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Relations</DialogTitle>
          <DialogDescription>
            Select relations to include in the datagraph. {unincludedRelations.length} relations available.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search relations..."
              className="pl-9"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedRelations.size} selected
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

          {/* Relation List */}
          <ScrollArea className="h-[300px] border rounded-md">
            {filteredRelations.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {unincludedRelations.length === 0
                  ? 'All relations are already included.'
                  : 'No relations match your search.'}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredRelations.map((relation) => (
                  <div
                    key={relation.name}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                      selectedRelations.has(relation.name) ? 'bg-muted' : ''
                    }`}
                    onClick={() => handleToggleRelation(relation.name)}
                  >
                    <Checkbox
                      checked={selectedRelations.has(relation.name)}
                      onCheckedChange={() => handleToggleRelation(relation.name)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm truncate">{relation.name}</span>
                        {relation.isList && (
                          <Badge variant="outline" className="text-[10px] px-1">[]</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {toDisplayName(relation.name)} → {relation.type}
                      </p>
                    </div>
                    <Badge variant={getRelationTypeBadge(relation.relationType)} className="text-[10px]">
                      {formatRelationType(relation.relationType)}
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
            disabled={selectedRelations.size === 0}
          >
            Add {selectedRelations.size > 0 ? `(${selectedRelations.size})` : ''} Relations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddRelationModal;
