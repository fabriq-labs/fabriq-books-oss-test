import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { erpConnectionsAPI, type ErpConnectionSummary } from '@/api/metadataApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

function statusLabel(row: ErpConnectionSummary): string {
  const s = row.last_sync_status?.status;
  if (!s) return 'Never synced';
  return s;
}

const ConnectionsPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ErpConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await erpConnectionsAPI.getAll();
      setRows(res.data ?? []);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Failed to load connections',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Connect QuickBooks Online and sync master data into Fabriq Books.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/settings/connections/new')}>
            <Plus className="mr-1 h-4 w-4" />
            New connection
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ERP connections</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">No connections yet.</p>
              <Button onClick={() => navigate('/settings/connections/new')}>
                Connect QuickBooks
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">System</th>
                    <th className="py-2 pr-4 font-medium">Active</th>
                    <th className="py-2 pr-4 font-medium">Airbyte</th>
                    <th className="py-2 pr-4 font-medium">Last sync</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link
                          to={`/settings/connections/${row.id}`}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.realm_id ? (
                          <div className="text-xs text-muted-foreground">Realm {row.realm_id}</div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">{row.system_type}</td>
                      <td className="py-3 pr-4">{row.is_active ? 'Yes' : 'No'}</td>
                      <td className="py-3 pr-4">
                        {row.has_extraction_config ? 'Configured' : 'Missing'}
                      </td>
                      <td className="py-3 pr-4">
                        {row.last_sync_at
                          ? new Date(row.last_sync_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-3">{statusLabel(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionsPage;
