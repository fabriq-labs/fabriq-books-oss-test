import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  erpConnectionsAPI,
  type ErpConnectionSummary,
  type SyncMode,
} from '@/api/metadataApi';
import { viewAPI } from '@/api/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SYNC_MODE_OPTIONS } from './types';

const VIEW = 'source_system_view';

type ViewRow = {
  id?: string;
  name?: string;
  system_type?: string;
  is_active?: boolean;
  entity_id?: string | null;
  entity?: { id?: string; name?: string } | null;
  default_purchase_account_id?: string | null;
  default_purchase_account_name?: string | null;
  last_sync_at?: string | null;
  last_sync_status?: { status?: string; message?: string; sync_mode?: string } | null;
  created_at?: string;
  modified_at?: string;
};

const ConnectionDetailPage: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId?: string }>();
  const viewName = viewId || VIEW;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [row, setRow] = useState<ViewRow | null>(null);
  const [flags, setFlags] = useState<ErpConnectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncMode, setSyncMode] = useState<SyncMode>('full_sync');
  const [syncing, setSyncing] = useState(false);

  const [airbyteConnectionId, setAirbyteConnectionId] = useState('');
  const [airbyteClientId, setAirbyteClientId] = useState('');
  const [airbyteClientSecret, setAirbyteClientSecret] = useState('');
  const [airbyteApiBase, setAirbyteApiBase] = useState('https://api.airbyte.com');
  const [savingExtract, setSavingExtract] = useState(false);

  const [expenseAccounts, setExpenseAccounts] = useState<
    Array<{ account_id: string; account_name: string }>
  >([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [viewRes, flagsRes] = await Promise.all([
        viewAPI.getById('source_system', id, viewName),
        erpConnectionsAPI.getFlags(id),
      ]);
      setRow((viewRes as { data?: ViewRow }).data ?? null);
      setFlags(flagsRes.data ?? null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load connection',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setRow(null);
      setFlags(null);
    } finally {
      setLoading(false);
    }
  }, [id, viewName, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    if (!id) return;
    setSyncing(true);
    try {
      const res = await erpConnectionsAPI.triggerSync(id, syncMode);
      toast({
        title: 'Sync queued',
        description: res.message || `Mode: ${syncMode}. Refresh in a minute to see status.`,
      });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveExtraction = async () => {
    if (!id) return;
    setSavingExtract(true);
    try {
      const res = await erpConnectionsAPI.setExtractionConfig(id, {
        airbyte_connection_id: airbyteConnectionId.trim(),
        client_id: airbyteClientId.trim(),
        client_secret: airbyteClientSecret.trim(),
        api_base: airbyteApiBase.trim() || undefined,
      });
      setFlags(res.data);
      setAirbyteClientSecret('');
      toast({ title: 'Airbyte config saved', description: 'You can run Full sync now.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to save Airbyte config',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSavingExtract(false);
    }
  };

  const handleLoadAccounts = async () => {
    if (!id) return;
    setLoadingAccounts(true);
    try {
      const res = await erpConnectionsAPI.fetchExpenseAccounts(id);
      if (!res.success) throw new Error(res.message || 'Failed to fetch accounts');
      setExpenseAccounts(res.data || []);
      if (!(res.data || []).length) {
        toast({
          variant: 'destructive',
          title: 'No accounts found',
          description: 'No Accounts Payable accounts returned from QuickBooks.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load accounts',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setExpenseAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSelectPurchaseAccount = async (accountId: string) => {
    if (!id) return;
    const account = expenseAccounts.find((a) => a.account_id === accountId);
    if (!account) return;
    setSavingPurchase(true);
    try {
      const res = await erpConnectionsAPI.setDefaultPurchaseAccount(
        id,
        account.account_id,
        account.account_name
      );
      setFlags(res.data);
      setRow((prev) =>
        prev
          ? {
              ...prev,
              default_purchase_account_id: account.account_id,
              default_purchase_account_name: account.account_name,
            }
          : prev
      );
      toast({ title: 'Purchase account saved', description: account.account_name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to save purchase account',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSavingPurchase(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl py-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!row || !id) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 py-6">
        <p className="text-sm text-muted-foreground">Connection not found.</p>
        <Button variant="outline" onClick={() => navigate('/settings/connections')}>
          Back to list
        </Button>
      </div>
    );
  }

  const syncStatus = row.last_sync_status || flags?.last_sync_status;
  const syncInProgress = syncStatus?.status === 'in_progress';
  const purchaseName =
    row.default_purchase_account_name || flags?.default_purchase_account_name || null;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings/connections')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
            <p className="text-sm text-muted-foreground">
              {row.system_type}
              {flags?.realm_id ? ` · Realm ${flags.realm_id}` : ''}
              {flags?.oauth_environment ? ` · ${flags.oauth_environment}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/source_system/${id}/edit`}>Edit OAuth</Link>
          </Button>
        </div>
      </div>

      {!flags?.has_extraction_config ? (
        <Alert>
          <AlertTitle>Airbyte not configured</AlertTitle>
          <AlertDescription>
            Forward sync needs Airbyte credentials on this connection. Fill the Airbyte section
            below, then run <strong>Full sync</strong>. If raw tables already exist in{' '}
            <code>datalake.qb_*</code>, use <strong>Transform only</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Active</span>
            <span>{row.is_active ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Entity</span>
            <span>{row.entity?.name ?? '—'}</span>
            <span className="text-muted-foreground">OAuth</span>
            <span>{flags?.has_oauth ? 'Saved' : 'Missing'}</span>
            <span className="text-muted-foreground">Airbyte</span>
            <span>{flags?.has_extraction_config ? 'Configured' : 'Missing'}</span>
            <span className="text-muted-foreground">Purchase account</span>
            <span>{purchaseName ?? '—'}</span>
            <span className="text-muted-foreground">Last sync</span>
            <span>
              {row.last_sync_at ? new Date(row.last_sync_at).toLocaleString() : '—'}
            </span>
            <span className="text-muted-foreground">Last status</span>
            <span>{syncStatus?.status ?? '—'}</span>
          </div>
          {syncStatus?.message ? (
            <p className="text-muted-foreground">{syncStatus.message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Default purchase account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Used when creating purchase orders in QuickBooks. Loads Accounts Payable accounts from
            the connected company.
          </p>
          {purchaseName ? (
            <p className="text-sm font-medium">{purchaseName}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No default selected.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loadingAccounts || !row.is_active}
              onClick={() => void handleLoadAccounts()}
            >
              {loadingAccounts ? 'Loading…' : purchaseName ? 'Change account' : 'Select account'}
            </Button>
          </div>
          {expenseAccounts.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="purchase_account">Accounts from QuickBooks</Label>
              <select
                id="purchase_account"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={savingPurchase}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) void handleSelectPurchaseAccount(e.target.value);
                }}
              >
                <option value="">Select an account…</option>
                {expenseAccounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.account_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Airbyte extraction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Destination must write to Postgres schema <code>datalake</code> with streams landing as{' '}
            <code>qb_customers</code>, <code>qb_vendors</code>, <code>qb_items</code>,{' '}
            <code>qb_accounts</code>, <code>qb_invoices</code>, tax streams when available.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ab_conn">Airbyte connection UUID</Label>
            <Input
              id="ab_conn"
              value={airbyteConnectionId}
              onChange={(e) => setAirbyteConnectionId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ab_cid">Airbyte client ID</Label>
            <Input
              id="ab_cid"
              value={airbyteClientId}
              onChange={(e) => setAirbyteClientId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ab_sec">Airbyte client secret</Label>
            <Input
              id="ab_sec"
              type="password"
              autoComplete="off"
              value={airbyteClientSecret}
              onChange={(e) => setAirbyteClientSecret(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ab_base">API base (optional)</Label>
            <Input
              id="ab_base"
              value={airbyteApiBase}
              onChange={(e) => setAirbyteApiBase(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={savingExtract}
            onClick={() => void handleSaveExtraction()}
          >
            {savingExtract
              ? 'Saving…'
              : flags?.has_extraction_config
                ? 'Update Airbyte config'
                : 'Save Airbyte config'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sync_mode">Mode</Label>
            <select
              id="sync_mode"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={syncMode}
              onChange={(e) => setSyncMode(e.target.value as SyncMode)}
            >
              {SYNC_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.hint}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={syncing || syncInProgress || !row.is_active}
            onClick={() => void handleSync()}
          >
            {syncing || syncInProgress ? 'Sync in progress…' : 'Run sync'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionDetailPage;
