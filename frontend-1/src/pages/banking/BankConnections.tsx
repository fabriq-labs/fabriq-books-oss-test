import React, { useCallback, useEffect, useState } from 'react';
import { plaidAPI, PlaidItem } from '@/api/plaidApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectBankButton } from '@/components/plaid/ConnectBankDialog';
import { ConnectedAccounts } from '@/components/plaid/ConnectedAccounts';
import { PlaidAccountSelectPanel } from '@/components/plaid/PlaidAccountSelectPanel';
import { useToast } from '@/hooks/use-toast';
import { Landmark, Loader2 } from 'lucide-react';

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
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load bank connections',
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
    toast({
      title: 'Accounts connected',
      description: 'Bank accounts are mapped and ready to sync.',
    });
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
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            <Landmark className="mr-2 h-6 w-6" />
            Bank connections
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Connect your bank, map accounts to your chart of accounts, and sync transactions.
          </p>
        </div>
        <ConnectBankButton onConnected={handleConnected} disabled={!plaidConfigured} />
      </div>

      {!plaidConfigured && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Plaid not configured</CardTitle>
            <CardDescription>
              Bank connections require Plaid credentials on the server. Contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {pendingImportItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Finish connecting accounts</CardTitle>
            <CardDescription className="text-amber-900/80 dark:text-amber-200/80">
              Select and map accounts for these bank connections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingImportItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
              >
                <span className="text-sm font-medium">
                  {item.institution_name ?? 'Bank connection'}
                </span>
                <Button variant="outline" size="sm" onClick={() => openImportStep(item)}>
                  Select accounts
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading connections…</span>
        </div>
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
