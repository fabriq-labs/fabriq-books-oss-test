import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { agentAPI } from "@/api/api";
import { notification } from "antd";

interface CategorizationButtonProps {
  csvData: any[];
  selectedValues: string[];
  selectedRowKeys?: Array<string | number>;
  lookUpData: any[];
  filedSets: any;
  relationId?: string;
  relationSelection?: any;
  isProcessing: boolean;
  onProcessingStart: () => void;
  onProcessingEnd: () => void;
  onCategorizationsReceived: (
    categorizations: Record<number, any>,
    options?: { replaceIndices?: number[] }
  ) => void;
  onError: (error: string) => void;
}

/**
 * Check if categorization is possible
 * Requires: description mapped, at least one account field mapped
 */
function canCategorize(csvData: any[], selectedValues: string[]): boolean {
  const hasDescriptionMapped = selectedValues.includes('description') || selectedValues.includes('name');
  return hasDescriptionMapped && csvData.length > 0;
}

/**
 * Categorization Button Component
 *
 * Provides AI-powered transaction categorization for posting imports.
 * This component was extracted from CsvMapper to keep generic import
 * components model-agnostic.
 */
export function CategorizationButton({
  csvData,
  selectedValues,
  selectedRowKeys = [],
  lookUpData,
  filedSets,
  relationId,
  relationSelection,
  isProcessing,
  onProcessingStart,
  onProcessingEnd,
  onCategorizationsReceived,
  onError,
}: CategorizationButtonProps) {
  const [api, contextHolder] = notification.useNotification();
  const hasSelectedRows = selectedRowKeys.length > 0;
  const canActivate = canCategorize(csvData, selectedValues) && hasSelectedRows;

  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined || value === "") return 0;
    const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getSelectedAccountType = (): string[] => {
    const candidate =
      relationSelection?.item?.type ??
      relationSelection?.type ??
      [];
    if (Array.isArray(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim().length > 0) return [candidate.trim()];
    return [];
  };

  const handleCategorize = async () => {
    if (!canActivate) {
      api.warning({
        message: "Cannot categorize",
        description: "Please map the description field first",
        placement: "topRight",
      });
      return;
    }

    onProcessingStart();

    try {
      // Build postings array from CSV data using current field mappings
      const tableHeaders = Object.keys(csvData[0] || {});
      const debitAmountColumnIndex = selectedValues.findIndex((value: string) => value === "debit_amount");
      const creditAmountColumnIndex = selectedValues.findIndex((value: string) => value === "credit_amount");
      const debitAmountColumnKey = debitAmountColumnIndex >= 0 ? tableHeaders[debitAmountColumnIndex] : null;
      const creditAmountColumnKey = creditAmountColumnIndex >= 0 ? tableHeaders[creditAmountColumnIndex] : null;
      const selectedAccountType = getSelectedAccountType();
      const hasSelectedBankAccount = !!relationId && selectedAccountType.length > 0;
      const selectedIndices = selectedRowKeys
        .map((key) => Number(key))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < csvData.length);

      const postings = selectedIndices.map((index: number) => {
        const row = csvData[index];
        const posting: any = { id: `temp_${index}` };

        // Map CSV columns to posting fields based on selectedValues
        selectedValues.forEach((fieldName: string, colIndex: number) => {
          if (fieldName && fieldName !== '0') {
            const csvKey = tableHeaders[colIndex];
            let value = row[csvKey];

            // Handle lookup field objects
            if (value && typeof value === 'object' && value.isNotAvailable) {
              value = null;
            }

            // Resolve lookup values to IDs
            if (lookUpData && lookUpData.length > 0) {
              const lookupConfig = lookUpData.find((l: any) => l.key === fieldName);
              if (lookupConfig && lookupConfig.lookupData) {
                const matchedRecord = lookupConfig.lookupData.find(
                  (record: any) =>
                    record.name === value ||
                    record[filedSets[fieldName]?.tableProps?.selectProps?.instanceLabel] === value
                );
                if (matchedRecord) {
                  value = matchedRecord.id;
                }
              }
            }

            posting[fieldName] = value;
          }
        });

        if (hasSelectedBankAccount) {
          const debitAmount = debitAmountColumnKey ? toNumber(row[debitAmountColumnKey]) : 0;
          const creditAmount = creditAmountColumnKey ? toNumber(row[creditAmountColumnKey]) : 0;
          const hasDebitAmount = debitAmount !== 0;
          const hasCreditAmount = creditAmount !== 0;

          // Money OUT (debit_amount present): bank must be on credit side.
          if (hasDebitAmount && !hasCreditAmount) {
            posting.credit_account_id = relationId;
            posting.credit_account_type = selectedAccountType;
          }

          // Money IN (credit_amount present): bank must be on debit side.
          if (hasCreditAmount && !hasDebitAmount) {
            posting.account_id = relationId;
            posting.account_type = selectedAccountType;
          }
        }

        return posting;
      });

      // Call batch categorization API
      const result = await agentAPI.categorizeTransactionBatch({
        postings,
        options: {
          dry_run: true, // Don't save, just predict
          min_confidence: 'low', // Return all predictions
          // omit use_historical_matching → backend CATEGORIZE_USE_HISTORICAL_MATCHING (default true)
        },
      });

      if (result.success && result.data?.results) {
        // Store categorizations by index
        const catMap: Record<number, any> = {};
        result.data.results.forEach((r: any, i: number) => {
          const indexFromId =
            typeof r.posting_id === "string" && r.posting_id.startsWith("temp_")
              ? Number(r.posting_id.replace("temp_", ""))
              : NaN;
          const originalIndex = Number.isInteger(indexFromId) ? indexFromId : selectedIndices[i];
          if (r.predicted_account_id) {
            catMap[originalIndex] = {
              account_id: r.predicted_account_id,
              account_name: r.predicted_account_name,
              confidence: r.confidence,
              confidence_score: r.confidence_score,
              reasoning: r.reasoning,
            };
          }
        });
        onCategorizationsReceived(catMap, { replaceIndices: selectedIndices });

        const summary = result.data.summary;
        api.success({
          message: "Categorization complete",
          description: `${summary.categorized_count} of ${selectedIndices.length} selected transaction(s) categorized`,
          placement: "topRight",
        });
      } else {
        throw new Error(result.error || 'Categorization failed');
      }
    } catch (error: any) {
      api.error({
        message: "Categorization failed",
        description: error?.message || "An error occurred",
        placement: "topRight",
      });
      onError(error?.message || "Categorization failed");
    } finally {
      onProcessingEnd();
    }
  };

  return (
    <>
      {contextHolder}
      <span title={!hasSelectedRows ? "Select one or more rows to categorize" : undefined}>
        <Button
          onClick={handleCategorize}
          disabled={isProcessing || !canActivate}
          variant="outline"
          className="flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              <span>Categorizing...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} className="text-purple-500" />
              <span>Categorize</span>
            </>
          )}
        </Button>
      </span>
    </>
  );
}
