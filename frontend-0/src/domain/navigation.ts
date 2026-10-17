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
    ],
  },
];
