import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { agentAPI } from "@/api/api";
import { notification } from "antd";

interface CategorizationButtonProps {
  csvData: any[];
  selectedValues: string[];
  lookUpData: any[];
  filedSets: any;
  isProcessing: boolean;
  onProcessingStart: () => void;
  onProcessingEnd: () => void;
  onCategorizationsReceived: (categorizations: Record<number, any>) => void;
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
  lookUpData,
  filedSets,
  isProcessing,
  onProcessingStart,
  onProcessingEnd,
  onCategorizationsReceived,
  onError,
}: CategorizationButtonProps) {
  const [api, contextHolder] = notification.useNotification();
  const canActivate = canCategorize(csvData, selectedValues);

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
      const postings = csvData.map((row: any, index: number) => {
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

        return posting;
      });

      // Call batch categorization API
      const result = await agentAPI.categorizeTransactionBatch({
        postings,
        options: {
          dry_run: true, // Don't save, just predict
          min_confidence: 'low', // Return all predictions
          use_historical_matching: true,
        },
      });

      if (result.success && result.data?.results) {
        // Store categorizations by index
        const catMap: Record<number, any> = {};
        result.data.results.forEach((r: any, i: number) => {
          if (r.predicted_account_id) {
            catMap[i] = {
              account_id: r.predicted_account_id,
              account_name: r.predicted_account_name,
              confidence: r.confidence,
              confidence_score: r.confidence_score,
              reasoning: r.reasoning,
            };
          }
        });
        onCategorizationsReceived(catMap);

        const summary = result.data.summary;
        api.success({
          message: "Categorization complete",
          description: `${summary.categorized_count} of ${csvData.length} transactions categorized`,
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
    </>
  );
}
