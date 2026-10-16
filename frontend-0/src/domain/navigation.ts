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
 * A todo list might add { label: 'Todos', path: '/master/app/todo' }.
 */
export const domainNavigation: DomainNavGroup[] = [];
