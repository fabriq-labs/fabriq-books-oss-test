/**
 * Trial balance / balance-sheet section totals.
 * When the API returns hierarchy roots (level 0), only those rows are summed to avoid double-counting children.
 * Legal-entity–scoped responses often omit roots and return only level > 0 rows; then every visible row is summed.
 */
export function aggregateTrialBalanceSectionRows<
    T extends {
        level?: number;
        total_debits?: unknown;
        total_credits?: unknown;
        total_balance?: unknown;
        opening_balance?: unknown;
        balance?: unknown;
    },
>(pageData: readonly T[]) {
    const hasRoot = pageData.some((r) => Number(r.level ?? 0) === 0);
    const includeRow = hasRoot ? (r: T) => Number(r.level ?? 0) === 0 : (_r: T) => true;

    return pageData.reduce(
        (acc, curr) => {
            if (!includeRow(curr)) return acc;
            return {
                opening_balance: acc.opening_balance + Number(curr.opening_balance ?? 0),
                total_debits: acc.total_debits + Number(curr.total_debits ?? 0),
                total_credits: acc.total_credits + Number(curr.total_credits ?? 0),
                balance: acc.balance + Number(curr.balance ?? 0),
                total_balance: acc.total_balance + Number(curr.total_balance ?? 0),
            };
        },
        { opening_balance: 0, total_debits: 0, total_credits: 0, balance: 0, total_balance: 0 }
    );
}