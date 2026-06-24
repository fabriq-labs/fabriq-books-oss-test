import React, { useState } from 'react';
import { plaidAPI, PlaidAccount, PlaidItem } from '@/api/plaidApi';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Trash2, Building2, Plus } from 'lucide-react';
import { plaidUi } from './plaidUi';

interface ConnectedAccountsProps {
  items: PlaidItem[];
  onRefresh: () => void;
  onImportAccounts: (item: PlaidItem) => void;
}

function formatBalance(amount: number | null | undefined): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function accountSubtypeLabel(type: string | null, subtype: string | null): string {
  return (subtype ?? type ?? 'account').replace(/_/g, ' ');
}

function linkedAccounts(item: PlaidItem): PlaidAccount[] {
  return item.accounts.filter((a) => Boolean(a.fabriq_account_id));
}

export function ConnectedAccounts({ items, onRefresh, onImportAccounts }: ConnectedAccountsProps) {
  const { toast } = useToast();
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [syncingAccountKey, setSyncingAccountKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const accountSyncKey = (itemId: string, plaidAccountId: string) =>
    `${itemId}:${plaidAccountId}`;

  const handleSyncAll = async (itemId: string) => {
    setSyncingItemId(itemId);
    try {
      const res = await plaidAPI.syncItem(itemId);
      const { added, skipped } = res.data;
      toast({
        title: 'Sync complete',
        description: `${added} new transaction(s)${skipped ? `, ${skipped} skipped` : ''}.`,
      });
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not sync transactions';
      toast({ title: 'Sync failed', description: message, variant: 'destructive' });
    } finally {
      setSyncingItemId(null);
    }
  };

  const handleSyncAccount = async (
    itemId: string,
    plaidAccountId: string,
    accountName: string,
  ) => {
    const key = accountSyncKey(itemId, plaidAccountId);
    setSyncingAccountKey(key);
    try {
      const res = await plaidAPI.syncAccount(itemId, plaidAccountId);
      const { added, skipped } = res.data;
      toast({
        title: 'Account synced',
        description: `${accountName}: ${added} new transaction(s) for this account${skipped ? `, ${skipped} already imported` : ''}.`,
      });
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not sync this account';
      toast({ title: 'Sync failed', description: message, variant: 'destructive' });
    } finally {
      setSyncingAccountKey(null);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    try {
      await plaidAPI.deleteItem(itemId);
      toast({ title: 'Disconnected', description: 'Bank connection removed.' });
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not disconnect';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const visibleItems = items
    .map((item) => ({ item, accounts: linkedAccounts(item) }))
    .filter(({ accounts }) => accounts.length > 0);

  if (visibleItems.length === 0) {
    return (
      <div className={`${plaidUi.card} py-12 text-center text-slate-500 text-sm`}>
        No connected bank accounts yet. Connect a bank and map accounts to your chart of accounts.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {visibleItems.map(({ item, accounts }) => {
        const institutionName = item.institution_name ?? 'Bank connection';
        const initial = institutionName.charAt(0).toUpperCase();

        return (
          <div key={item.id} className={plaidUi.card}>
            <div
              className={`${plaidUi.cardHeader} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={plaidUi.institutionBadge}>{initial}</div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">
                    {institutionName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connected {new Date(item.created_at).toLocaleDateString()}
                    {' · '}
                    {accounts.length} account{accounts.length === 1 ? '' : 's'}
                    {item.last_synced_at && (
                      <> · Synced {new Date(item.last_synced_at).toLocaleString()}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-slate-200"
                  onClick={() => onImportAccounts(item)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add accounts
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-slate-200"
                  onClick={() => handleSyncAll(item.id)}
                  disabled={syncingItemId === item.id}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-1 ${syncingItemId === item.id ? 'animate-spin' : ''}`}
                  />
                  Sync all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-slate-200 text-slate-600"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>

            <ul className={plaidUi.listDivide}>
              {accounts.map((acct) => {
                const syncKey = accountSyncKey(item.id, acct.plaid_account_id);
                const isSyncing = syncingAccountKey === syncKey;
                const balance = formatBalance(acct.balance);
                const displayName = acct.fabriq_account_name ?? acct.name ?? 'Account';

                return (
                  <li key={acct.plaid_account_id}>
                    <div className={`${plaidUi.accountRow} flex-col sm:flex-row sm:items-center gap-3`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1 w-full">
                        <div className={plaidUi.accountIcon}>
                          <Building2 className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="min-w-0 text-left flex-1">
                          <p className={plaidUi.accountName}>
                            {displayName}
                            {acct.mask && (
                              <span className="text-slate-500 font-normal"> · {acct.mask}</span>
                            )}
                          </p>
                          <p className={plaidUi.accountMeta}>
                            {accountSubtypeLabel(acct.type, acct.subtype)}
                          </p>
                        </div>
                        {balance && (
                          <span className={`${plaidUi.balance} hidden sm:inline`}>{balance}</span>
                        )}
                      </div>

                      <Button
                        size="sm"
                        className="h-9 shrink-0 rounded-lg px-4 bg-[#111111] hover:bg-black text-white disabled:opacity-50 w-full sm:w-auto"
                        disabled={isSyncing || syncingItemId === item.id}
                        onClick={() =>
                          handleSyncAccount(item.id, acct.plaid_account_id, displayName)
                        }
                      >
                        <RefreshCw
                          className={`h-4 w-4 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`}
                        />
                        {isSyncing ? 'Syncing…' : 'Sync'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
