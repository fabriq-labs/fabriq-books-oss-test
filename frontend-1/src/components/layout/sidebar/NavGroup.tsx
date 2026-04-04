
import React from 'react';
import { cn } from '@/lib/utils';

interface NavGroupProps {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  collapsed: boolean;
}

export const NavGroup: React.FC<NavGroupProps> = ({ label, icon: Icon, children, collapsed }) => {
  return (
    <div className="mt-6 space-y-1.5">
      {!collapsed && (
        <div className="flex items-center px-3 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          <Icon className="h-4 w-4 mr-2" />
          <span>{label}</span>
        </div>
      )}
      {children}
    </div>
  );
};
