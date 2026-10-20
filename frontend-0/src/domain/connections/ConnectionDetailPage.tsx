import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Pencil, RefreshCw } from 'lucide-react';
import {
  erpConnectionsAPI,
  type ErpConnectionSummary,
  type SyncMode,
} from '@/api/metadataApi';
import { viewAPI } from '@/api/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { SYNC_MODE_OPTIONS, syncModeOption } from './types';
import {
  DisclosureButton,
  StatusBadge,
  environmentLabel,
  formatDateTime,
  selectClassName,
  type Tone,
} from './ConnectionParts';

const VIEW = 'source_system_view';
const DEFAULT_API_BASE = 'https://api.airbyte.com';

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

type SyncStatus = ViewRow['last_sync_status'];

const describeHealth = (
  isActive: boolean,
  status: SyncStatus,
  lastSyncAt: string | null | undefined
): { label: string; tone: Tone; detail?: string } => {
  if (!isActive) return { label: 'Paused', tone: 'neutral', detail: 'This connection is turned off.' };
  switch (status?.status) {
    case 'in_progress':
      return { label: 'Import running', tone: 'neutral', detail: 'Refresh in a minute to see the result.' };
    case 'success':
      return { label: 'Healthy', tone: 'positive', detail: 'The last import finished without problems.' };
    case 'error':
      return { label: 'Needs attention', tone: 'warning', detail: 'The last import didn’t finish.' };
    default:
      if (!status?.status && !lastSyncAt) {
        return { label: 'Not imported yet', tone: 'neutral' };
      }
      return { label: status?.status ?? 'Unknown', tone: 'neutral' };
  }
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
  const [showMoreModes, setShowMoreModes] = useState(false);
  const [showErrorDetail, setShowErrorDetail] = useState(false);

  const [editingImportSettings, setEditingImportSettings] = useState(false);
  const [showImportAdvanced, setShowImportAdvanced] = useState(false);
  const [airbyteConnectionId, setAirbyteConnectionId] = useState('');
  const [airbyteClientId, setAirbyteClientId] = useState('');
  const [airbyteClientSecret, setAirbyteClientSecret] = useState('');
  const [airbyteApiBase, setAirbyteApiBase] = useState(DEFAULT_API_BASE);
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
        title: 'Couldn’t load this connection',
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

  const resetImportForm = () => {
    setAirbyteConnectionId('');
    setAirbyteClientId('');
    setAirbyteClientSecret('');
    setAirbyteApiBase(DEFAULT_API_BASE);
    setShowImportAdvanced(false);
  };

  const handleSync = async () => {
    if (!id) return;
    const option = syncModeOption(syncMode);
    setSyncing(true);
    try {
      await erpConnectionsAPI.triggerSync(id, syncMode);
      toast({
        title: option?.startedTitle ?? 'Import started',
        description: 'This usually takes a few minutes. Refresh to see the latest status.',
      });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Couldn’t start the import',
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
      resetImportForm();
      setEditingImportSettings(false);
      toast({
        title: 'Import settings saved',
        description: 'You can import from QuickBooks now.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Couldn’t save import settings',
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
          description: 'QuickBooks didn’t return any Accounts Payable accounts.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Couldn’t load accounts from QuickBooks',
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
      setExpenseAccounts([]);
      toast({ title: 'Purchase account saved', description: account.account_name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Couldn’t save purchase account',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSavingPurchase(false);
    }
  };

  if (loading && !row) {
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
          Back to connections
        </Button>
      </div>
    );
  }

  const isActive = Boolean(row.is_active);
  const hasOAuth = Boolean(flags?.has_oauth);
  const hasImportSettings = Boolean(flags?.has_extraction_config);
  const syncStatus = row.last_sync_status || flags?.last_sync_status;
  const syncInProgress = syncStatus?.status === 'in_progress';
  const lastSyncAt = row.last_sync_at || flags?.last_sync_at;
  const health = describeHealth(isActive, syncStatus, lastSyncAt);
  const lastRunMode = syncModeOption(syncStatus?.sync_mode);
  const purchaseName =
    row.default_purchase_account_name || flags?.default_purchase_account_name || null;

  const selectedMode = syncModeOption(syncMode) ?? SYNC_MODE_OPTIONS[0];
  const modeBlockedBySettings = selectedMode.needsImportSettings && !hasImportSettings;
  const visibleModes = SYNC_MODE_OPTIONS.filter(
    (opt) => !opt.advanced || showMoreModes || opt.value === syncMode
  );
  const hasHiddenModes = SYNC_MODE_OPTIONS.some((opt) => opt.advanced && opt.value !== syncMode);
  const showImportForm = !hasImportSettings || editingImportSettings;
  const canSaveImportSettings =
    airbyteConnectionId.trim() !== '' &&
    airbyteClientId.trim() !== '' &&
    airbyteClientSecret.trim() !== '';

  const companySummary = [
    flags?.realm_id ? `Company ${flags.realm_id}` : null,
    environmentLabel(flags?.oauth_environment),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      {/* Header */}
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate('/settings/connections')}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Connections
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
              {hasOAuth ? (
                <StatusBadge tone="positive">Connected</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Not connected</StatusBadge>
              )}
              {!isActive ? <StatusBadge tone="neutral">Paused</StatusBadge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {hasOAuth ? 'Connected to QuickBooks' : 'QuickBooks'}
              {companySummary ? ` · ${companySummary}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/source_system/${id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit connection
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {!hasOAuth ? (
        <Alert>
          <AlertTitle>Finish connecting to QuickBooks</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Fabriq needs your QuickBooks sign-in details before it can work with this company.</p>
            <Button size="sm" asChild>
              <Link to={`/source_system/${id}/edit`}>Connect to QuickBooks</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Overview */}
      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-muted-foreground">Fabriq entity</dt>
          <dd className="font-medium">{row.entity?.name ?? 'Not linked'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Last import</dt>
          <dd className="font-medium">{formatDateTime(lastSyncAt) ?? 'Never'}</dd>
          {lastSyncAt && lastRunMode ? (
            <dd className="text-xs text-muted-foreground">{lastRunMode.pastLabel}</dd>
          ) : null}
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Health</dt>
          <dd>
            <StatusBadge tone={health.tone}>
              {syncInProgress ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              {health.label}
            </StatusBadge>
          </dd>
          {health.detail ? (
            <dd className="text-xs text-muted-foreground">{health.detail}</dd>
          ) : null}
          {syncStatus?.status === 'error' && syncStatus.message ? (
            <dd className="space-y-1">
              <DisclosureButton
                open={showErrorDetail}
                onToggle={() => setShowErrorDetail((v) => !v)}
                controls="sync-error-detail"
              >
                {showErrorDetail ? 'Hide details' : 'Show details'}
              </DisclosureButton>
              {showErrorDetail ? (
                <p
                  id="sync-error-detail"
                  className="break-words rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
                >
                  {syncStatus.message}
                </p>
              ) : null}
            </dd>
          ) : null}
        </div>
      </dl>

      {/* Import from QuickBooks + import settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import from QuickBooks</CardTitle>
          <CardDescription>
            Bring customers, vendors, items, accounts and invoices from QuickBooks into Fabriq.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <RadioGroup
              value={syncMode}
              onValueChange={(value) => setSyncMode(value as SyncMode)}
              className="gap-2"
              aria-label="What to run"
            >
              {visibleModes.map((opt) => (
                <Label
                  key={opt.value}
                  htmlFor={`mode-${opt.value}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal transition-colors',
                    syncMode === opt.value ? 'border-primary bg-muted/40' : 'hover:bg-muted/30'
                  )}
                >
                  <RadioGroupItem id={`mode-${opt.value}`} value={opt.value} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-sm text-muted-foreground">{opt.hint}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
            {hasHiddenModes || showMoreModes ? (
              <div>
                <DisclosureButton
                  open={showMoreModes}
                  onToggle={() => setShowMoreModes((v) => !v)}
                >
                  {showMoreModes ? 'Fewer options' : 'More options'}
                </DisclosureButton>
              </div>
            ) : null}

            {modeBlockedBySettings ? (
              <p className="text-sm text-muted-foreground">
                Set up data import below to pull fresh data from QuickBooks. You can still
                reprocess data that was imported before.
              </p>
            ) : null}

            <div>
              <Button
                type="button"
                disabled={syncing || syncInProgress || !isActive || modeBlockedBySettings}
                onClick={() => void handleSync()}
              >
                {syncing || syncInProgress ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Import running…
                  </>
                ) : (
                  selectedMode.actionLabel
                )}
              </Button>
            </div>
            {!isActive ? (
              <p className="text-sm text-muted-foreground">
                This connection is paused. Turn it back on to import.
              </p>
            ) : null}
          </div>

          <Separator />

          <section className="space-y-4" aria-labelledby="import-settings-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 id="import-settings-heading" className="text-sm font-semibold">
                  {hasImportSettings ? 'Import settings' : 'Set up data import'}
                </h3>
                {hasImportSettings ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Import settings saved
                    {flags?.modified_at ? ` · last updated ${formatDateTime(flags.modified_at)}` : ''}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Needed to pull data from QuickBooks. Fabriq uses an Airbyte connection your
                    admin manages to fetch the data.
                  </p>
                )}
              </div>
              {hasImportSettings && !editingImportSettings ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingImportSettings(true)}
                >
                  Update import settings
                </Button>
              ) : null}
            </div>

            {showImportForm ? (
              <div className="space-y-4">
                {hasImportSettings ? (
                  <p className="text-sm text-muted-foreground">
                    Saved values stay hidden. Enter all three to replace them.
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="ab_conn">Import connection ID</Label>
                  <Input
                    id="ab_conn"
                    value={airbyteConnectionId}
                    onChange={(e) => setAirbyteConnectionId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ab_cid">API client ID</Label>
                    <Input
                      id="ab_cid"
                      value={airbyteClientId}
                      onChange={(e) => setAirbyteClientId(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ab_sec">API client secret</Label>
                    <Input
                      id="ab_sec"
                      type="password"
                      autoComplete="off"
                      value={airbyteClientSecret}
                      onChange={(e) => setAirbyteClientSecret(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <DisclosureButton
                    open={showImportAdvanced}
                    onToggle={() => setShowImportAdvanced((v) => !v)}
                    controls="import-advanced"
                  >
                    Advanced
                  </DisclosureButton>
                </div>
                {showImportAdvanced ? (
                  <div id="import-advanced" className="space-y-4 rounded-md border bg-muted/30 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="ab_base">API address</Label>
                      <Input
                        id="ab_base"
                        value={airbyteApiBase}
                        onChange={(e) => setAirbyteApiBase(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave as is unless you host your own instance.
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The connection’s destination must write to the Postgres schema{' '}
                      <code>datalake</code>, with streams named <code>qb_customers</code>,{' '}
                      <code>qb_vendors</code>, <code>qb_items</code>, <code>qb_accounts</code>,{' '}
                      <code>qb_invoices</code>, and tax streams when available.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={savingExtract || !canSaveImportSettings}
                    onClick={() => void handleSaveExtraction()}
                  >
                    {savingExtract ? 'Saving…' : 'Save import settings'}
                  </Button>
                  {hasImportSettings ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={savingExtract}
                      onClick={() => {
                        resetImportForm();
                        setEditingImportSettings(false);
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </CardContent>
      </Card>

      {/* Optional write-back */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">Send to QuickBooks</CardTitle>
            <StatusBadge tone="neutral">Optional</StatusBadge>
          </div>
          <CardDescription>
            Optional — needed only when you create purchase orders in QuickBooks from Fabriq.
            Importing works without it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 text-sm">
              <p className="text-muted-foreground">Default purchase account</p>
              <p className={purchaseName ? 'font-medium' : 'text-muted-foreground'}>
                {purchaseName ?? 'Not set'}
              </p>
            </div>
            {expenseAccounts.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingAccounts || !isActive || !hasOAuth}
                onClick={() => void handleLoadAccounts()}
              >
                {loadingAccounts
                  ? 'Loading accounts…'
                  : purchaseName
                    ? 'Change account'
                    : 'Choose account'}
              </Button>
            ) : null}
          </div>
          {!hasOAuth ? (
            <p className="text-sm text-muted-foreground">
              Connect to QuickBooks first to choose an account.
            </p>
          ) : null}
          {expenseAccounts.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="purchase_account">Accounts Payable accounts in QuickBooks</Label>
              <div className="flex gap-2">
                <select
                  id="purchase_account"
                  className={selectClassName}
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
                <Button
                  type="button"
                  variant="ghost"
                  disabled={savingPurchase}
                  onClick={() => setExpenseAccounts([])}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {savingPurchase ? 'Saving…' : 'Your choice is saved as soon as you pick it.'}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionDetailPage;
