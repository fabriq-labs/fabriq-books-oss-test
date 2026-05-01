import { ReactNode } from 'react';
import {
  ImportExtension,
  ImportExtensionState,
  ImportExtensionColumn,
  ToolbarActionProps,
  PdfUploadResult,
  PdfUploadOptions,
  PdfUploadContext,
} from '../types';
import { CategorizationButton } from './CategorizationButton';
import { getCategorizationColumn } from './CategorizationColumn';
import { importAPI } from '@/api/api';

/**
 * Posting Import Extension
 *
 * Provides posting/bank statement specific import functionality:
 * - AI-powered transaction categorization button
 * - AI Category column in import table
 * - PDF upload with combined extraction + categorization
 * - Data transformation to inject AI predictions into upload
 */
export const postingImportExtension: ImportExtension = {
  targetModel: 'posting',

  /**
   * Check if extension should be active
   */
  canActivate(modelType: string, csvData: any[], mappings: string[]): boolean {
    return modelType === 'posting' && csvData.length > 0;
  },

  /**
   * Get custom columns for the import table
   */
  getColumns(state: ImportExtensionState): ImportExtensionColumn[] {
    // Only show AI Category column when there are categorizations
    if (Object.keys(state.categorizations).length === 0) {
      return [];
    }
    return [getCategorizationColumn(state)];
  },

  /**
   * Render toolbar actions (Categorize button)
   */
  renderToolbarActions(props: ToolbarActionProps): ReactNode {
    // Render the categorization button with a wrapper to manage state
    return (
      <CategorizationButtonWrapper {...props} />
    );
  },

  /**
   * Handle PDF upload (with optional categorization)
   */
  async handlePdfUpload(file: File, options: PdfUploadOptions): Promise<PdfUploadResult> {
    const shouldCategorizeInExtraction = options.categorizeInExtraction === true;
    const res: any = shouldCategorizeInExtraction
      ? await importAPI.parseDocumentWithCategorization(
          file,
          options.legalEntityId,
          options.accountId,
          options.enableChunking === true
        )
      : await importAPI.parseDocument('posting', file);

    if (!res.success) {
      throw new Error(res.error || 'PDF parsing failed');
    }

    const transactions = res.data?.transactions || [];
    const categorizations = res.data?.categorizations || [];

    if (transactions.length === 0) {
      throw new Error('No transactions found in the PDF');
    }

    // Transform AI-extracted data to CSV format
    const headers = Object.keys(transactions[0]).join(",");
    const values = transactions
      .map((item: any) => {
        return headers
          .split(",")
          .map((key) => {
            let value = item[key];

            if (value === null || value === undefined) {
              value = "";
            }

            value = String(value);

            if (typeof value === "string") {
              value = value.replace(/\n/g, " ");
              value = value.replace(/,/g, "");
            }

            return value;
          })
          .join(",");
      })
      .join("\n");

    const csvContent = `${headers}\n${values}`;

    return {
      csvContent,
      categorizations,
    };
  },

  /**
   * Build PDF upload options from selected account (if any)
   */
  getPdfUploadOptions(context: PdfUploadContext): PdfUploadOptions {
    const selected = context.relationSelection;
    const legalEntityId =
      selected?.item?.legal_entity_id ||
      selected?.item?.legalEntityId ||
      undefined;
    // relationId is the actual selected account ID (relationFieldId is the field name "account_id")
    const accountId = context.relationId || undefined;
    return { legalEntityId, accountId };
  },

  /**
   * Transform data for upload, injecting AI categorizations
   */
  transformDataForUpload(
    csvData: any[],
    selectedValues: string[],
    categorizations: Record<number, any>
  ): { csvData: any[]; selectedValues: string[] } {
    const hasCategorizations = Object.keys(categorizations).length > 0;

    if (!hasCategorizations) {
      return { csvData, selectedValues };
    }

    // Find which column is mapped to credit_account_id (the contra-account)
    const tableHeaders = Object.keys(csvData[0] || {});
    const creditAccountColIndex = selectedValues.findIndex((val: string) => val === 'credit_account_id');
    const creditAccountColKey = creditAccountColIndex >= 0 ? tableHeaders[creditAccountColIndex] : null;

    // Create a synthetic column key for AI predictions if no column is mapped to credit_account_id
    const aiCounterAccountKey = '__ai_counter_account';
    const useAiColumn = !creditAccountColKey;

    // Build final selectedValues with AI column mapping if needed
    const finalSelectedValues = useAiColumn
      ? [...selectedValues, 'credit_account_id']
      : selectedValues;

    const finalCSVData = csvData.map((item: any, index: number) => {
      const record: any = {};
      Object.keys(item).map((key) => {
        record[key] = item[key]?.isNotAvailable ? null : item[key];
      });

      // Inject AI categorization into the data
      const cat = categorizations[index];
      if (cat && cat.confidence_score >= 0.5) {
        if (creditAccountColKey) {
          // If a column is already mapped to credit_account_id, inject into that column
          // Only if the cell is currently empty
          if (!record[creditAccountColKey]) {
            record[creditAccountColKey] = cat.account_id;
          }
        } else {
          // Add a synthetic column with the AI prediction
          record[aiCounterAccountKey] = cat.account_id;
        }
      }

      return record;
    });

    return { csvData: finalCSVData, selectedValues: finalSelectedValues };
  },
};

/**
 * Wrapper component to manage categorization state
 * This allows the button to manage its own processing state while
 * passing categorizations back up to the parent
 */
function CategorizationButtonWrapper(props: ToolbarActionProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <CategorizationButton
      csvData={props.csvData}
      selectedValues={props.selectedValues}
      selectedRowKeys={props.selectedRowKeys}
      lookUpData={props.lookUpData}
      filedSets={props.filedSets}
      relationId={props.relationId}
      relationSelection={props.relationSelection}
      isProcessing={isProcessing}
      onProcessingStart={() => setIsProcessing(true)}
      onProcessingEnd={() => setIsProcessing(false)}
      onCategorizationsReceived={props.onCategorizationsReceived}
      onError={(error) => console.error('Categorization error:', error)}
    />
  );
}

// Import React useState
import { useState } from 'react';
