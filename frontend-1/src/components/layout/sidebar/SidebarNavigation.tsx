import React from 'react';
import { LayoutDashboard, Settings, Bot } from 'lucide-react';
import { NavItem } from './NavItem';
import { domainNavigation } from '@/domain/navigation';

interface SidebarNavigationProps {
  collapsed: boolean;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ collapsed }) => {
  return (
    <div className="flex-1 overflow-y-auto py-2">
      <NavItem icon={LayoutDashboard} label="Workflows" path="/settings/workflows" collapsed={collapsed} />
      <NavItem icon={Bot} label="Workbench" path="/workbench" collapsed={collapsed} />

      {domainNavigation.map((group) => (
        <NavItem
          key={group.label}
          icon={LayoutDashboard}
          label={group.label}
          collapsed={collapsed}
          subNav={group.items}
        />
      ))}

      <NavItem
        icon={Settings}
        label="Settings"
        collapsed={collapsed}
        subNav={[
          { label: 'Users', path: '/settings/users' },
          { label: 'Roles', path: '/settings/roles' },
          { label: 'Views', path: '/settings/views' },
          { label: 'Permissions', path: '/settings/permissions' },
          { label: 'AI templates', path: '/settings/ai-templates' },
        ]}
      />
    </div>
  );
};
