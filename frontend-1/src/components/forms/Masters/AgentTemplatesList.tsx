import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import Cookies from 'js-cookie';

const API_URL = import.meta.env.VITE_API_BASE_URL || '';

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  goal_model: string | null;
  user_hint: string;
  default_mode: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

async function agentTemplateAPI(path: string, options: RequestInit = {}) {
  const token = Cookies.get('__session');
  const res = await fetch(`${API_URL}/api/agent/admin/templates${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(err.message || 'Request failed');
  }
  return res.json();
}

const modeColors: Record<string, string> = {
  supervised: 'bg-blue-50 text-blue-700 border-blue-200',
  semi_auto: 'bg-amber-50 text-amber-700 border-amber-200',
  autonomous: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const AgentTemplatesList: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await agentTemplateAPI('');
      setTemplates(res.data ?? []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await agentTemplateAPI(`/${deleteId}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Agent template deleted.' });
      setTemplates(prev => prev.filter(t => t.id !== deleteId));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button
          size="sm"
          onClick={() => navigate('/settings/agent-templates/new')}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Agent Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-gray-50">
          <p className="text-sm text-gray-500">No agent templates yet.</p>
          <Button
            variant="link"
            size="sm"
            className="mt-1"
            onClick={() => navigate('/settings/agent-templates/new')}
          >
            Create the first one
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Goal Model</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Default Mode</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Order</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">Active</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((t) => (
                <tr key={t.id} className="bg-white hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{t.description}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {t.goal_model ?? <span className="text-gray-400 italic">general</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium capitalize ${modeColors[t.default_mode] ?? ''}`}>
                      {t.default_mode.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.sort_order}</td>
                  <td className="px-4 py-3">
                    {t.is_active
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <XCircle className="h-4 w-4 text-gray-300" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => navigate(`/settings/agent-templates/${t.id}/edit`)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteId(t.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent template?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Sessions created from this template will be unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
