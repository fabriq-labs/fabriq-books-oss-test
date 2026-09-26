import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileCheck, GitMerge, Loader2, Sparkles } from "lucide-react";
import Master, { MasterHandle } from "@/pages/Master";
import { agentAPI } from "@/api/api";
import { useToast } from "@/hooks/use-toast";
import { BulkAction, MergeRow } from "@/types/bulkActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReconciliationSuggestionsModal, {
  ReconciliationData,
} from "@/components/forms/Masters/ReconciliationSuggestionsModal";
import MergePostingsModal, {
  PostingRowLike,
} from "@/components/forms/Masters/MergePostingsModal";
import type { CellHighlightMap } from "@/components/masters/DynamicTable";
import { createPostingRowRenderer } from "@/components/masters/posting/PostingListRow";
import { useEntity } from "@/contexts/EntityContext";
import type { FilterEnhancements } from "@/types/customRowRenderer";

/**
 * Per-posting reconciliation result kept in memory after a bulk reconcile call.
 */
interface ReconcileResultEntry {
  posting: Record<string, any>;
  reconciliation: ReconciliationData | null;
}

/** Transforms debit/credit split columns into unified account_id / credit_account_id fields. */
function transformPostingCSVData(formattedData: any, relationId: any): any {
  const { mapping, data } = formattedData;
  let mappingValue: any = { ...mapping };
  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined || value === "") return 0;
    const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  if (relationId && Object.values(mappingValue).includes("debit_amount") && Object.values(mappingValue).includes("credit_amount")) {
    const getKeyByValue = (obj: any, value: any) => Object.keys(obj).find(k => obj[k] === value) ?? null;
    const debitAmountColumn: any = getKeyByValue(mappingValue, "debit_amount");
    const creditAmountColumn: any = getKeyByValue(mappingValue, "credit_amount");
    // AI import writes the predicted other account as counter_account_id.
    // A CSV that maps its contra column to credit_account_id still uses that column.
    const counterAccountColumn: any = getKeyByValue(mappingValue, "counter_account_id");
    const legacyContraColumn: any = getKeyByValue(mappingValue, "credit_account_id");

    mappingValue = {
      ...mappingValue,
      "account_id": "account_id",
      "credit_account_id": "credit_account_id",
      "amount": "amount",
    };
    delete mappingValue[debitAmountColumn];
    delete mappingValue[creditAmountColumn];
    if (counterAccountColumn) delete mappingValue[counterAccountColumn];
    // Do not delete the output key when the CSV header is already "credit_account_id".
    if (legacyContraColumn && legacyContraColumn !== "credit_account_id") {
      delete mappingValue[legacyContraColumn];
    }
    const aiNotesColumn: any = getKeyByValue(mappingValue, "notes");

    const csvData = data?.map((record: any) => {
      const debitAmount = toNumber(record[debitAmountColumn]);
      const creditAmount = toNumber(record[creditAmountColumn]);
      const hasDebitAmount = debitAmount !== 0;
      const hasCreditAmount = creditAmount !== 0;
      const counterValue = counterAccountColumn ? record[counterAccountColumn] : null;
      const legacyValue = legacyContraColumn ? record[legacyContraColumn] : null;
      const contra = counterValue || legacyValue || null;
      const aiNotes =
        record.__ai_notes != null && String(record.__ai_notes).trim() !== ""
          ? String(record.__ai_notes).trim()
          : null;
      const mappedNotes = aiNotesColumn ? record[aiNotesColumn] : null;
      const finalRecord = {
        ...record,
        amount: hasDebitAmount ? debitAmount : creditAmount,
        account_id: hasCreditAmount ? relationId : contra,
        credit_account_id: hasDebitAmount ? relationId : contra,
        notes: aiNotes || mappedNotes || record.notes || null,
      };
      delete finalRecord[debitAmountColumn];
      delete finalRecord[creditAmountColumn];
      delete finalRecord.__ai_notes;
      if (counterAccountColumn) delete finalRecord[counterAccountColumn];
      if (legacyContraColumn && legacyContraColumn !== "credit_account_id") {
        delete finalRecord[legacyContraColumn];
      }
      if (aiNotesColumn && aiNotesColumn !== "notes") delete finalRecord[aiNotesColumn];
      return finalRecord;
    });
    mappingValue.notes = "notes";
    if (aiNotesColumn && aiNotesColumn !== "notes") delete mappingValue[aiNotesColumn];
    return {
      mapping: mappingValue,
      isJSON: true,
      data: csvData,
      parentData: formattedData.parentData,
    };
  }

  if (relationId && !mappingValue.debit_amount && !mappingValue.credit_amount && Object.values(mappingValue).includes("amount")) {
    const account_mapping: any = {};
    if (Object.values(mappingValue).includes("credit_account_id")) account_mapping["account_id"] = "account_id";
    else account_mapping["credit_account_id"] = "credit_account_id";
    mappingValue = { ...mappingValue, ...account_mapping };

    const csvData = data?.map((record: any) => ({
      ...record,
      notes:
        record.__ai_notes != null && String(record.__ai_notes).trim() !== ""
          ? String(record.__ai_notes).trim()
          : record.notes ?? null,
      account_id: Object.values(mappingValue).includes("credit_account_id") ? relationId : null,
      credit_account_id: Object.values(mappingValue).includes("account_id") ? relationId : null,
    }));
    if (!Object.values(mappingValue).includes("notes")) {
      mappingValue.notes = "notes";
    }
    return {
      mapping: mappingValue,
      isJSON: true,
      data: csvData,
      parentData: formattedData.parentData,
    };
  }

  return { ...formattedData };
}

export default function Transactions() {
  const { toast } = useToast();
  const masterRef = useRef<MasterHandle>(null);
  const [searchParams] = useSearchParams();
  const { currentEntityId, entities } = useEntity();

  // When "All Entities" is selected, fall back to the HQ (or first) entity for imports.
  const effectiveEntityId = useMemo(
    () => currentEntityId ?? entities.find((e) => e.is_it_headquartres)?.id ?? entities[0]?.id ?? null,
    [currentEntityId, entities]
  );

  // ── URL-based filter support ──────────────────────────────────────────
  const urlAccountId = searchParams.get('account_id');
  const urlFromDate = searchParams.get('from_date');
  const urlToDate = searchParams.get('to_date');

  // Permanent filters applied to every query regardless of user filter state.
  const defaultFilters = useMemo(() => {
    return {
      ...(currentEntityId ? { legal_entity_id: currentEntityId } : {}),
      posting_type: { not: 'DUPLICATE' },
    };
  }, [currentEntityId]);

  // Filters seeded into the user-controlled badge state on mount.
  // These appear as removable chips in the filter badge row.
  // Uses Master's virtual composite key pattern for OR filters.
  const presetFilters = useMemo(() => {
    const preset: Record<string, any> = {};
    if (urlAccountId) {
      // account_id_or_credit_account_id is a virtual key expanded to an OR clause
      // by Master's expandVirtualFilters before the API call. See Master.tsx and
      // docs/FILTER_SYSTEM.md for the full pattern.
      preset.account_id_or_credit_account_id = { eq: urlAccountId };
    }
    if (urlFromDate && urlToDate) {
      preset.value_date = {
        gte: new Date(urlFromDate).toISOString(),
        lte: new Date(urlToDate + 'T23:59:59').toISOString(),
      };
    }
    return Object.keys(preset).length > 0 ? preset : undefined;
  }, [urlAccountId, urlFromDate, urlToDate]);

  const filterEnhancements = useMemo<FilterEnhancements>(() => {
    if (!currentEntityId) return {};
    const entityFilter = { legal_entity_id: { eq: currentEntityId } };
    return {
      account_id: { additionalFilters: entityFilter },
      credit_account_id: { additionalFilters: entityFilter },
      account_id_or_credit_account_id: { additionalFilters: entityFilter },
    };
  }, [currentEntityId]);

  const displayName = 'Transactions';

  // ── Reconciliation state ──────────────────────────────────────────────
  /** Results from the most recent reconcile call, keyed by posting id */
  const [reconcileResults, setReconcileResults] = useState<Record<string, ReconcileResultEntry>>({});
  /** Which field was predicted for each posting (for cell highlight) */
  const [predictedFields, setPredictedFields] = useState<CellHighlightMap>({});
  /** Modal state */
  const [modalPostingId, setModalPostingId] = useState<string | null>(null);
  const [mergePair, setMergePair] = useState<[PostingRowLike, PostingRowLike] | null>(null);
  /** Row-level reconcile loading (single posting id) */
  const [reconcilingPostingId, setReconcilingPostingId] = useState<string | null>(null);

  // Custom row renderer — updates when AI prediction highlights change
  const customRowRenderer = useMemo(
    () => createPostingRowRenderer(predictedFields),
    [predictedFields]
  );

  // ── CSV import helpers ────────────────────────────────────────────────
  const updateCSVData = useCallback(async (formattedData: any, relationId: any) => {
    const result = transformPostingCSVData(formattedData, relationId);
    if (!result?.data) return result;

    const mapping = result.mapping || {};
    const legalEntityCsvKey = Object.keys(mapping).find((k) => mapping[k] === "legal_entity_id");

    const isEmptyLegalEntityCell = (raw: unknown) =>
      raw === null ||
      raw === undefined ||
      raw === "" ||
      (typeof raw === "object" &&
        raw !== null &&
        (raw as { isNotAvailable?: boolean }).isNotAvailable === true);

    let data = result.data;
    if (effectiveEntityId && legalEntityCsvKey) {
      data = result.data.map((record: any) => {
        if (isEmptyLegalEntityCell(record[legalEntityCsvKey])) {
          return { ...record, [legalEntityCsvKey]: effectiveEntityId };
        }
        return record;
      });
    }

    const parentData: Record<string, any> = {
      ...(result.parentData ?? formattedData.parentData ?? {}),
      ...(effectiveEntityId && !legalEntityCsvKey ? { legal_entity_id: effectiveEntityId } : {}),
    };

    return {
      ...result,
      ...(Object.keys(parentData).length > 0 ? { parentData } : {}),
      data,
    };
  }, [effectiveEntityId]);

  const additionalFields = [
    { key: "debit_amount", displayName: "Debit Amount", mappingFiled: "account_id" },
    { key: "credit_amount", displayName: "Credit Amount", mappingFiled: "credit_account_id" },
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

  /** Row action: Reconcile icon when posting needs categorization */
  const injectRowActions = useCallback((record: any) => {
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
  }, [reconcilingPostingId, handleRowReconcile]);

  // ── Modal posting data ────────────────────────────────────────────────
  const modalEntry = modalPostingId ? reconcileResults[modalPostingId] : null;

  // ── Bulk actions ──────────────────────────────────────────────────────
  const bulkActions: BulkAction[] = [
    {
      id: 'merge',
      label: 'Merge',
      icon: <GitMerge size={16} />,
      variant: 'outline',
      isVisible: (rows) => rows.length === 2,
      onClick: async (rows) => {
        setMergePair([rows[0] as PostingRowLike, rows[1] as PostingRowLike]);
      },
    },
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
        key={`${currentEntityId ?? 'all'}-${urlAccountId ?? ''}-${urlFromDate ?? ''}`}
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
            additionalFileds: additionalFields,
            relation: "account",
            relationView: "account_view",
            relationField: "name",
            relationFieldId: "account_id",
          },
        }}
        enableExport={true}
        defaultSortOption={{ field: "value_date", direction: "desc" }}
        defaultFilters={defaultFilters}
        presetFilters={presetFilters}
        bulkActions={bulkActions}
        renderRowExtra={renderRowExtra}
        injectRowActions={injectRowActions}
        customRowRenderer={customRowRenderer}
        filterEnhancements={filterEnhancements}
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

      {mergePair && (
        <MergePostingsModal
          open={true}
          rows={mergePair}
          onClose={() => setMergePair(null)}
          onMerged={(primary, duplicate) => {
            masterRef.current?.updateRowsInList([primary as MergeRow]);
            masterRef.current?.removeRowsFromList([duplicate.id]);
          }}
        />
      )}
    </>
  );
}
