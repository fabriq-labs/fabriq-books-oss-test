import React, { useEffect, useState } from 'react';
import { plaidAPI, PlaidItem } from '@/api/plaidApi';
import { viewAPI } from '@/api/metadataApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Trash2, Building2 } from 'lucide-react';

interface FabriqAccount {
  id: string;
  name?: string;
  code?: string;
}

interface ConnectedAccountsProps {
  items: PlaidItem[];
  onRefresh: () => void;
}

export function ConnectedAccounts({ items, onRefresh }: ConnectedAccountsProps) {
  const { toast } = useToast();
  const [fabriqAccounts, setFabriqAccounts] = useState<FabriqAccount[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    viewAPI
      .search('account', 'account_view', 1, 500)
      .then((res: any) => setFabriqAccounts(res?.data ?? []))
      .catch(() => setFabriqAccounts([]));
  }, []);

  const handleSync = async (itemId: string) => {
    setSyncingId(itemId);
    try {
      const res = await plaidAPI.syncItem(itemId);
      const { added, skipped } = res.data;
      toast({
        title: 'Sync complete',
        description: `${added} new transaction(s) imported${skipped ? `, ${skipped} skipped` : ''}.`,
      });
      onRefresh();
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err.message ?? 'Could not sync transactions',
        variant: 'destructive',
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    try {
      await plaidAPI.deleteItem(itemId);
      toast({ title: 'Disconnected', description: 'Bank connection removed.' });
      onRefresh();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message ?? 'Could not disconnect',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleAccountMapping = async (
    itemId: string,
    plaidAccountId: string,
    fabriqAccountId: string,
  ) => {
    try {
      await plaidAPI.updateAccountMapping(
        itemId,
        plaidAccountId,
        fabriqAccountId === '__none__' ? null : fabriqAccountId,
      );
      toast({ title: 'Account mapped', description: 'Fabriq account updated.' });
      onRefresh();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message ?? 'Could not update mapping',
        variant: 'destructive',
      });
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No bank accounts connected yet. Use the button above to link your first account via Plaid.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                {item.institution_name ?? 'Bank connection'}
              </CardTitle>
              <CardDescription>
                Connected {new Date(item.created_at).toLocaleDateString()}
                {item.last_synced_at && (
                  <> · Last synced {new Date(item.last_synced_at).toLocaleString()}</>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSync(item.id)}
                disabled={syncingId === item.id}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${syncingId === item.id ? 'animate-spin' : ''}`} />
                Sync
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
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {item.accounts.map((acct) => (
                <div
                  key={acct.plaid_account_id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between border rounded-md p-3"
                >
                  <div>
                    <div className="font-medium">
                      {acct.name ?? 'Account'}
                      {acct.mask && <span className="text-muted-foreground"> ···{acct.mask}</span>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {acct.subtype ?? acct.type ?? 'account'}
                      {acct.fabriq_account_id && (
                        <Badge variant="secondary" className="ml-2">Mapped</Badge>
                      )}
                    </div>
                  </div>
                  <Select
                    value={acct.fabriq_account_id ?? '__none__'}
                    onValueChange={(val) => handleAccountMapping(item.id, acct.plaid_account_id, val)}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Map to Fabriq account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Not mapped —</SelectItem>
                      {fabriqAccounts.map((fa) => (
                        <SelectItem key={fa.id} value={fa.id}>
                          {fa.name ?? fa.code ?? fa.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
