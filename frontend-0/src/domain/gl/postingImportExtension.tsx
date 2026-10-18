import { ReactNode } from "react";
import { importAPI } from "@/api/api";
import {
  ImportExtension,
  ImportExtensionState,
  PdfUploadContext,
  PdfUploadOptions,
  PdfUploadResult,
  RelationFilterContext,
  ToolbarActionProps,
} from "@/features/import-extensions/types";
import { CategorizationButton } from "@/domain/gl/CategorizationButton";

const POSTING_FIELDS = new Set([
  "name",
  "description",
  "account_name",
  "notes",
  "category_name",
  "value_date",
  "posting_date",
  "amount",
  "debit_account_id",
  "credit_account_id",
  "entity_id",
  "kind",
  "status",
  "reconciliation_status",
]);

/**
 * PDF bank-statement import for posting.
 * Categorization predictions land in counter_account_id. The transaction list
 * then puts the selected bank account on one side and that counter account
 * on the other.
 */
export const postingImportExtension: ImportExtension = {
  targetModel: "posting",

  canActivate(modelType: string): boolean {
    return modelType === "posting";
  },

  /**
   * The mapper draws an AI Category column on the right when this returns a column.
   * Predictions come from PDF extract-and-categorize or the Categorize button.
   */
  getColumns(state: ImportExtensionState) {
    if (Object.keys(state.categorizations).length === 0) return [];
    return [
      {
        title: "AI Category",
        key: "ai_category",
        width: 180,
        fixed: "right" as const,
        render: () => null,
      },
    ];
  },

  renderToolbarActions(props: ToolbarActionProps): ReactNode {
    return <CategorizationButton {...props} />;
  },

  async handlePdfUpload(file: File, options: PdfUploadOptions): Promise<PdfUploadResult> {
    const shouldCategorize = options.categorizeInExtraction === true;
    const res: any = shouldCategorize
      ? await importAPI.parseDocumentWithCategorization(
          file,
          options.legalEntityId,
          options.accountId,
          options.enableChunking === true,
          options.onProgress
        )
      : await importAPI.parseDocument("posting", file);

    if (res && res.success === false) {
      throw new Error(res.error || "PDF parsing failed");
    }

    const transactions = res.data?.transactions || res?.transactions || [];
    const categorizations = res.data?.categorizations || res?.categorizations || [];
    const importId = res?.metaData?.import_id ?? res?.import_id ?? res?.data?.import_id;
    const accountContext = res.data?.accountContext ?? res.accountContext;

    if (transactions.length === 0) {
      const acctLabel =
        accountContext?.accountNumber != null
          ? `account ${accountContext.accountNumber}`
          : "the selected account";
      return {
        csvContent: "",
        import_id: importId,
        categorizations: [],
        empty: true,
        emptyMessage: `No transactions found for ${acctLabel} in this statement.`,
      };
    }

    const headers = Object.keys(transactions[0]);
    const values = transactions
      .map((item: Record<string, unknown>) =>
        headers
          .map((key) => {
            let value = item[key];
            if (value === null || value === undefined) value = "";
            return String(value).replace(/\n/g, " ").replace(/,/g, "");
          })
          .join(",")
      )
      .join("\n");

    return {
      csvContent: `${headers.join(",")}\n${values}`,
      import_id: importId,
      categorizations,
    };
  },

  getPdfUploadOptions(context: PdfUploadContext): PdfUploadOptions {
    const selected = context.relationSelection;
    const legalEntityId = selected?.item?.entity_id || undefined;
    const accountId = context.relationId || undefined;
    return { legalEntityId, accountId };
  },

  getRelationFormLabel(): string {
    return "Bank account";
  },

  getRelationAdditionalFilters(context: RelationFilterContext): Record<string, unknown> {
    const entityId = context.currentEntityId ?? context.effectiveEntityId;
    if (!entityId) return {};
    return { entity_id: { eq: entityId } };
  },

  transformDataForUpload(
    csvData: any[],
    selectedValues: string[],
    categorizations: Record<number, any>
  ): { csvData: any[]; selectedValues: string[] } {
    if (Object.keys(categorizations).length === 0) {
      return { csvData, selectedValues };
    }

    const tableHeaders = Object.keys(csvData[0] || {});
    const counterColIndex = selectedValues.findIndex((val) => val === "counter_account_id");
    const counterColKey = counterColIndex >= 0 ? tableHeaders[counterColIndex] : null;
    const AI_COUNTER = "__ai_counter_account";
    const AI_NOTES = "__ai_notes";
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
        const reasoning = typeof cat.reasoning === "string" ? cat.reasoning.trim() : "";
        if (reasoning) record[AI_NOTES] = reasoning;
      }
      return record;
    });

    const finalSelectedValues = [...selectedValues];
    if (needCounterCol) finalSelectedValues.push("counter_account_id");
    finalSelectedValues.push("notes");
    return { csvData: finalCSVData, selectedValues: finalSelectedValues };
  },
};

const DATE_FIELDS = new Set(["value_date", "posting_date"]);

/** Prisma DateTime rejects a bare YYYY-MM-DD. Statement cells are often MM/DD/YYYY. */
export function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const mdy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, "0");
    const day = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${month}-${day}T00:00:00.000Z`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function keepPostingFields(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (!POSTING_FIELDS.has(key)) continue;
    if (DATE_FIELDS.has(key)) {
      const iso = toIsoDate(value);
      if (iso) next[key] = iso;
      continue;
    }
    if (key === "amount" && typeof value === "string") {
      const normalized = value.replace(/,/g, "").trim();
      if (normalized !== "") next[key] = normalized;
      continue;
    }
    next[key] = value;
  }
  return next;
}
