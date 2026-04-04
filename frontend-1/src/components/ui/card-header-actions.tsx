
import React from 'react';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface CardHeaderActionsProps {
  title: string;
  icon: React.ReactNode;
  onSearch?: (term: string) => void;
  searchValue?: string;
  searchPlaceholder?: string;
  actionButton?: React.ReactNode;
  className?: string;
  onSearchValueChange?: any
}

export function CardHeaderActions({
  title,
  icon,
  onSearch,
  searchValue = '',
  searchPlaceholder = 'Search...',
  actionButton,
  className,
  onSearchValueChange
}: CardHeaderActionsProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", className)}>
      <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
        {icon}
        {title}
      </h2>

      <div className="flex gap-2 w-full sm:w-auto">
        {onSearch && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              className="pl-8 w-full"
              value={searchValue}
              // onChange={(e) => onSearch(e.target.value)}
              onChange={(e) => {
                // ✅ let parent update local state, but don't trigger API
                onSearchValueChange?.(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSearch(e.currentTarget.value); // ✅ only trigger search on Enter
                }
              }}
            />
          </div>
        )}
        {actionButton}
      </div>
    </div>
  );
}
