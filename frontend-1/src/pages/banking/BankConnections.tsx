import React, { useCallback, useEffect, useState } from 'react';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { plaidAPI, PlaidItem } from '@/api/plaidApi';
import { PlaidLinkButton } from '@/components/plaid/PlaidLinkButton';
import { ConnectedAccounts } from '@/components/plaid/ConnectedAccounts';
import { useToast } from '@/hooks/use-toast';

export default function BankConnectionsPage() {
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

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

  const loadLinkToken = useCallback(async () => {
    try {
      const res = await plaidAPI.createLinkToken();
      setLinkToken(res.link_token);
    } catch (err: any) {
      setLinkToken(null);
      if (!err.message?.includes('not configured')) {
        toast({
          title: 'Plaid unavailable',
          description: err.message ?? 'Could not initialize Plaid Link',
          variant: 'destructive',
        });
      }
    }
  }, [toast]);

  useEffect(() => {
    loadItems();
    loadLinkToken();
  }, [loadItems, loadLinkToken]);

  const handlePlaidSuccess = async (
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
  ) => {
    setConnecting(true);
    try {
      await plaidAPI.exchangeToken(publicToken, {
        institution: metadata.institution,
      });
      toast({
        title: 'Bank connected',
        description: `${metadata.institution?.name ?? 'Institution'} linked successfully.`,
      });
      await loadItems();
      await loadLinkToken();
    } catch (err: any) {
      toast({
        title: 'Connection failed',
        description: err.message ?? 'Could not complete bank link',
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bank connections</h1>
          <p className="text-muted-foreground mt-1">
            Connect bank accounts via Plaid to automatically import transactions into postings.
          </p>
        </div>
        <PlaidLinkButton
          linkToken={linkToken}
          onSuccess={handlePlaidSuccess}
          disabled={connecting || !linkToken}
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading connections…</p>
      ) : (
        <ConnectedAccounts items={items} onRefresh={loadItems} />
      )}
    </div>
  );
}
