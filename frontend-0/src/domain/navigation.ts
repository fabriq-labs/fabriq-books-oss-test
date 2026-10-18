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
];
