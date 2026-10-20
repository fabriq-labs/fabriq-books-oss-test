import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { erpConnectionsAPI } from '@/api/metadataApi';
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
import { useToast } from '@/components/ui/use-toast';
import { entityLabel, useEntity } from '@/contexts/EntityContext';
import { emptyQboOAuth, type QboOAuthForm } from './types';
import { StatusBadge, environmentLabel, selectClassName } from './ConnectionParts';

const OAUTH_FIELDS = [
  ['client_id', 'Client ID', false],
  ['client_secret', 'Client secret', true],
  ['refresh_token', 'Refresh token', true],
  ['realm_id', 'Company ID (Realm ID)', false],
] as const;

/**
 * Create or edit QuickBooks OAuth connection.
 * On create: requires full oauth + successful test.
 * On edit: secrets can be left blank to keep existing (re-save currently requires full oauth).
 */
const ConnectionFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { entities, currentEntityId } = useEntity();

  const [name, setName] = useState('QuickBooks Online');
  const [entityId, setEntityId] = useState<string>(currentEntityId ?? '');
  const [oauth, setOauth] = useState<QboOAuthForm>(emptyQboOAuth);
  const [purchaseAccountId, setPurchaseAccountId] = useState('');
  const [purchaseAccountName, setPurchaseAccountName] = useState('');
  const [expenseAccounts, setExpenseAccounts] = useState<
    Array<{ account_id: string; account_name: string }>
  >([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testedOk, setTestedOk] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [savedConnection, setSavedConnection] = useState<{
    hasOAuth: boolean;
    realmId: string | null;
    environment: string | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    erpConnectionsAPI
      .getFlags(id)
      .then((res) => {
        const row = res.data;
        setName(row.name || 'QuickBooks Online');
        setEntityId(row.entity_id || '');
        setPurchaseAccountId(row.default_purchase_account_id || '');
        setPurchaseAccountName(row.default_purchase_account_name || '');
        setSavedConnection({
          hasOAuth: row.has_oauth,
          realmId: row.realm_id,
          environment: row.oauth_environment,
        });
        setOauth((prev) => ({
          ...prev,
          realm_id: row.realm_id || '',
          environment: (row.oauth_environment as QboOAuthForm['environment']) || 'sandbox',
        }));
      })
      .catch((error) => {
        toast({
          variant: 'destructive',
          title: 'Couldn’t load this connection',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  const setField = (key: keyof QboOAuthForm, value: string) => {
    setTestedOk(false);
    setOauth((prev) => ({ ...prev, [key]: value }));
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await erpConnectionsAPI.testConnection(
        'quickbooks',
        oauth,
        isEdit ? id : undefined
      );
      if (!res.success) {
        throw new Error(res.message || 'Test failed');
      }
      setTestedOk(true);
      toast({ title: 'Connected to QuickBooks', description: res.message });
    } catch (error) {
      setTestedOk(false);
      toast({
        variant: 'destructive',
        title: 'Couldn’t reach QuickBooks',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleLoadAccounts = async () => {
    if (!id) {
      toast({
        variant: 'destructive',
        title: 'Save the connection first',
        description: 'Accounts can be loaded once the connection is saved.',
      });
      return;
    }
    setLoadingAccounts(true);
    try {
      const res = await erpConnectionsAPI.fetchExpenseAccounts(id);
      if (!res.success) throw new Error(res.message || 'Failed to fetch accounts');
      setExpenseAccounts(res.data || []);
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

  const handleSave = async () => {
    if (!testedOk && !isEdit) {
      toast({
        variant: 'destructive',
        title: 'Test the connection first',
        description: 'Click “Test connection” to check these details before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await erpConnectionsAPI.upsert({
        system_type: 'quickbooks',
        name: name.trim() || 'QuickBooks Online',
        entity_id: entityId || null,
        connection_id: id,
        oauth,
        ...(purchaseAccountId
          ? {
              default_purchase_account_id: purchaseAccountId,
              default_purchase_account_name: purchaseAccountName || null,
            }
          : {}),
      });
      toast({ title: 'Connection saved', description: 'Your QuickBooks connection is ready.' });
      navigate(`/source_system/${res.data.id}/view/source_system_view`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Couldn’t save the connection',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-2xl py-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const savedSummary = savedConnection?.hasOAuth
    ? [
        savedConnection.realmId ? `Company ${savedConnection.realmId}` : null,
        environmentLabel(savedConnection.environment),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="container mx-auto max-w-2xl space-y-6 py-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() =>
            navigate(id ? `/source_system/${id}/view/source_system_view` : '/settings/connections')
          }
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {isEdit ? 'Back to connection' : 'Connections'}
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEdit ? 'Edit QuickBooks connection' : 'Connect QuickBooks'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fabriq uses these details to bring data in from your QuickBooks company.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity">Fabriq entity (optional)</Label>
            <select
              id="entity"
              className={selectClassName}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            >
              <option value="">— None —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {entityLabel(e) || e.id}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The business in Fabriq that this QuickBooks company belongs to.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">QuickBooks sign-in</CardTitle>
          <CardDescription>
            {isEdit
              ? 'Saved secrets stay hidden. Re-enter all four details to save changes on this page.'
              : 'Copy these from your app in the Intuit Developer portal.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEdit && savedConnection?.hasOAuth ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <StatusBadge tone="positive">Connected</StatusBadge>
              <span className="text-muted-foreground">
                Connected to QuickBooks{savedSummary ? ` · ${savedSummary}` : ''}
              </span>
            </div>
          ) : null}
          {OAUTH_FIELDS.map(([key, label, secret]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type={secret ? 'password' : 'text'}
                autoComplete="off"
                value={oauth[key]}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={isEdit && secret ? 'Saved — re-enter to save changes' : undefined}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="environment">QuickBooks company type</Label>
            <select
              id="environment"
              className={selectClassName}
              value={oauth.environment}
              onChange={(e) => setField('environment', e.target.value)}
            >
              <option value="sandbox">Sandbox (test company)</option>
              <option value="production">Production (live company)</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => void handleTest()} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save connection'}
            </Button>
          </div>
          {testedOk ? (
            <p className="text-sm text-emerald-700">Connection works — ready to save.</p>
          ) : null}
        </CardContent>
      </Card>

      {isEdit ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">Default purchase account</CardTitle>
              <StatusBadge tone="neutral">Optional</StatusBadge>
            </div>
            <CardDescription>
              Optional — needed only when you create purchase orders in QuickBooks from Fabriq.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              <span className="text-muted-foreground">Current: </span>
              {purchaseAccountName ? (
                <span className="font-medium">{purchaseAccountName}</span>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={loadingAccounts}
              onClick={() => void handleLoadAccounts()}
            >
              {loadingAccounts ? 'Loading accounts…' : 'Load accounts from QuickBooks'}
            </Button>
            {expenseAccounts.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="purchase_account">Accounts Payable accounts in QuickBooks</Label>
                <select
                  id="purchase_account"
                  className={selectClassName}
                  value={purchaseAccountId}
                  onChange={(e) => {
                    const account = expenseAccounts.find((a) => a.account_id === e.target.value);
                    setPurchaseAccountId(e.target.value);
                    setPurchaseAccountName(account?.account_name || '');
                  }}
                >
                  <option value="">— None —</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.account_id} value={a.account_id}>
                      {a.account_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Saved when you click “Save connection”. You can also change it from the
                  connection page without re-entering sign-in details.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default ConnectionFormPage;
