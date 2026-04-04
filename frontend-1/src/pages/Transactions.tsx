import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileCheck, Loader2, Sparkles, XCircle } from "lucide-react";
import Master, { MasterHandle } from "@/pages/Master";
import { agentAPI } from "@/api/api";
import { useToast } from "@/hooks/use-toast";
import { BulkAction, MergeRow } from "@/types/bulkActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReconciliationSuggestionsModal, {
  ReconciliationData,
} from "@/components/forms/Masters/ReconciliationSuggestionsModal";
import type { CellHighlightMap } from "@/components/masters/DynamicTable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Per-posting reconciliation result kept in memory after a bulk reconcile call.
 */
interface ReconcileResultEntry {
  posting: Record<string, any>;
  reconciliation: ReconciliationData | null;
}

export default function Transactions() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const masterRef = useRef<MasterHandle>(null);
  const [searchParams] = useSearchParams();

  // ── URL-based filter support ──────────────────────────────────────────
  // Read filter from URL query params (e.g., ?filter=unreconciled)
  const urlFilter = searchParams.get('filter');

  // Build default filters based on URL params
  const defaultFilters = useMemo(() => {
    const baseFilter: Record<string, any> = {
      description: { ncontains: "Closing" },
    };

    if (urlFilter === 'unreconciled') {
      // Show only unreconciled transactions (NULL or UNMATCHED status)
      // Using OR condition for Prisma filter format
      return {
        ...baseFilter,
        OR: [
          { reconciliation_status: null },
          { reconciliation_status: 'UNMATCHED' },
        ],
      };
    }

    return baseFilter;
  }, [urlFilter]);

  // Title is always "Transactions"; segment indicates view
  const displayName = 'Transactions';

  // Segmented control next to title: All | Needs reconciliation
  const viewSegment = urlFilter === 'unreconciled' ? 'unreconciled' : 'all';
  const titleExtra = (
    <ToggleGroup
      type="single"
      value={viewSegment}
      onValueChange={(v) => {
        if (!v) return;
        navigate(v === 'unreconciled' ? '/accounting/transactions?filter=unreconciled' : '/accounting/transactions');
      }}
      variant="outline"
      size="sm"
      className="ml-1"
    >
      <ToggleGroupItem value="all" aria-label="All transactions">
        All
      </ToggleGroupItem>
      <ToggleGroupItem value="unreconciled" aria-label="Needs reconciliation">
        Needs reconciliation
      </ToggleGroupItem>
    </ToggleGroup>
  );

  // ── Reconciliation state ──────────────────────────────────────────────
  /** Results from the most recent reconcile call, keyed by posting id */
  const [reconcileResults, setReconcileResults] = useState<Record<string, ReconcileResultEntry>>({});
  /** Which field was predicted for each posting (for cell highlight) */
  const [predictedFields, setPredictedFields] = useState<CellHighlightMap>({});
  /** Modal state */
  const [modalPostingId, setModalPostingId] = useState<string | null>(null);
  /** Row-level reconcile loading (single posting id) */
  const [reconcilingPostingId, setReconcilingPostingId] = useState<string | null>(null);

  // ── CSV import helpers (unchanged) ────────────────────────────────────
  function getKeyBasedOnValue(obj: any, value: any) {
    for (const [key, val] of Object.entries(obj)) {
      if (val === value) return key;
    }
    return null;
  }

  const updateCSVData = (formattedData: any, relationId: any) => {
    const { mapping, data } = formattedData;
    let mappingValue: any = { ...mapping };
    if (relationId && Object.values(mappingValue).includes("debit_amount") && Object.values(mappingValue).includes("credit_amount")) {
      return new Promise((resolve) => {
        const debitAmountColumn: any = getKeyBasedOnValue(mappingValue, "debit_amount");
        const creditAmountColumn: any = getKeyBasedOnValue(mappingValue, "credit_amount");
        const contraAccountColumn: any = getKeyBasedOnValue(mappingValue, "credit_account_id");

        mappingValue = {
          ...mappingValue,
          "account_id": "account_id",
          "credit_account_id": "credit_account_id",
          "amount": "amount",
        };

        delete mappingValue[debitAmountColumn];
        delete mappingValue[creditAmountColumn];
        delete mappingValue[contraAccountColumn];

        const csvData = data?.map((record: any) => {
          const hasDebitAmount = record[debitAmountColumn] != null && record[debitAmountColumn] != undefined && record[debitAmountColumn] != 0 && record[debitAmountColumn] !== '';
          const hasCreditAmount = record[creditAmountColumn] != null && record[creditAmountColumn] != undefined && record[creditAmountColumn] != 0 && record[creditAmountColumn] !== '';

          let finalRecord = {
            ...record,
            amount: hasDebitAmount ? record[debitAmountColumn] : record[creditAmountColumn],
            account_id: hasCreditAmount ? relationId : (record[contraAccountColumn] ? record[contraAccountColumn] : null),
            credit_account_id: hasDebitAmount ? relationId : (record[contraAccountColumn] ? record[contraAccountColumn] : null),
          };
          delete finalRecord[debitAmountColumn];
          delete finalRecord[creditAmountColumn];
          delete finalRecord[contraAccountColumn];
          return finalRecord;
        });
        resolve({ mapping: mappingValue, isJSON: true, data: csvData });
      });
    } else if (relationId && !mappingValue.debit_amount && !mappingValue.credit_amount && Object.values(mappingValue).includes("amount")) {
      return new Promise((resolve) => {
        const account_mapping: any = {};
        if (Object.values(mappingValue).includes("credit_account_id")) account_mapping["account_id"] = "account_id";
        else account_mapping["credit_account_id"] = "credit_account_id";

        mappingValue = { ...mappingValue, ...account_mapping };

        const csvData = data?.map((record: any) => {
          let finalRecord = {
            ...record,
            account_id: Object.values(mappingValue).includes("credit_account_id") ? relationId : null,
            credit_account_id: Object.values(mappingValue).includes("account_id") ? relationId : null,
          };
          return finalRecord;
        });
        resolve({ mapping: mappingValue, isJSON: true, data: csvData });
      });
    }
    let finalData: any = formattedData;
    delete finalData.parentData;
    return finalData;
  };

  const additionalFields = [
    { key: "debit_amount", mappingFiled: "account_id" },
    { key: "credit_amount", mappingFiled: "credit_account_id" },
  ];

  // ── Validation helpers ────────────────────────────────────────────────
  const hasAnyFullyCategorized = (rows: any[]) => {
    return rows.some((row) => !!row.account_id && !!row.credit_account_id);
  };

  const allHaveAtLeastOneAccount = (rows: any[]) => {
    return rows.every((row) => !!row.account_id || !!row.credit_account_id);
  };

  // ── Bulk reconcile handler ────────────────────────────────────────────
  const handleBulkReconcile = async (
    selectedRows: any[],
    _context: { type: string; view: string }
  ): Promise<{ mergeRows: MergeRow[] } | void> => {
    if (selectedRows.length === 0) return;

    if (hasAnyFullyCategorized(selectedRows)) {
      toast({
        title: "Cannot reconcile",
        description: "One or more selected transactions already have both accounts filled. Please deselect them.",
        variant: "destructive",
      });
      return;
    }

    if (!allHaveAtLeastOneAccount(selectedRows)) {
      toast({
        title: "Cannot reconcile",
        description: "All selected transactions must have at least one account (Debit or Credit) filled.",
        variant: "destructive",
      });
      return;
    }

    try {
      const postingIds = selectedRows.map((row) => row.id);
      const result = await agentAPI.reconcileTransaction({ posting_ids: postingIds });

      if (!result.success || !result.data?.results) {
        throw new Error(result.error || 'Reconciliation failed');
      }

      const entries = result.data.results;

      // Build results map, predicted field map, and merge rows
      const newResults: Record<string, ReconcileResultEntry> = {};
      const newPredicted: CellHighlightMap = {};
      const mergeRows: MergeRow[] = [];

      for (const entry of entries) {
        const posting = entry.posting;
        const id = posting.id;
        newResults[id] = entry as ReconcileResultEntry;

        // Determine which account was predicted (compare with the selected row's previous values)
        const originalRow = selectedRows.find((r) => r.id === id);
        if (originalRow) {
          if (posting.account_id && posting.account_id !== originalRow.account_id) {
            newPredicted[id] = 'account_id';
          } else if (posting.credit_account_id && posting.credit_account_id !== originalRow.credit_account_id) {
            newPredicted[id] = 'credit_account_id';
          }
        }

        mergeRows.push(posting as MergeRow);
      }

      // Reset and set state (state is reset on every call)
      setReconcileResults(newResults);
      setPredictedFields(newPredicted);

      // Toast summary
      const suggested = entries.filter((e) => e.reconciliation?.status === 'SUGGESTED').length;
      const unmatched = entries.filter((e) => e.reconciliation?.status === 'UNMATCHED').length;
      const skipped = entries.filter((e) => e.reconciliation?.status === 'SKIPPED').length;
      toast({
        title: "Reconciliation completed",
        description: `${entries.length} processed: ${suggested} matched, ${unmatched} unmatched, ${skipped} skipped`,
      });

      return { mergeRows };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Reconciliation failed",
        description: error.message || "Unable to reconcile transactions. Please try again.",
      });
      throw error;
    }
  };

  // ── Row extra: suggestion button for SUGGESTED rows ───────────────────
  const renderRowExtra = useCallback((row: any) => {
    const entry = reconcileResults[row.id];
    if (!entry?.reconciliation || entry.reconciliation.status !== 'SUGGESTED' || !entry.reconciliation.best_match) {
      return null;
    }
    const bestMatch = entry.reconciliation.best_match;
    const matchLabel = bestMatch.type === 'payment_receipt' ? 'Receipt' : 'Invoice';
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
          onClick={() => setModalPostingId(row.id)}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>Match found: {matchLabel} {bestMatch.reference}</span>
          <Badge variant={
            bestMatch.confidence === 'high' ? 'default' :
            bestMatch.confidence === 'medium' ? 'secondary' : 'outline'
          } className="text-[10px] px-1 py-0">
            {bestMatch.confidence}
          </Badge>
        </Button>
      </div>
    );
  }, [reconcileResults]);

  // ── Handle confirm from modal ─────────────────────────────────────────
  const handleModalConfirmed = useCallback((updatedPosting: Record<string, any>) => {
    const id = updatedPosting.id;
    // Merge into list
    if (masterRef.current) {
      masterRef.current.updateRowsInList([updatedPosting as MergeRow]);
    }
    // Update local reconcile state to MATCHED so button disappears
    setReconcileResults((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return {
        ...prev,
        [id]: {
          ...existing,
          reconciliation: existing.reconciliation
            ? { ...existing.reconciliation, status: 'MATCHED' }
            : null,
        },
      };
    });
    // Remove highlight for this row
    setPredictedFields((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // Close modal
    setModalPostingId(null);
  }, []);

  // ── Row-level reconcile (single posting) ──────────────────────────────
  const handleRowReconcile = useCallback(async (record: any) => {
    const id = record.id;
    setReconcilingPostingId(id);
    try {
      const result = await agentAPI.reconcileTransaction({ posting_ids: [id] });
      if (!result.success || !result.data?.results?.length) {
        throw new Error(result.error || 'Reconciliation failed');
      }
      const entry = result.data.results[0];
      const posting = entry.posting as Record<string, any>;

      // Merge single row into list
      if (masterRef.current) {
        masterRef.current.updateRowsInList([posting as MergeRow]);
      }

      // Update local state so highlight and suggestion button appear for this row
      setReconcileResults((prev) => ({
        ...prev,
        [id]: { posting, reconciliation: entry.reconciliation },
      }));
      const originalRow = record;
      const pid = (x: any) => (x && typeof x === 'object' && 'id' in x ? x.id : x);
      if (pid(posting.account_id) && pid(posting.account_id) !== pid(originalRow.account_id)) {
        setPredictedFields((prev) => ({ ...prev, [id]: 'account_id' }));
      } else if (pid(posting.credit_account_id) && pid(posting.credit_account_id) !== pid(originalRow.credit_account_id)) {
        setPredictedFields((prev) => ({ ...prev, [id]: 'credit_account_id' }));
      }

      const recon = entry.reconciliation;
      if (recon?.status === 'SUGGESTED' && recon.best_match) {
        const matchType = recon.best_match.type === 'payment_receipt' ? 'Receipt' : 'Invoice';
        toast({
          title: "Transaction classified",
          description: `Matched to ${matchType} ${recon.best_match.reference} (${recon.best_match.confidence} confidence)`,
        });
      } else {
        toast({
          title: "Transaction reconciled",
          description: "Categorization applied successfully.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Reconciliation failed",
        description: error.message || "Unable to reconcile this transaction.",
      });
    } finally {
      setReconcilingPostingId(null);
    }
  }, [toast]);

  /** Statuses that mean the row no longer belongs in "unreconciled" filter (show remove instead of reconcile) */
  const isNoLongerUnreconciled = useCallback((status: string | undefined) => {
    return status === 'SKIPPED' || status === 'MATCHED' || status === 'CONFIRMED';
  }, []);

  const handleRemoveFromList = useCallback((id: string) => {
    masterRef.current?.removeRowsFromList?.([id]);
    setReconcileResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPredictedFields((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /** Row action: Reconcile icon, or Remove icon when status changed to SKIPPED/MATCHED (unreconciled filter only) */
  const injectRowActions = useCallback((record: any) => {
    const entry = reconcileResults[record.id];
    const reconStatus = entry?.reconciliation?.status;
    const showRemove = urlFilter === 'unreconciled' && isNoLongerUnreconciled(reconStatus);

    if (showRemove) {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => handleRemoveFromList(record.id)}
          title="Remove from list"
        >
          <XCircle size={16} />
        </Button>
      );
    }

    if (!!record.account_id && !!record.credit_account_id) return null;
    const isReconciling = reconcilingPostingId === record.id;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-[#9b87f5] hover:text-[#7c6ad4] hover:bg-[#E5DEFF]"
        onClick={() => handleRowReconcile(record)}
        disabled={isReconciling}
        title="Reconcile"
      >
        {isReconciling ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Sparkles size={16} />
        )}
      </Button>
    );
  }, [urlFilter, reconcileResults, reconcilingPostingId, handleRowReconcile, isNoLongerUnreconciled, handleRemoveFromList]);

  // ── Modal posting data ────────────────────────────────────────────────
  const modalEntry = modalPostingId ? reconcileResults[modalPostingId] : null;

  // ── Bulk actions ──────────────────────────────────────────────────────
  const bulkActions: BulkAction[] = [
    {
      id: 'reconcile',
      label: 'Reconcile',
      icon: <Sparkles size={16} />,
      variant: 'outline',
      onClick: handleBulkReconcile,
      returnsMergeRows: true,
      isVisible: (rows) => !hasAnyFullyCategorized(rows),
      confirmation: {
        title: 'Reconcile Transactions',
        content: (rows) => `This will categorize and reconcile ${rows.length} transaction(s) using AI. Continue?`,
        okText: 'Yes, Reconcile',
        cancelText: 'Cancel',
      },
    },
  ];

  return (
    <>
      <Master
        ref={masterRef}
        type="posting"
        view="posting_view"
        displayName={displayName}
        filterConfig={{
          enableFilters: true,
          enableSearch: true,
          dateRangeFilter: { key: 'value_date', label: 'Value Date' },
        }}
        listConfig={{
          importConfig: {
            updateCSVData: updateCSVData,
            additionalFileds: additionalFields?.map((field: any) => field.key),
            relation: "account",
            relationView: "account_view",
            relationField: "name",
            relationFieldId: "account_id",
          },
        }}
        defaultFilters={defaultFilters}
        titleExtra={titleExtra}
        bulkActions={bulkActions}
        cellHighlights={predictedFields}
        renderRowExtra={renderRowExtra}
        injectRowActions={injectRowActions}
      />

      {/* Reconciliation suggestions modal */}
      {modalEntry?.reconciliation && modalPostingId && (
        <ReconciliationSuggestionsModal
          open={true}
          onClose={() => setModalPostingId(null)}
          postingId={modalPostingId}
          postingDescription={modalEntry.posting.description || modalEntry.posting.name}
          postingAmount={modalEntry.posting.amount != null ? Number(modalEntry.posting.amount) : undefined}
          reconciliation={modalEntry.reconciliation}
          onConfirmed={handleModalConfirmed}
        />
      )}
    </>
  );
}
