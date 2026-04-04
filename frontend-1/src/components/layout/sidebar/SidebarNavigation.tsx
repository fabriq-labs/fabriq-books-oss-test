import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  Database,
  Briefcase,
  Box,
  DollarSign,
  Settings,
  Receipt,
  TrendingUp,
  ShoppingCart,
  Package,
  Building2,
  Truck,
  FileText,
  Bot,
} from 'lucide-react';
import { NavItem } from './NavItem';
import { NavGroup } from './NavGroup';
import { useUserRoles } from '@/hooks/useUserRoles';

interface SidebarNavigationProps {
  collapsed: boolean;
}

interface MasterNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subNav: { label: string; path: string }[];
  allowedRoles?: string[]; // Optional: if provided, user must have one of these roles
}

const directNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: BarChart3, label: 'Reports', path: '/reports' },
  { icon: Bot, label: 'Workbench', path: '/workbench' },
];

const topLevelNavItems: MasterNavItem[] = [
  {
    icon: ShoppingCart,
    label: 'Sales',
    subNav: [
      { label: 'Customers', path: '/sales/customers' },
      { label: 'Quotes', path: '/sales/quotes' },
      { label: 'Sales Orders', path: '/sales/sales-orders' },
      { label: 'Invoices', path: '/sales/invoices' },
      { label: 'Delivery Challans', path: '/sales/delivery-challans' },
      { label: 'Payment Receipts', path: '/sales/payment-receipts' },
      { label: 'Credit Notes', path: '/sales/credit-notes' }
    ]
  },
  {
    icon: Package,
    label: 'Purchases',
    subNav: [
      { label: 'Suppliers', path: '/purchases/suppliers' },
      { label: 'Purchase Requisitions', path: '/purchases/requisitions' },
      { label: 'Purchase Orders', path: '/purchases/orders' },
      { label: 'Bills', path: '/purchases/bills' }
    ]
  },
  {
    icon: DollarSign,
    label: 'Accounting',
    subNav: [
      { label: 'Transactions', path: '/accounting/transactions' },
      { label: 'Simple Transactions', path: '/accounting/simple-transactions' },
      { label: 'Chart of Accounts', path: '/accounting/accounts' },
      { label: 'Categories', path: '/accounting/categories' },
      { label: 'Category Groups', path: '/accounting/category-groups' },
      { label: 'Tax Master', path: '/accounting/tax' },
      { label: 'Currency Master', path: '/accounting/currency-master' },
      { label: 'Payment Terms', path: '/accounting/payment-terms' },
      { label: 'Budget Periods', path: '/accounting/budget-periods' },
      { label: 'Budget Lines', path: '/accounting/budget-lines' },
      { label: 'Exchange Rates', path: '/accounting/exchange-rates' },
      { label: 'Currency', path: '/accounting/currency' }
    ]
  },
  {
    icon: TrendingUp,
    label: 'Investments',
    subNav: [
      { label: 'Instruments', path: '/investments/instruments' },
      { label: 'Holdings', path: '/investments/holdings' },
      { label: 'Trades', path: '/investments/trades' }
    ]
  }
];

const masterNavItems: MasterNavItem[] = [
  {
    icon: Box,
    label: 'Items & Inventory',
    subNav: [
      { label: 'Item Master', path: '/masters/items' },
      { label: 'Item Categories', path: '/masters/item-categories' },
      { label: 'Units of Measurement', path: '/masters/uom' }
    ]
  },
  {
    icon: Building2,
    label: 'Organization',
    subNav: [
      { label: 'Organization', path: '/masters/organization' },
      { label: 'Locations', path: '/masters/locations' },
      { label: 'Business Units', path: '/masters/business-units' },
      { label: 'Departments', path: '/masters/departments' },
      { label: 'Projects', path: '/masters/projects' },
      { label: 'Cost Centers', path: '/masters/cost-centers' }
    ]
  },
  {
    icon: Truck,
    label: 'Shipping',
    subNav: [
      { label: 'Shipping Terms', path: '/masters/shipping-terms' },
      { label: 'Shipping Methods', path: '/masters/shipping-methods' }
    ]
  }
];

const settingsNavItems: MasterNavItem[] = [
  {
    icon: Settings,
    label: 'Settings',
    allowedRoles: ['Super Admin'],
    subNav: [
      { label: 'Users', path: '/settings/users' },
      { label: 'Employees', path: '/settings/employees' },
      { label: 'Roles', path: '/settings/roles' },
      { label: 'Workflow Management', path: '/settings/workflows' },
      { label: 'Connections', path: '/settings/connections' },
      { label: 'Views', path: '/settings/views' },
      { label: 'Permissions', path: '/settings/permissions' },
      { label: 'AI Templates', path: '/settings/ai-templates' },
      { label: 'LLM Traces', path: '/settings/llm-traces' },
      { label: 'Tenant Onboarding', path: '/settings/tenant-onboarding' }
    ]
  }
];

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ collapsed }) => {
  const { pathname } = useLocation();
  const { hasRole } = useUserRoles();

  const isActive = (path?: string, subNav?: { path: string }[]) => {
    if (path) return pathname === path;
    if (subNav) return subNav.some(item => pathname.startsWith(item.path));
    return false;
  };

  // Filter nav items based on user roles
  const filterNavItems = (items: MasterNavItem[]) => {
    return items.filter(item => {
      // If no allowedRoles specified, item is visible to everyone
      if (!item.allowedRoles || item.allowedRoles.length === 0) {
        return true;
      }
      // Check if user has any of the allowed roles
      return item.allowedRoles.some(role => hasRole(role));
    });
  };

  const filteredTopLevelNavItems = filterNavItems(topLevelNavItems);
  const filteredMasterNavItems = filterNavItems(masterNavItems);
  const filteredSettingsNavItems = filterNavItems(settingsNavItems);

  return (
    <>
      <div className="space-y-1">
        {directNavItems?.map(({ icon, label, path }) => (
          <NavItem
            key={label}
            icon={icon}
            label={label}
            path={path}
            collapsed={collapsed}
            active={isActive(path)}
          />
        ))}
      </div>

      {/* Top-level navigation groups */}
      <div className="space-y-1 mt-4">
        {filteredTopLevelNavItems?.map(({ icon, label, subNav }) => (
          <NavItem
            key={label}
            icon={icon}
            label={label}
            collapsed={collapsed}
            subNav={subNav}
            active={isActive(undefined, subNav)}
          />
        ))}
      </div>

      {/* Master Data */}
      <NavGroup label="Masters" icon={Database} collapsed={collapsed}>
        {filteredMasterNavItems?.map(({ icon, label, subNav }) => (
          <NavItem
            key={label}
            icon={icon}
            label={label}
            collapsed={collapsed}
            subNav={subNav}
            active={isActive(undefined, subNav)}
          />
        ))}
      </NavGroup>

      {/* Settings */}
      <div className="space-y-1 mt-4">
        {filteredSettingsNavItems?.map(({ icon, label, subNav }) => (
          <NavItem
            key={label}
            icon={icon}
            label={label}
            collapsed={collapsed}
            subNav={subNav}
            active={isActive(undefined, subNav)}
          />
        ))}
      </div>
    </>
  );
};