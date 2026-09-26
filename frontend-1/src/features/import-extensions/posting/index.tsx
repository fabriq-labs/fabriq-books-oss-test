import { ReactNode } from 'react';
import {
  ImportExtension,
  ImportExtensionState,
  ImportExtensionColumn,
  ToolbarActionProps,
  PdfUploadResult,
  PdfUploadOptions,
  PdfUploadContext,
  RelationFilterContext,
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
          options.enableChunking === true,
          options.onProgress
        )
      : await importAPI.parseDocument('posting', file);

    if (!res.success) {
      throw new Error(res.error || 'PDF parsing failed');
    }

    const transactions = res.data?.transactions || [];
    const categorizations = res.data?.categorizations || [];
    const importId = res?.metaData?.import_id ?? res?.import_id ?? res?.data?.import_id;
    const accountContext = res.data?.accountContext;

    if (transactions.length === 0) {
      const acctLabel =
        accountContext?.accountNumber != null
          ? `account ${accountContext.accountNumber}`
          : 'the selected account';
      return {
        csvContent: '',
        import_id: importId,
        categorizations: [],
        empty: true,
        emptyMessage: `No transactions found for ${acctLabel} in this statement. The PDF may list other accounts, or this account had no activity in the period.`,
      };
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
      import_id: importId,
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

  getRelationFormLabel(): string {
    return 'Bank account';
  },

  getRelationAdditionalFilters(context: RelationFilterContext): Record<string, any> {
    const entityId = context.currentEntityId ?? context.effectiveEntityId;
    if (!entityId) return {};
    return { legal_entity_id: { eq: entityId } };
  },

  /**
   * Transform data for upload, injecting AI categorizations.
   *
   * Predictions go in counter_account_id, not account_id / credit_account_id.
   * Transactions.tsx then places the bank on one side and this counter on the other.
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

    const tableHeaders = Object.keys(csvData[0] || {});
    const counterColIndex = selectedValues.findIndex((val: string) => val === 'counter_account_id');
    const counterColKey = counterColIndex >= 0 ? tableHeaders[counterColIndex] : null;

    const AI_COUNTER = '__ai_counter_account';
    const AI_NOTES = '__ai_notes';
    const needCounterCol = !counterColKey;

    const finalCSVData = csvData.map((item: any, index: number) => {
      const record: any = {};
      Object.keys(item).forEach((key) => {
        record[key] = item[key]?.isNotAvailable ? null : item[key];
      });
      if (needCounterCol) record[AI_COUNTER] = null;
      record[AI_NOTES] = null;

      const cat = categorizations[index];
      if (cat && cat.confidence_score >= 0.5 && cat.account_id) {
        const targetKey = counterColKey || AI_COUNTER;
        if (!record[targetKey]) record[targetKey] = cat.account_id;

        const reasoning =
          typeof cat.reasoning === 'string' ? cat.reasoning.trim() : '';
        if (reasoning) {
          const existingRaw = record.notes;
          const existing =
            existingRaw == null || existingRaw === ''
              ? ''
              : String(existingRaw).trim();
          record[AI_NOTES] =
            !existing || existing === reasoning
              ? reasoning
              : existing.includes(reasoning)
                ? existing
                : `${existing}\n\nAI: ${reasoning}`;
        }
      }

      return record;
    });

    const finalSelectedValues = [...selectedValues];
    if (needCounterCol) finalSelectedValues.push('counter_account_id');
    // Always map this column. Putting it last means it wins over an empty extracted notes column.
    finalSelectedValues.push('notes');

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
