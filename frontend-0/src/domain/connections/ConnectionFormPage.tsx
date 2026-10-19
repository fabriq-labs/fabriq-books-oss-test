import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { erpConnectionsAPI } from '@/api/metadataApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { entityLabel, useEntity } from '@/contexts/EntityContext';
import { emptyQboOAuth, type QboOAuthForm } from './types';

/**
 * Create or edit QuickBooks OAuth connection.
 * On create: requires full oauth. On edit: secrets can be left blank to keep existing
 * (re-save requires full oauth for now — middleware replaces whole connection_config).
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
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testedOk, setTestedOk] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    erpConnectionsAPI
      .getById(id)
      .then((res) => {
        const row = res.data;
        setName(row.name || 'QuickBooks Online');
        setEntityId(row.entity_id || '');
        setOauth((prev) => ({
          ...prev,
          realm_id: row.realm_id || '',
          environment: (row.oauth_environment as QboOAuthForm['environment']) || 'sandbox',
        }));
      })
      .catch((error) => {
        toast({
          variant: 'destructive',
          title: 'Failed to load connection',
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
      toast({ title: 'Connection OK', description: res.message });
    } catch (error) {
      setTestedOk(false);
      toast({
        variant: 'destructive',
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!testedOk && !isEdit) {
      toast({
        variant: 'destructive',
        title: 'Test first',
        description: 'Run Test connection before saving a new connection.',
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
      });
      toast({ title: 'Saved', description: 'QuickBooks connection saved.' });
      navigate(`/settings/connections/${res.data.id}`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
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

  return (
    <div className="container mx-auto max-w-2xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(id ? `/settings/connections/${id}` : '/settings/connections')}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? 'Edit connection' : 'New QuickBooks connection'}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity">Entity (optional)</Label>
            <select
              id="entity"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">QuickBooks OAuth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ['client_id', 'Client ID', false],
              ['client_secret', 'Client Secret', true],
              ['refresh_token', 'Refresh Token', true],
              ['realm_id', 'Company ID (Realm ID)', false],
            ] as const
          ).map(([key, label, secret]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type={secret ? 'password' : 'text'}
                autoComplete="off"
                value={oauth[key]}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={isEdit && secret ? 'Enter to replace saved secret' : undefined}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="environment">Environment</Label>
            <select
              id="environment"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={oauth.environment}
              onChange={(e) => setField('environment', e.target.value)}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => void handleTest()} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {testedOk ? (
            <p className="text-sm text-emerald-700">Test succeeded — ready to save.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionFormPage;
