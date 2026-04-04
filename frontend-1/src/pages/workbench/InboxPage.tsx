import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { pendingActionAPI } from '@/api/api';
import { useAgentSession, type PendingAction } from '@/contexts/AgentSessionContext';
import { ActionDetailDrawer } from '@/components/workbench/ActionDetailDrawer';
import { getActionType } from '@/components/workbench/actions/registry';

// ── Types ──────────────────────────────────────────────────────

interface Filters {
  action_type: string;
  confidence: string;
  status: string;
}

const PAGE_SIZE = 25;

// ── Helpers ────────────────────────────────────────────────────

const confidenceBadge: Record<string, string> = {
  high:   'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low:    'bg-red-50 text-red-700 border-red-200',
};

const statusBadge: Record<string, string> = {
  pending:  'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  executed: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Main component ─────────────────────────────────────────────

export const InboxPage: React.FC = () => {
  const { actionId } = useParams<{ actionId?: string }>();
  const navigate = useNavigate();
  const { refreshSessions } = useAgentSession();

  // Table state
  const [items, setItems] = useState<PendingAction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ action_type: '', confidence: '', status: 'pending' });

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drawer state
  const [drawerAction, setDrawerAction] = useState<PendingAction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadingRef = useRef(false);

  // ── Data loading ───────────────────────────────────────────────
  const loadPage = useCallback(async (p: number, f: Filters) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    try {
      const result = await pendingActionAPI.listPaginated({
        page: p,
        pageSize: PAGE_SIZE,
        action_type: f.action_type || undefined,
        confidence: f.confidence || undefined,
        status: f.status || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setSelectedIds(new Set()); // clear selection on page change
    } catch {
      // handled by fetchAPI
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadPage(page, filters);
  }, [page, filters, loadPage]);

  // ── Open drawer from URL param ────────────────────────────────
  useEffect(() => {
    if (!actionId) {
      setDrawerAction(null);
      return;
    }
    // Find in current page or fetch directly
    const found = items.find((i) => i.id === actionId);
    if (found) {
      setDrawerAction(found);
    } else {
      pendingActionAPI.get(actionId).then(setDrawerAction).catch(() => {});
    }
  }, [actionId, items]);

  // ── Drawer open/close ─────────────────────────────────────────
  const openDrawer = (action: PendingAction) => {
    setDrawerAction(action);
    navigate(`/workbench/inbox/${action.id}`, { replace: true });
  };

  const closeDrawer = useCallback(() => {
    setDrawerAction(null);
    navigate('/workbench/inbox', { replace: true });
  }, [navigate]);

  // ── Single approve/reject ──────────────────────────────────────
  const handleApprove = useCallback(async (id: string) => {
    setIsProcessing(true);
    try {
      await pendingActionAPI.resolve(id, { status: 'approved' });
      closeDrawer();
      await loadPage(page, filters);
      void refreshSessions();
    } finally {
      setIsProcessing(false);
    }
  }, [closeDrawer, loadPage, page, filters, refreshSessions]);

  const handleReject = useCallback(async (id: string) => {
    setIsProcessing(true);
    try {
      await pendingActionAPI.resolve(id, { status: 'rejected', resolution_note: 'Rejected from inbox' });
      closeDrawer();
      await loadPage(page, filters);
      void refreshSessions();
    } finally {
      setIsProcessing(false);
    }
  }, [closeDrawer, loadPage, page, filters, refreshSessions]);

  // ── Bulk actions ───────────────────────────────────────────────
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const bulkApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => pendingActionAPI.resolve(id, { status: 'approved' }))
      );
      await loadPage(page, filters);
      void refreshSessions();
    } finally {
      setBulkProcessing(false);
    }
  };

  const bulkRejectSelected = async () => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => pendingActionAPI.resolve(id, { status: 'rejected', resolution_note: 'Bulk rejected' }))
      );
      await loadPage(page, filters);
      void refreshSessions();
    } finally {
      setBulkProcessing(false);
    }
  };

  const bulkApproveHighConfidence = async () => {
    const highIds = items.filter((i) => i.confidence === 'high' && i.status === 'pending').map((i) => i.id);
    if (highIds.length === 0) return;
    setBulkProcessing(true);
    try {
      await Promise.all(highIds.map((id) => pendingActionAPI.resolve(id, { status: 'approved' })));
      await loadPage(page, filters);
      void refreshSessions();
    } finally {
      setBulkProcessing(false);
    }
  };

  // ── Selection helpers ──────────────────────────────────────────
  const pendingItems = items.filter((i) => i.status === 'pending');
  const allSelected = pendingItems.length > 0 && pendingItems.every((i) => selectedIds.has(i.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingItems.map((i) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const highConfidencePendingCount = items.filter((i) => i.confidence === 'high' && i.status === 'pending').length;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-800">Action Inbox</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {total > 0 ? `${total} action${total !== 1 ? 's' : ''}` : 'No actions'}
            {filters.status === 'pending' ? ' pending review' : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Refresh"
          onClick={() => loadPage(page, filters)}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-3 border-b flex items-center gap-3 bg-gray-50/60 flex-wrap">
        <select
          className="text-xs border rounded px-2 py-1.5 bg-white text-gray-700 h-7"
          value={filters.action_type}
          onChange={(e) => { setFilters((f) => ({ ...f, action_type: e.target.value })); setPage(1); }}
        >
          <option value="">All types</option>
          <option value="categorize_transaction">Categorise</option>
          <option value="create_posting">Book</option>
          <option value="reconcile_posting">Reconcile</option>
        </select>

        <select
          className="text-xs border rounded px-2 py-1.5 bg-white text-gray-700 h-7"
          value={filters.confidence}
          onChange={(e) => { setFilters((f) => ({ ...f, confidence: e.target.value })); setPage(1); }}
        >
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          className="text-xs border rounded px-2 py-1.5 bg-white text-gray-700 h-7"
          value={filters.status}
          onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
        >
          <option value="pending">Pending</option>
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="executed">Executed</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* High-confidence bulk approve */}
        {highConfidencePendingCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
            disabled={bulkProcessing}
            onClick={bulkApproveHighConfidence}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve {highConfidencePendingCount} high-confidence
          </Button>
        )}
      </div>

      {/* Bulk action bar (appears when rows selected) */}
      {selectedIds.size > 0 && (
        <div className="px-6 py-2 bg-primary/8 border-b flex items-center gap-3">
          <span className="text-xs font-medium text-gray-700">{selectedIds.size} selected</span>
          <Button
            size="sm"
            className="h-7 text-xs bg-green-600 hover:bg-green-700"
            disabled={bulkProcessing}
            onClick={bulkApproveSelected}
          >
            {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
            disabled={bulkProcessing}
            onClick={bulkRejectSelected}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject selected
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs">No actions match the current filters.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr>
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-24">Type</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Description</th>
                <th className="px-3 py-2.5 text-right font-semibold text-gray-500 w-20">Amount</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-20">Confidence</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-20">Age</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-20">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const entry = getActionType(item.action_type);
                const summary = entry.renderRowSummary(item);
                const isSelected = selectedIds.has(item.id);
                const isDrawerOpen = drawerAction?.id === item.id;
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isDrawerOpen ? 'bg-primary/8' : isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50/80'
                    )}
                    onClick={() => openDrawer(item)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'pending' && (
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={isSelected}
                          onChange={() => toggleOne(item.id)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold', entry.badgeClass)}>
                        <entry.icon className="h-3 w-3" />
                        {entry.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 min-w-0">
                      <p className="font-medium text-gray-800 truncate max-w-[280px]">{summary.primary}</p>
                      {summary.secondary && (
                        <p className="text-gray-400 truncate max-w-[280px] mt-0.5">{summary.secondary}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-700 tabular-nums whitespace-nowrap">
                      {summary.amount || '—'}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 capitalize', confidenceBadge[item.confidence])}>
                        {item.confidence}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-gray-400 whitespace-nowrap">
                      {formatAge(item.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 capitalize', statusBadge[item.status] ?? 'bg-gray-100 text-gray-600')}>
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t flex items-center justify-between text-xs text-gray-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <ActionDetailDrawer
        action={drawerAction}
        isOpen={!!drawerAction}
        isProcessing={isProcessing}
        onClose={closeDrawer}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
};
