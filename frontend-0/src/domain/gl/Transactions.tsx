import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Master from "@/pages/Master";
import { keepPostingFields } from "./postingImportExtension";

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function keyFor(mapping: Record<string, string>, field: string): string | null {
  return Object.keys(mapping).find((key) => mapping[key] === field) ?? null;
}

/**
 * Turns statement debit and credit columns into one amount and two account ids.
 * The selected bank account is the side that matches the statement direction.
 */
export function transformPostingCSVData(formattedData: any, relationId: any): any {
  const { mapping, data } = formattedData;
  let mappingValue: Record<string, string> = { ...(mapping || {}) };

  const hasSplit =
    relationId &&
    Object.values(mappingValue).includes("debit_amount") &&
    Object.values(mappingValue).includes("credit_amount");

  if (hasSplit) {
    const debitColumn = keyFor(mappingValue, "debit_amount");
    const creditColumn = keyFor(mappingValue, "credit_amount");
    const counterColumn = keyFor(mappingValue, "counter_account_id");
    const legacyContra = keyFor(mappingValue, "credit_account_id");
    const notesColumn = keyFor(mappingValue, "notes");

    delete mappingValue[debitColumn || ""];
    delete mappingValue[creditColumn || ""];
    if (counterColumn) delete mappingValue[counterColumn];
    if (legacyContra && legacyContra !== "credit_account_id") delete mappingValue[legacyContra];
    mappingValue = {
      ...mappingValue,
      debit_account_id: "debit_account_id",
      credit_account_id: "credit_account_id",
      amount: "amount",
      notes: "notes",
    };

    const csvData = (data || []).map((record: any) => {
      const debitAmount = toNumber(debitColumn ? record[debitColumn] : 0);
      const creditAmount = toNumber(creditColumn ? record[creditColumn] : 0);
      const contra =
        (counterColumn ? record[counterColumn] : null) ||
        (legacyContra ? record[legacyContra] : null) ||
        null;
      const aiNotes =
        record.__ai_notes != null && String(record.__ai_notes).trim() !== ""
          ? String(record.__ai_notes).trim()
          : null;
      const mappedNotes = notesColumn ? record[notesColumn] : null;
      const next = keepPostingFields({
        ...record,
        amount: debitAmount !== 0 ? debitAmount : creditAmount,
        debit_account_id: creditAmount !== 0 ? relationId : contra,
        credit_account_id: debitAmount !== 0 ? relationId : contra,
        notes: aiNotes || mappedNotes || record.notes || null,
      });
      return next;
    });

    return {
      mapping: mappingValue,
      isJSON: true,
      data: csvData,
      parentData: formattedData.parentData,
    };
  }

  if (relationId && Object.values(mappingValue).includes("amount")) {
    const hasCredit = Object.values(mappingValue).includes("credit_account_id");
    if (!hasCredit && !Object.values(mappingValue).includes("debit_account_id")) {
      mappingValue.credit_account_id = "credit_account_id";
    }
    if (!Object.values(mappingValue).includes("debit_account_id")) {
      mappingValue.debit_account_id = "debit_account_id";
    }
    const csvData = (data || []).map((record: any) =>
      keepPostingFields({
        ...record,
        notes:
          record.__ai_notes != null && String(record.__ai_notes).trim() !== ""
            ? String(record.__ai_notes).trim()
            : record.notes ?? null,
        debit_account_id: Object.values(mappingValue).includes("credit_account_id") ? relationId : record.debit_account_id ?? null,
        credit_account_id: Object.values(mappingValue).includes("debit_account_id") && !Object.values(mappingValue).includes("credit_account_id")
          ? relationId
          : record.credit_account_id ?? null,
      })
    );
    return { mapping: mappingValue, isJSON: true, data: csvData, parentData: formattedData.parentData };
  }

  return {
    ...formattedData,
    data: Array.isArray(data) ? data.map((record: any) => keepPostingFields(record)) : data,
  };
}

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const urlAccountId = searchParams.get("account_id");
  const urlFromDate = searchParams.get("from_date");
  const urlToDate = searchParams.get("to_date");

  const defaultFilters = useMemo(() => ({ kind: { neq: "duplicate" } }), []);

  const presetFilters = useMemo(() => {
    const preset: Record<string, unknown> = {};
    if (urlAccountId) {
      preset.debit_account_id_or_credit_account_id = { eq: urlAccountId };
    }
    if (urlFromDate && urlToDate) {
      preset.value_date = {
        gte: new Date(urlFromDate).toISOString(),
        lte: new Date(`${urlToDate}T23:59:59`).toISOString(),
      };
    }
    return Object.keys(preset).length > 0 ? preset : undefined;
  }, [urlAccountId, urlFromDate, urlToDate]);

  return (
    <Master
      type="posting"
      view="posting_view"
      displayName="Transactions"
      defaultFilters={defaultFilters}
      presetFilters={presetFilters}
      listConfig={{
        importConfig: {
          updateCSVData: transformPostingCSVData,
          additionalFileds: [
            { key: "debit_amount", displayName: "Debit Amount" },
            { key: "credit_amount", displayName: "Credit Amount" },
            { key: "counter_account_id", displayName: "Counter Account" },
          ],
          relation: "account",
          relationView: "account_view",
          relationField: "name",
          relationFieldId: "debit_account_id",
        },
      }}
    />
  );
}
