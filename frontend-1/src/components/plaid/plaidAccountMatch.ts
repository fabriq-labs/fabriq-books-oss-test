export interface CoaAccountOption {
  id: string;
  name?: string;
  code?: string;
  classification?: string;
  type?: string | string[];
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function formatPlaidAccountLabel(name: string | null, mask: string | null): string {
  const label = name?.trim() || 'Bank account';
  return mask ? `${label} · ${mask}` : label;
}

function accountTypes(account: CoaAccountOption): string[] {
  if (Array.isArray(account.type)) return account.type;
  if (typeof account.type === 'string') return [account.type];
  return [];
}

export function isBankRelevantAccount(account: CoaAccountOption): boolean {
  const classification = account.classification?.toLowerCase();
  if (classification === 'assets' || classification === 'liabilities') {
    return true;
  }
  const types = accountTypes(account).map((t) => t.toUpperCase());
  return types.some((t) => t.includes('BANK') || t.includes('CHECKING') || t.includes('SAVINGS'));
}

export function suggestFabriqAccount(
  plaidName: string | null,
  mask: string | null,
  coaAccounts: CoaAccountOption[],
): string | null {
  if (coaAccounts.length === 0) return null;

  const formattedPlaid = formatPlaidAccountLabel(plaidName, mask);
  const plaidNorm = normalizeName(formattedPlaid);
  const nameNorm = normalizeName(plaidName ?? '');

  const exact = coaAccounts.find((a) => {
    const accountName = a.name ?? '';
    return (
      normalizeName(accountName) === plaidNorm ||
      normalizeName(accountName) === nameNorm ||
      accountName === formattedPlaid
    );
  });
  if (exact) return exact.id;

  const contains = coaAccounts.find((a) => {
    const accountNorm = normalizeName(a.name ?? '');
    if (!accountNorm || !nameNorm) return false;
    return accountNorm.includes(nameNorm) || nameNorm.includes(accountNorm);
  });
  if (contains) return contains.id;

  const maskMatch = mask
    ? coaAccounts.find((a) => (a.name ?? '').includes(mask))
    : undefined;
  if (maskMatch) return maskMatch.id;

  return null;
}

export function mapPlaidAccountToCoaDisplay(
  type: string | null,
  subtype: string | null,
): { classification: string; types: string[] } {
  const normalizedType = type?.toLowerCase() ?? '';
  const normalizedSubtype = subtype?.toLowerCase() ?? '';

  if (normalizedType === 'credit') {
    return { classification: 'Liabilities', types: ['CREDIT_CARD', 'BANK'] };
  }
  if (normalizedSubtype === 'savings') {
    return { classification: 'Assets', types: ['BANK', 'SAVINGS'] };
  }
  if (normalizedSubtype === 'checking') {
    return { classification: 'Assets', types: ['BANK', 'CHECKING'] };
  }
  return { classification: 'Assets', types: ['BANK'] };
}
