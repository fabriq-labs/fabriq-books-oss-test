import React, { useState } from 'react';
import { plaidAPI, PlaidAccount, PlaidItem } from '@/api/plaidApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Trash2, Building2, Plus, Landmark } from 'lucide-react';
import { plaidUi } from './plaidUi';
import { plaidUserError } from './plaidUserErrors';

interface ConnectedAccountsProps {
  items: PlaidItem[];
  onRefresh: () => void;
  onImportAccounts: (item: PlaidItem) => void;
  onReconnect: (item: PlaidItem) => void;
  reconnectingId: string | null;
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function accountSubtypeLabel(type: string | null, subtype: string | null): string {
  return (subtype ?? type ?? 'account').replace(/_/g, ' ');
}

function itemAccounts(item: PlaidItem): PlaidAccount[] {
  return item.accounts ?? [];
}

function linkedAccounts(item: PlaidItem): PlaidAccount[] {
  return itemAccounts(item).filter((a) => Boolean(a.fabriq_account_id));
}

export function ConnectedAccounts({
  items,
  onRefresh,
  onImportAccounts,
  onReconnect,
  reconnectingId,
}: ConnectedAccountsProps) {
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
        description: `${accountName}: ${added} new transaction(s)${skipped ? `, ${skipped} already imported` : ''}.`,
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
    .filter(({ item, accounts }) => accounts.length > 0 || itemAccounts(item).length === 0);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className={`${plaidUi.institutionAvatar} mb-4 h-12 w-12 text-base`}>
            <Landmark className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No bank connections yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Connect a bank and map accounts to your chart of accounts to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {visibleItems.map(({ item, accounts }) => {
        const institutionName = item.institution_name ?? 'Bank connection';
        const initial = institutionName.charAt(0).toUpperCase();
        const userError = item.status === 'error' ? plaidUserError(item.error_code) : null;

        return (
          <Card key={item.id}>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={plaidUi.institutionAvatar}>{initial}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-lg truncate">{institutionName}</CardTitle>
                      {item.status !== 'error' && (
                        <Badge className="shrink-0 border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
                          Healthy
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      Bank connected {formatDate(item.created_at)}
                      {' · '}
                      {accounts.length} account{accounts.length === 1 ? '' : 's'}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {item.status === 'error' && (
                    <Button
                      size="sm"
                      onClick={() => onReconnect(item)}
                      disabled={reconnectingId === item.id}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-1 ${reconnectingId === item.id ? 'animate-spin' : ''}`}
                      />
                      {reconnectingId === item.id ? 'Reconnecting…' : 'Reconnect'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onImportAccounts(item)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add accounts
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
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
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {userError && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="font-medium text-amber-950 dark:text-amber-100">
                    {userError.title}
                  </p>
                  <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
                    {userError.message}
                  </p>
                </div>
              )}
              {accounts.length === 0 ? (
                item.status === 'error' ? null : (
                <p className="text-sm text-muted-foreground">
                  No accounts mapped yet.
                </p>
                )
              ) : (
              <ul className={`${plaidUi.listDivide} rounded-md border`}>
                {accounts.map((acct) => {
                  const syncKey = accountSyncKey(item.id, acct.plaid_account_id);
                  const isSyncing = syncingAccountKey === syncKey;
                  const displayName = acct.fabriq_account_name ?? acct.name ?? 'Account';

                  return (
                    <li key={acct.plaid_account_id}>
                      <div
                        className={`${plaidUi.accountRow} flex-col sm:flex-row sm:items-center gap-3`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 w-full">
                          <div className={plaidUi.accountIcon}>
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 text-left flex-1">
                            <p className={plaidUi.accountName}>
                              {displayName}
                              {acct.mask && (
                                <span className="text-muted-foreground font-normal">
                                  {' '}
                                  · {acct.mask}
                                </span>
                              )}
                            </p>
                            <p className={plaidUi.accountMeta}>
                              {accountSubtypeLabel(acct.type, acct.subtype)}
                              {acct.fabriq_connected_at && (
                                <> · Mapped {formatDate(acct.fabriq_connected_at)}</>
                              )}
                              {acct.fabriq_last_sync_at && (
                                <> · Synced {formatDateTime(acct.fabriq_last_sync_at)}</>
                              )}
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full sm:w-auto shrink-0"
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
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
