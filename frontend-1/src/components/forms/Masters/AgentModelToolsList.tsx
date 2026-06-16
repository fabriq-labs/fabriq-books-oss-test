import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, RefreshCw, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  fetchModelToolConfigs,
  seedModelToolConfigs,
  type AgentModelToolConfig,
} from '@/api/agentModelToolsApi';

export const AgentModelToolsList: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<AgentModelToolConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setConfigs(await fetchModelToolConfigs());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const count = await seedModelToolConfigs();
      toast({
        title: 'Tool configs seeded',
        description:
          count > 0
            ? `${count} model config(s) loaded from seed SQL.`
            : 'Seed ran but no rows found — check agent_model_tool_config table.',
      });
      await load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Seed failed';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
     

      <div className="border rounded-lg overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Model</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tools</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Analytics</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Active</th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {configs.map((row) => (
              <tr key={row.model_name} className="bg-white hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{row.display_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{row.model_name}</p>
                  {row.description && (
                    <p className="text-xs text-gray-500 mt-0.5 max-w-md">{row.description}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-xl">
                    {row.model_tools.slice(0, 6).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs font-normal">
                        {t}
                      </Badge>
                    ))}
                    {row.model_tools.length > 6 && (
                      <Badge variant="outline" className="text-xs">
                        +{row.model_tools.length - 6} more
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {row.include_analytics_tools ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={row.is_active ? 'default' : 'outline'}>
                    {row.is_active ? 'On' : 'Off'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Edit tools"
                    onClick={() =>
                      navigate(`/settings/agent-model-tools/${encodeURIComponent(row.model_name)}/edit`)
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
