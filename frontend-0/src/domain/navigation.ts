export interface DomainNavItem {
  label: string;
  path: string;
}

export interface DomainNavGroup {
  label: string;
  items: DomainNavItem[];
}

/**
 * Sidebar entries for this application.
 * A product list might add { label: 'Notes', path: '/master/app/note' }.
 */
export const domainNavigation: DomainNavGroup[] = [
  {
    label: 'Sales',
    items: [
      { label: 'Invoices', path: '/sales/invoices' },
      { label: 'Imported invoices', path: '/sales/invoices/imported' },
      { label: 'Payments received', path: '/sales/payments' },
      { label: 'Imported payments', path: '/sales/payments/imported' },
      { label: 'Credit notes', path: '/sales/credit-notes' },
      { label: 'Imported credit notes', path: '/sales/credit-notes/imported' },
      { label: 'Customers', path: '/sales/customers' },
      { label: 'Items', path: '/masters/items' },
    ],
  },
  {
    label: 'Purchases',
    items: [{ label: 'Suppliers', path: '/purchases/suppliers' }],
  },
  {
    label: 'Tax',
    items: [
      { label: 'Tax rates', path: '/masters/tax-rates' },
      { label: 'Tax groups', path: '/masters/tax-groups' },
      { label: 'Tax regions', path: '/masters/tax-regions' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Chart of Accounts', path: '/accounting/accounts' },
      { label: 'Transactions', path: '/accounting/transactions' },
      { label: 'Opening Balances', path: '/accounting/opening-balances' },
      { label: 'Entities', path: '/masters/entity' },
      { label: 'Exchange Rates', path: '/accounting/exchange-rates' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Trial Balance', path: '/reports/trial-balance' },
      { label: 'Income Statement', path: '/reports/income-statement' },
      { label: 'Balance Sheet', path: '/reports/balance-sheet' },
      { label: 'Cash Flow', path: '/reports/cash-flow' },
      { label: 'Posting List', path: '/reports/posting-list' },
    ],
  },
  {
    label: 'Integrations',
    items: [{ label: 'Connections', path: '/settings/connections' }],
  },
];
