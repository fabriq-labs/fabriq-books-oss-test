import React, { useCallback, useEffect, useState } from 'react';
import { plaidAPI, PlaidItem } from '@/api/plaidApi';
import { Button } from '@/components/ui/button';
import { ConnectBankButton } from '@/components/plaid/ConnectBankDialog';
import { ConnectedAccounts } from '@/components/plaid/ConnectedAccounts';
import { PlaidAccountSelectPanel } from '@/components/plaid/PlaidAccountSelectPanel';
import { useToast } from '@/hooks/use-toast';

export default function BankConnectionsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [plaidConfigured, setPlaidConfigured] = useState(true);
  const [importItem, setImportItem] = useState<PlaidItem | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await plaidAPI.listItems();
      setItems(res.data ?? []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message ?? 'Failed to load bank connections',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadItems();
    plaidAPI.getConfig().catch((err: Error) => {
      if (err.message?.includes('not configured')) {
        setPlaidConfigured(false);
      }
    });
  }, [loadItems]);

  const openImportStep = async (item: PlaidItem) => {
    try {
      const fresh = await plaidAPI.getItem(item.id);
      setImportItem(fresh.data);
    } catch {
      setImportItem(item);
    }
  };

  const handleImportComplete = async () => {
    setImportItem(null);
    await loadItems();
  };

  const handleConnected = (item: PlaidItem) => {
    setImportItem(item);
    loadItems();
  };

  const pendingImportItems = items.filter(
    (item) =>
      item.accounts.some((a) => !a.fabriq_account_id) &&
      !item.accounts.some((a) => a.fabriq_account_id),
  );

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bank connections</h1>
          <p className="text-muted-foreground mt-1">
            Connect your bank in Fabriq, choose which accounts to import, then map and sync
            transactions.
          </p>
        </div>
        <ConnectBankButton onConnected={handleConnected} disabled={!plaidConfigured} />
      </div>

      {pendingImportItems.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Finish importing accounts</p>
          <ul className="mt-2 space-y-1">
            {pendingImportItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>{item.institution_name ?? 'Bank connection'}</span>
                <Button variant="outline" size="sm" onClick={() => openImportStep(item)}>
                  Select accounts
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading connections…</p>
      ) : (
        <ConnectedAccounts
          items={items}
          onRefresh={loadItems}
          onImportAccounts={openImportStep}
        />
      )}

      <PlaidAccountSelectPanel
        open={importItem !== null}
        item={importItem}
        onComplete={handleImportComplete}
        onCancel={() => setImportItem(null)}
      />
    </div>
  );
}
