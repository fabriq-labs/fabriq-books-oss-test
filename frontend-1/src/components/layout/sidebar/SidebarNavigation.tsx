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
  Shield,
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
  { icon: Bot, label: 'Workbench', path: '/workbench' },
];

const reportsNavItem: MasterNavItem = {
  icon: BarChart3,
  label: 'Reports',
  subNav: [
    { label: 'Overview', path: '/reports' },
    { label: 'Balance Sheet', path: '/reports/balance-sheet' },
    { label: 'Monthly Trial Balance', path: '/reports/monthly-trial-balance' },
    { label: 'Income Statement', path: '/reports/income-statement' },
    { label: 'Cash Flow', path: '/reports/cash-flow' },
    { label: 'Posting List', path: '/reports/posting-list' },
  ],
};

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
      { label: 'Bank Transactions', path: '/accounting/bank-transactions' },
      { label: 'Chart of Accounts', path: '/accounting/accounts' },
      { label: 'Opening Balances', path: '/accounting/opening-balances' },
      { label: 'Tax Master', path: '/accounting/tax' },
      { label: 'Payment Terms', path: '/accounting/payment-terms' },
      { label: 'Budget Periods', path: '/accounting/budget-periods' },
      { label: 'Budget Lines', path: '/accounting/budget-lines' },
      { label: 'Exchange Rates', path: '/accounting/exchange-rates' },
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
      { label: 'Legal Entity', path: '/masters/entity' },
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

/** Tenant-focused: org directory and integrations (Admin or Super Admin). */
const settingsNavItems: MasterNavItem[] = [
  {
    icon: Settings,
    label: 'Settings',
    allowedRoles: ['Admin', 'Super Admin'],
    subNav: [
      { label: 'Users', path: '/settings/users' },
      { label: 'Employees', path: '/settings/employees' },
      { label: 'Connections', path: '/settings/connections' },
      { label: 'Import Runs', path: '/settings/import-runs' },
    ],
  },
];

/** Platform governance and dev tooling (Super Admin only). */
const superAdminNavItems: MasterNavItem[] = [
  {
    icon: Shield,
    label: 'Super Admin',
    allowedRoles: ['Super Admin'],
    subNav: [
      { label: 'Workflows', path: '/settings/workflows' },
      { label: 'Views', path: '/settings/views' },
      { label: 'Permissions', path: '/settings/permissions' },
      { label: 'Roles', path: '/settings/roles' },
      { label: 'AI Templates', path: '/settings/ai-templates' },
      { label: 'LLM Traces', path: '/settings/llm-traces' },
      { label: 'Tenant Administration', path: '/settings/tenant-admin' },
      { label: 'Currency', path: '/accounting/currency' },
    ],
  },
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
  const filteredSuperAdminNavItems = filterNavItems(superAdminNavItems);

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
        <NavItem
          key="Reports"
          icon={reportsNavItem.icon}
          label={reportsNavItem.label}
          collapsed={collapsed}
          subNav={reportsNavItem.subNav}
          active={isActive(undefined, reportsNavItem.subNav)}
        />
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

      {/* Super Admin — hidden when user has no Super Admin role */}
      {filteredSuperAdminNavItems.length > 0 ? (
        <div className="space-y-1 mt-4">
          {filteredSuperAdminNavItems.map(({ icon, label, subNav }) => (
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
      ) : null}

      {/* Settings (tenant) */}
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