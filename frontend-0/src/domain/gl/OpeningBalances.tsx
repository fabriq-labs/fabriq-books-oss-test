import { useEffect, useMemo, useState } from 'react';
import { viewAPI } from '@/api/api';
import { fetchAPI } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

type AccountRow = {
  id: string;
  name?: string;
  code?: string;
  classification?: string;
  currency_id?: string | null;
  currency?: { code?: string } | null;
};

type EntityRow = {
  id: string;
  name?: string;
};

type Line = {
  account_id: string;
  debit: string;
  credit: string;
};

const BALANCE_SHEET = new Set(['asset', 'liability', 'equity']);

function rowsOf(payload: unknown): any[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: any[] }).data;
  }
  return [];
}

function amount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function OpeningBalances() {
  const { toast } = useToast();
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [entityId, setEntityId] = useState('');
  const [asOf, setAsOf] = useState(`${new Date().getFullYear()}-01-01`);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    viewAPI.getAll('entity', 'entity_view', 1, 200).then((res) => {
      const list = rowsOf(res) as EntityRow[];
      setEntities(list);
      if (list[0]) setEntityId(list[0].id);
    }).catch(() => setEntities([]));
    viewAPI.getAll('account', 'account_view', 1, 500).then((res) => {
      const list = (rowsOf(res) as AccountRow[]).filter((row) => BALANCE_SHEET.has(String(row.classification || '')));
      setAccounts(list);
      setLines(Object.fromEntries(list.map((row) => [row.id, { account_id: row.id, debit: '', credit: '' }])));
    }).catch(() => setAccounts([]));
  }, []);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, { debit: number; credit: number }>();
    for (const account of accounts) {
      const line = lines[account.id];
      if (!line) continue;
      const key = account.currency?.code || account.currency_id || 'unspecified';
      const current = byCurrency.get(key) ?? { debit: 0, credit: 0 };
      current.debit += amount(line.debit);
      current.credit += amount(line.credit);
      byCurrency.set(key, current);
    }
    return [...byCurrency.entries()];
  }, [accounts, lines]);

  const balanced = totals.length > 0 && totals.every(([, total]) => Math.abs(total.debit - total.credit) < 0.0001 && (total.debit > 0 || total.credit > 0));
  const hasAmount = totals.some(([, total]) => total.debit > 0 || total.credit > 0);

  const update = (accountId: string, side: 'debit' | 'credit', value: string) => {
    setLines((current) => ({
      ...current,
      [accountId]: {
        account_id: accountId,
        debit: side === 'debit' ? value : current[accountId]?.debit || '',
        credit: side === 'credit' ? value : current[accountId]?.credit || '',
      },
    }));
  };

  const save = async () => {
    if (!entityId) {
      toast({ variant: 'destructive', title: 'Select an entity' });
      return;
    }
    if (!balanced) {
      toast({ variant: 'destructive', title: 'Debits and credits must match in each account currency' });
      return;
    }
    const payloadLines = accounts
      .map((account) => lines[account.id])
      .filter((line) => line && (amount(line.debit) > 0 || amount(line.credit) > 0))
      .map((line) => ({
        account_id: line.account_id,
        debit: amount(line.debit) > 0 ? line.debit : null,
        credit: amount(line.credit) > 0 ? line.credit : null,
      }));
    try {
      setSaving(true);
      const result = await fetchAPI<{ success: boolean; data: { postings_created: number } }>('/api/gl/opening-balances', {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId, as_of: asOf, lines: payloadLines }),
      });
      setSavedCount(result.data.postings_created);
      toast({ title: 'Opening balances saved', description: `${result.data.postings_created} paired postings` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Opening balances</h1>
        <p className="text-sm text-muted-foreground">
          Paired postings with kind opening. Debit and credit totals must match in the account currency.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Balances as of</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">Entity</span>
              <select
                className="h-10 min-w-56 rounded-md border bg-background px-3"
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
              >
                <option value="">Select</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name || entity.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">As of</span>
              <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className="w-48" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2 pr-3">Currency</th>
                  <th className="py-2 pr-3">Debit</th>
                  <th className="py-2">Credit</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b">
                    <td className="py-2 pr-3">{account.code ? `${account.code} ` : ''}{account.name}</td>
                    <td className="py-2 pr-3">{account.classification}</td>
                    <td className="py-2 pr-3">{account.currency?.code || ''}</td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-32"
                        value={lines[account.id]?.debit || ''}
                        onChange={(event) => update(account.id, 'debit', event.target.value)}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-32"
                        value={lines[account.id]?.credit || ''}
                        onChange={(event) => update(account.id, 'credit', event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1 text-sm">
            {totals.map(([currency, total]) => (
              <p key={currency}>
                {currency}: debit {total.debit.toFixed(2)} / credit {total.credit.toFixed(2)}
                {Math.abs(total.debit - total.credit) >= 0.0001 ? ' — out of balance' : ''}
              </p>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={saving || !hasAmount || !balanced || !entityId}>
              {saving ? 'Saving...' : 'Save opening balances'}
            </Button>
            {savedCount != null && <span className="text-sm text-muted-foreground">{savedCount} paired postings saved</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
