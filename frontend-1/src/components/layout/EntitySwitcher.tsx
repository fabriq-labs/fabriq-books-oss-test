import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Globe, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useEntity, type Entity } from '@/contexts/EntityContext';

const rowClass = cn(
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors',
  'hover:bg-accent hover:text-accent-foreground',
  'focus-visible:bg-accent focus-visible:text-accent-foreground',
  'active:bg-accent/90'
);

export function EntitySwitcher() {
  const { entities, currentEntity, setCurrentEntity, loading } = useEntity();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filteredEntities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter((e) => e.legal_name.toLowerCase().includes(q));
  }, [entities, query]);

  if (loading) {
    return (
      <div className="h-7 w-32 rounded-md bg-muted animate-pulse" />
    );
  }

  if (entities.length === 0) {
    return null;
  }

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
          type="button"
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

      <PopoverContent
        className="w-64 p-0 overflow-hidden"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col bg-popover text-popover-foreground">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search entities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div
            className="max-h-[min(280px,50vh)] overflow-y-auto overflow-x-hidden p-1.5"
            role="listbox"
            aria-label="Entities"
          >
            <button
              type="button"
              role="option"
              aria-selected={!currentEntity}
              className={rowClass}
              onClick={() => handleSelect(null)}
            >
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">All Entities</span>
              {!currentEntity ? (
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              ) : null}
            </button>

            <div className="my-1 h-px bg-border" role="separator" />

            {filteredEntities.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No entities found.</p>
            ) : (
              <div className="space-y-0.5">
                <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">Entities</p>
                {filteredEntities.map((entity) => (
                  <button
                    key={entity.id}
                    type="button"
                    role="option"
                    aria-selected={currentEntity?.id === entity.id}
                    className={rowClass}
                    onClick={() => handleSelect(entity)}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{entity.legal_name}</span>
                    {currentEntity?.id === entity.id ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
