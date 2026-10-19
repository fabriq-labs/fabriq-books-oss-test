import { useMemo } from 'react';
import { Building2, Check, ChevronDown, Globe } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { entityLabel, type Entity } from '@/contexts/EntityContext';

export function LegalEntityMultiSelect({
  entities,
  selectedIds,
  onChange,
  disabled = false,
  className,
}: {
  entities: Entity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const label = useMemo(() => {
    if (selectedIds.length === 0) return 'All Entities';
    if (selectedIds.length === 1) {
      const entity = entities.find((item) => item.id === selectedIds[0]);
      return entity ? entityLabel(entity) : '1 entity';
    }
    return `${selectedIds.length} entities`;
  }, [entities, selectedIds]);

  const toggleEntity = (entityId: string) => {
    if (selectedIds.includes(entityId)) {
      onChange(selectedIds.filter((id) => id !== entityId));
    } else {
      onChange([...selectedIds, entityId]);
    }
  };

  if (entities.length <= 1) {
    const only = entities[0];
    if (!only) return null;
    const name = entityLabel(only);
    return (
      <div
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm',
          className
        )}
        title={name}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="max-w-[140px] truncate text-slate-700">{name}</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm',
            'transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selectedIds.length === 0 ? 'text-slate-600' : 'text-slate-900',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
        >
          {selectedIds.length === 0 ? (
            <Globe className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" align="start">
        <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">Legal entities</p>
        <div className="max-h-[min(280px,50vh)] space-y-0.5 overflow-y-auto" role="listbox" aria-multiselectable>
          {entities.map((entity) => {
            const checked = selectedIds.includes(entity.id);
            return (
              <button
                key={entity.id}
                type="button"
                role="option"
                aria-selected={checked}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                  'transition-colors hover:bg-accent hover:text-accent-foreground',
                  checked && 'bg-accent/60'
                )}
                onClick={() => toggleEntity(entity.id)}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
                  )}
                >
                  {checked ? <Check className="h-3 w-3" /> : null}
                </span>
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{entityLabel(entity)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 border-t px-2 pt-2 text-xs text-muted-foreground">None selected = all entities (no filter)</p>
      </PopoverContent>
    </Popover>
  );
}
