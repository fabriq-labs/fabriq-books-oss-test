
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CardHeaderActions } from './card-header-actions';
import { cn } from '@/lib/utils';

interface ListCardProps {
  title: string;
  icon: React.ReactNode;
  onSearch?: (term: string) => void;
  searchValue?: string;
  searchPlaceholder?: string;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  onSearchValueChange?: any
}

export function ListCard({
  title,
  icon,
  onSearch,
  searchValue,
  searchPlaceholder,
  actionButton,
  children,
  className,
  contentClassName,
  onSearchValueChange
}: ListCardProps) {
  return (
    <Card className={cn("shadow-lg", className)}>
      <CardHeader className="bg-slate-50 dark:bg-slate-800 rounded-t-lg p-4">
        <CardHeaderActions
          title={title}
          icon={icon}
          onSearch={onSearch}
          searchValue={searchValue}
          searchPlaceholder={searchPlaceholder}
          actionButton={actionButton}
          onSearchValueChange={onSearchValueChange}
        />
      </CardHeader>
      <CardContent className={cn("p-0 overflow-auto", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
