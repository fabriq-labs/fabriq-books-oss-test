import React, { useState } from 'react';
import { Building2, Check, ChevronDown, Globe } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useEntity, type Entity } from '@/contexts/EntityContext';

export function EntitySwitcher() {
  const { entities, currentEntity, setCurrentEntity, loading } = useEntity();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="h-7 w-32 rounded-md bg-muted animate-pulse" />
    );
  }

  if (entities.length === 0) {
    return null;
  }

  // Single tenant: show the active legal entity in the top bar (no switcher menu).
  if (entities.length === 1) {
    const only = entities[0];
    const name = currentEntity?.legal_name ?? only.legal_name;
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium',
          'bg-background text-foreground'
        )}
        title={name}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-[160px] truncate">{name}</span>
      </div>
    );
  }

  const label = currentEntity?.legal_name ?? 'All Entities';

  const handleSelect = (entity: Entity | null) => {
    setCurrentEntity(entity);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium',
            'bg-background hover:bg-accent hover:text-accent-foreground transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            currentEntity ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {currentEntity ? (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search entities…" />
          <CommandList>
            <CommandEmpty>No entities found.</CommandEmpty>

            <CommandGroup>
              <CommandItem
                value="all-entities"
                onSelect={() => handleSelect(null)}
                className="gap-2"
              >
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>All Entities</span>
                {!currentEntity && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Entities">
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  value={entity.legal_name}
                  onSelect={() => handleSelect(entity)}
                  className="gap-2"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{entity.legal_name}</span>
                  {currentEntity?.id === entity.id && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
