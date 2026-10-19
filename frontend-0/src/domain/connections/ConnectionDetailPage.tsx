import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  erpConnectionsAPI,
  type ErpConnectionSummary,
  type SyncMode,
} from '@/api/metadataApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SYNC_MODE_OPTIONS } from './types';

const ConnectionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [row, setRow] = useState<ErpConnectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncMode, setSyncMode] = useState<SyncMode>('full_sync');
  const [syncing, setSyncing] = useState(false);

  const [airbyteConnectionId, setAirbyteConnectionId] = useState('');
  const [airbyteClientId, setAirbyteClientId] = useState('');
  const [airbyteClientSecret, setAirbyteClientSecret] = useState('');
  const [airbyteApiBase, setAirbyteApiBase] = useState('https://api.airbyte.com');
  const [savingExtract, setSavingExtract] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await erpConnectionsAPI.getById(id);
      setRow(res.data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load connection',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

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
      setRow(res.data);
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

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl py-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 py-6">
        <p className="text-sm text-muted-foreground">Connection not found.</p>
        <Button variant="outline" onClick={() => navigate('/settings/connections')}>
          Back to list
        </Button>
      </div>
    );
  }

  const syncInProgress = row.last_sync_status?.status === 'in_progress';

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
              {row.realm_id ? ` · Realm ${row.realm_id}` : ''}
              {row.oauth_environment ? ` · ${row.oauth_environment}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/settings/connections/${row.id}/edit`}>Edit OAuth</Link>
          </Button>
        </div>
      </div>

      {!row.has_extraction_config ? (
        <Alert>
          <AlertTitle>Airbyte not configured</AlertTitle>
          <AlertDescription>
            Forward sync needs Airbyte credentials on this connection. Fill the Airbyte section
            below (connection UUID from your Airbyte workspace), then run <strong>Full sync</strong>.
            If raw tables already exist in <code>datalake.qb_*</code>, you can use{' '}
            <strong>Transform only</strong>.
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
            <span className="text-muted-foreground">OAuth</span>
            <span>{row.has_oauth ? 'Saved' : 'Missing'}</span>
            <span className="text-muted-foreground">Airbyte</span>
            <span>{row.has_extraction_config ? 'Configured' : 'Missing'}</span>
            <span className="text-muted-foreground">Last sync</span>
            <span>
              {row.last_sync_at ? new Date(row.last_sync_at).toLocaleString() : '—'}
            </span>
            <span className="text-muted-foreground">Last status</span>
            <span>{row.last_sync_status?.status ?? '—'}</span>
          </div>
          {row.last_sync_status?.message ? (
            <p className="text-muted-foreground">{row.last_sync_status.message}</p>
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
            {savingExtract ? 'Saving…' : row.has_extraction_config ? 'Update Airbyte config' : 'Save Airbyte config'}
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
          <p className="text-xs text-muted-foreground">
            Requires a user API key (<code>POST /api/auth/generate-api-key</code> once) and the
            sync service on loopback. After success, check{' '}
            <code>public.customer</code> / <code>invoice</code> for rows with{' '}
            <code>source_system_id</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionDetailPage;
