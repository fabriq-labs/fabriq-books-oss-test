import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { notification } from "antd";
import { agentAPI } from "@/api/agentApi";
import { ToolbarActionProps } from "@/features/import-extensions/types";

function canCategorize(csvData: any[], selectedValues: string[]): boolean {
  const hasDescription = selectedValues.includes("description") || selectedValues.includes("name");
  return hasDescription && csvData.length > 0;
}

function toNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function accountTypes(relationSelection: any): string[] {
  const candidate =
    relationSelection?.item?.account_types ??
    relationSelection?.account_types ??
    relationSelection?.item?.type ??
    [];
  if (Array.isArray(candidate)) return candidate;
  if (typeof candidate === "string" && candidate.trim()) return [candidate.trim()];
  return [];
}

/**
 * Categorize the selected statement rows and hand the predictions back
 * so the mapper can show them in the right-hand AI Category column.
 */
export function CategorizationButton({
  csvData,
  selectedValues,
  selectedRowKeys = [],
  lookUpData,
  filedSets,
  relationId,
  relationSelection,
  onCategorizationsReceived,
}: ToolbarActionProps) {
  const [api, contextHolder] = notification.useNotification();
  const [isProcessing, setIsProcessing] = useState(false);
  const hasSelectedRows = selectedRowKeys.length > 0;
  const canActivate = canCategorize(csvData, selectedValues) && hasSelectedRows;

  const handleCategorize = async () => {
    if (!canActivate) {
      api.warning({
        message: "Cannot categorize",
        description: "Select rows and map the description column first",
        placement: "topRight",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const tableHeaders = Object.keys(csvData[0] || {});
      const debitAmountColumnIndex = selectedValues.findIndex((value) => value === "debit_amount");
      const creditAmountColumnIndex = selectedValues.findIndex((value) => value === "credit_amount");
      const debitAmountColumnKey = debitAmountColumnIndex >= 0 ? tableHeaders[debitAmountColumnIndex] : null;
      const creditAmountColumnKey = creditAmountColumnIndex >= 0 ? tableHeaders[creditAmountColumnIndex] : null;
      const selectedAccountType = accountTypes(relationSelection);
      const entityId = relationSelection?.item?.entity_id;
      const selectedIndices = selectedRowKeys
        .map((key) => Number(key))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < csvData.length);

      const postings = selectedIndices.map((index) => {
        const row = csvData[index];
        const posting: Record<string, unknown> = { id: `temp_${index}` };
        selectedValues.forEach((fieldName, colIndex) => {
          if (!fieldName || fieldName === "0") return;
          const csvKey = tableHeaders[colIndex];
          let value = row[csvKey];
          if (value && typeof value === "object" && value.isNotAvailable) value = null;
          const lookupConfig = lookUpData?.find((lookup: any) => lookup.key === fieldName);
          if (lookupConfig?.lookupData) {
            const labelKey = filedSets?.[fieldName]?.tableProps?.selectProps?.instanceLabel;
            const matched = lookupConfig.lookupData.find(
              (record: any) => record.name === value || (labelKey && record[labelKey] === value)
            );
            if (matched) value = matched.id;
          }
          posting[fieldName] = value;
        });

        if (relationId && selectedAccountType.length > 0) {
          const debitAmount = debitAmountColumnKey ? toNumber(row[debitAmountColumnKey]) : 0;
          const creditAmount = creditAmountColumnKey ? toNumber(row[creditAmountColumnKey]) : 0;
          if (debitAmount !== 0 && creditAmount === 0) {
            posting.credit_account_id = relationId;
            posting.credit_account_type = selectedAccountType;
          }
          if (creditAmount !== 0 && debitAmount === 0) {
            posting.debit_account_id = relationId;
            posting.account_id = relationId;
            posting.account_type = selectedAccountType;
          }
        }
        if (entityId) posting.entity_id = entityId;
        return posting;
      });

      const result = await agentAPI.categorizeTransactionBatch({
        postings: postings as any,
        options: { dry_run: true, min_confidence: "low" },
      });

      if (!result.success || !result.data?.results) {
        throw new Error(result.error || "Categorization failed");
      }

      const catMap: Record<number, any> = {};
      result.data.results.forEach((row, i) => {
        const indexFromId =
          typeof row.posting_id === "string" && row.posting_id.startsWith("temp_")
            ? Number(row.posting_id.replace("temp_", ""))
            : NaN;
        const originalIndex = Number.isInteger(indexFromId) ? indexFromId : selectedIndices[i];
        if (row.predicted_account_id) {
          catMap[originalIndex] = {
            account_id: row.predicted_account_id,
            account_name: row.predicted_account_name,
            confidence: row.confidence,
            confidence_score: row.confidence_score,
            reasoning: row.reasoning,
          };
        }
      });
      onCategorizationsReceived(catMap, { replaceIndices: selectedIndices });

      api.success({
        message: "Categorization complete",
        description: `${result.data.summary.categorized_count} of ${selectedIndices.length} selected transaction(s) categorized`,
        placement: "topRight",
      });
    } catch (error: any) {
      api.error({
        message: "Categorization failed",
        description: error?.message || "An error occurred",
        placement: "topRight",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {contextHolder}
      <span title={!hasSelectedRows ? "Select one or more rows to categorize" : undefined}>
        <Button
          type="button"
          onClick={handleCategorize}
          disabled={isProcessing || !canActivate}
          variant="outline"
          size="sm"
          className="h-8 text-[13px]"
        >
          {isProcessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
          )}
          {isProcessing ? "Categorizing..." : "Categorize"}
        </Button>
      </span>
    </>
  );
}
