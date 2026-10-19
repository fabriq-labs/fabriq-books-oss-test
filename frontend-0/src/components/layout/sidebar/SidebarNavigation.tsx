import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, LayoutDashboard, Shield } from 'lucide-react';
import { NavItem } from './NavItem';
import { domainNavigation } from '@/domain/navigation';

interface SidebarNavigationProps {
  collapsed: boolean;
}

/**
 * Kernel navigation. Super Admin gets the platform pages.
 * Tenant Administration and Demo Data Management are books tools and are not included.
 */
const superAdminNav = [
  { label: 'Users', path: '/settings/users' },
  { label: 'Departments', path: '/settings/departments' },
  { label: 'Roles', path: '/settings/roles' },
  { label: 'Workflows', path: '/settings/workflows' },
  { label: 'Views', path: '/settings/views' },
  { label: 'Permissions', path: '/settings/permissions' },
  { label: 'AI Templates', path: '/settings/ai-templates' },
  { label: 'LLM Traces', path: '/settings/llm-traces' },
  { label: 'Currency', path: '/accounting/currency' },
];

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ collapsed }) => {
  const { pathname } = useLocation();
  return (
    <div className="flex-1 overflow-y-auto py-2">
      <NavItem icon={LayoutDashboard} label="Dashboard" path="/" collapsed={collapsed} active={pathname === '/'} />
      <NavItem icon={Shield} label="Super Admin" collapsed={collapsed} subNav={superAdminNav} />
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
    </div>
  );
};
