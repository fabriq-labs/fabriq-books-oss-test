"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { API_URL, getAuthToken } from "@/api/apiClient";
import { viewAPI } from "@/api/metadataApi";
import {
  buildFYOptions,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";
import {
  buildImportSampleCsvUrl,
  responseBodyLooksLikeCsv,
} from "@/components/import/utils/importSampleCsv";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import dayjs from "dayjs";
import { formatCurrency } from "@/lib/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  classification: string;
  code?: string;
}

interface JournalRow {
  account_id: string;
  account_name: string;
  classification: string;
  balance: string;
}

interface ImportedPostingRow {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  classification: string;
  isDebitLeg: boolean;
  amount: number;
  date: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BALANCE_SHEET_CLASSIFICATIONS = ["Assets", "Liabilities", "Equity"];
const CREDIT_NORMAL = new Set(["Liabilities", "Equity"]);

const BASE_CURRENCY_ID_TO_CODE: Record<string, string> = {
  curr_inr: "INR",
  curr_usd: "USD",
};

function resolveEntityCurrencyCode(
  entity: { currency?: { code?: string }; basecurrency_id?: string } | null
): string {
  const code = entity?.currency?.code?.trim().toUpperCase();
  if (code) return code;
  const fromId = entity?.basecurrency_id
    ? BASE_CURRENCY_ID_TO_CODE[entity.basecurrency_id.toLowerCase()]
    : undefined;
  return fromId ?? "INR";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeImbalance(rows: JournalRow[]): number {
  let net = 0;
  for (const r of rows) {
    const b = parseFloat(r.balance) || 0;
    if (!b) continue;
    net += CREDIT_NORMAL.has(r.classification) ? -b : b;
  }
  return net;
}

/** Reconstruct signed balance stored in migration journal rows from posting leg. */
function signedBalanceFromLeg(
  classification: string,
  isDebitLeg: boolean,
  amount: number
): number {
  if (CREDIT_NORMAL.has(classification)) {
    return isDebitLeg ? -amount : amount;
  }
  return isDebitLeg ? amount : -amount;
}

function dedupeJournalRows(rows: JournalRow[]): Array<{ account_id: string; balance: number }> {
  const byAccount = new Map<string, { account_id: string; balance: number }>();
  for (const row of rows) {
    if (!row.account_id || row.balance === "" || parseFloat(row.balance) === 0) continue;
    byAccount.set(row.account_id, {
      account_id: row.account_id,
      balance: parseFloat(row.balance),
    });
  }
  return [...byAccount.values()];
}

function defaultMigrationDate(fyType: FinancialYearType): string {
  const options = buildFYOptions(fyType, 5);
  const prevFY = options[options.length - 2];
  return prevFY.to_date;
}

function formatBalanceSheetDate(raw: string | null | undefined): string {
  if (!raw) return "";
  return dayjs(String(raw).slice(0, 10)).format("DD MMM YYYY");
}

function triggerCsvDownload(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

async function apiUpload(path: string, formData: FormData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OpeningBalances() {
  const { toast } = useToast();
  const { currentEntity, currentEntityId } = useEntity();

  const displayCurrencyCode = useMemo(
    () => resolveEntityCurrencyCode(currentEntity),
    [currentEntity]
  );

  // ── State ─────────────────────────────────────────────────────────────────

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Imported postings display
  const [importedPostings, setImportedPostings] = useState<ImportedPostingRow[]>([]);
  const [importedLoading, setImportedLoading] = useState(false);

  // Existing status (for the modal)
  const [existingCount, setExistingCount] = useState(0);
  const [existingDate, setExistingDate] = useState<string | null>(null);

  // Add modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [migrationDate, setMigrationDate] = useState<string>("");
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const replaceOnSave = useMemo(
    () => existingCount > 0 && (!existingDate || migrationDate === existingDate),
    [existingCount, existingDate, migrationDate]
  );

  // ── Entity-driven initialization ──────────────────────────────────────────

  useEffect(() => {
    if (!currentEntity || !currentEntityId) return;
    const fyType: FinancialYearType = currentEntity?.financial_year_type ?? "JAN_DEC";
    setMigrationDate(defaultMigrationDate(fyType));
    loadAccounts(currentEntityId);
    loadImportedPostings(currentEntityId);
    loadStatus(currentEntityId);
  }, [currentEntityId]);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadAccounts = useCallback(async (entityId: string) => {
    setAccountsLoading(true);
    try {
      const res: any = await viewAPI.search(
        "account", "account_view",
        1, 1000, undefined,
        { legal_entity_id: entityId, classification: { in: BALANCE_SHEET_CLASSIFICATIONS } }
      );
      const all: Account[] = (Array.isArray(res?.data) ? res.data : [])
        .filter((a: any) => BALANCE_SHEET_CLASSIFICATIONS.includes(a.classification))
        .map((a: any) => ({
          id: a.id,
          name: a.name ?? a.id,
          classification: a.classification,
          code: a.code,
        }))
        .sort((a: Account, b: Account) =>
          a.classification.localeCompare(b.classification) || a.name.localeCompare(b.name)
        );
      setAccounts(all);
    } catch {
      toast({ title: "Failed to load accounts", variant: "destructive" });
    } finally {
      setAccountsLoading(false);
    }
  }, [toast]);

  const loadStatus = useCallback(async (entityId: string) => {
    try {
      const res = await apiPost("/api/setup/custom/migration-journal-status", {
        legal_entity_id: entityId,
      });
      const count = res?.postings_count ?? 0;
      const savedDate = res?.dates?.[0] ?? null;
      setExistingCount(count);
      setExistingDate(savedDate);
      if (savedDate) setMigrationDate(savedDate);
    } catch { /* non-critical */ }
  }, []);

  const loadImportedPostings = useCallback(async (entityId: string) => {
    setImportedLoading(true);
    try {
      const res: any = await viewAPI.search(
        "posting", "posting_view",
        1, 200, undefined,
        { legal_entity_id: entityId, posting_type: "OPENING_BALANCE" },
        { value_date: "asc" }
      );
      const raw: any[] = Array.isArray(res?.data) ? res.data : [];

      const result: ImportedPostingRow[] = [];
      for (const p of raw) {
        const acct = p.account;
        const creditAcct = p.credit_account;
        const isOBCDebit = acct?.code === "__OBC__";

        if (isOBCDebit) {
          if (creditAcct) {
            result.push({
              accountId: creditAcct.id,
              accountName: creditAcct.name ?? creditAcct.id,
              accountCode: creditAcct.code ?? null,
              classification: creditAcct.classification ?? "",
              isDebitLeg: false,
              amount: Number(p.amount),
              date: p.value_date ?? p.posting_date ?? "",
            });
          }
        } else if (acct) {
          result.push({
            accountId: acct.id,
            accountName: acct.name ?? acct.id,
            accountCode: acct.code ?? null,
            classification: acct.classification ?? "",
            isDebitLeg: true,
            amount: Number(p.amount),
            date: p.value_date ?? p.posting_date ?? "",
          });
        }
      }

      const byAccount = new Map<string, ImportedPostingRow>();
      for (const row of result) {
        byAccount.set(row.accountId, row);
      }

      const deduped = [...byAccount.values()].sort(
        (a, b) =>
          Number(b.isDebitLeg) - Number(a.isDebitLeg) ||
          (a.accountName ?? "").localeCompare(b.accountName ?? "")
      );
      setImportedPostings(deduped);
    } catch {
      setImportedPostings([]);
    } finally {
      setImportedLoading(false);
    }
  }, []);

  // ── Row management (modal) ────────────────────────────────────────────────

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { account_id: "", account_name: "", classification: "", balance: "" }]);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAccountSelect = useCallback((idx: number, accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], account_id: account.id, account_name: account.name, classification: account.classification };
      return next;
    });
  }, [accounts]);

  const handleBalanceChange = useCallback((idx: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], balance: value };
      return next;
    });
  }, []);

  const openAddModal = () => {
    if (importedPostings.length > 0) {
      setRows(
        importedPostings.map((row) => {
          const classification =
            accounts.find((a) => a.id === row.accountId)?.classification ??
            row.classification;
          return {
            account_id: row.accountId,
            account_name: row.accountName,
            classification,
            balance: String(
              signedBalanceFromLeg(classification, row.isDebitLeg, row.amount)
            ),
          };
        })
      );
    } else {
      setRows([]);
    }
    setIsModalOpen(true);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!currentEntityId) return;
    const filledRows = dedupeJournalRows(rows);

    if (!filledRows.length) {
      toast({ title: "Enter at least one non-zero balance", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiPost("/api/setup/custom/migration-journal", {
        legal_entity_id: currentEntityId,
        migration_date: migrationDate,
        rows: filledRows,
        replace: replaceOnSave,
      });

      const obcMsg = Math.abs(result.obc_balance) > 0.01
        ? ` Imbalance of ${result.obc_balance.toFixed(2)} posted to "Opening Balance Clearing".`
        : "";

      toast({ title: "Opening balances saved", description: `${result.postings_created} postings created.${obcMsg}` });
      setIsModalOpen(false);
      setExistingCount(result.postings_created);
      setExistingDate(migrationDate);
      await loadImportedPostings(currentEntityId);
      await loadStatus(currentEntityId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── CSV upload ────────────────────────────────────────────────────────────

  const handleCsvUpload = async (file: File) => {
    if (!currentEntityId) return;
    if (!migrationDate) {
      toast({ title: "Choose a balances-as-of date first", variant: "destructive" });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("legal_entity_id", currentEntityId);
    fd.append("migration_date", migrationDate);
    fd.append("replace", String(replaceOnSave));

    setSubmitting(true);
    try {
      const result = await apiUpload("/api/setup/custom/migration-journal-csv", fd);
      const errMsg = result.parse_errors?.length ? ` (${result.parse_errors.length} rows skipped)` : "";
      toast({ title: "CSV imported", description: `${result.postings_created} postings created.${errMsg}` });
      if (result.parse_errors?.length) console.warn("CSV parse errors:", result.parse_errors);
      setExistingCount(result.postings_created);
      setExistingDate(migrationDate);
      await loadImportedPostings(currentEntityId);
      await loadStatus(currentEntityId);
    } catch (err: any) {
      toast({ title: "CSV import failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadSample = async () => {
    const url = buildImportSampleCsvUrl("opening_balances");
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!responseBodyLooksLikeCsv(text, res.headers.get("content-type"))) {
        throw new Error("Sample file not found");
      }
      triggerCsvDownload(text, "opening_balances_sample.csv");
    } catch {
      toast({ title: "Could not download sample CSV", variant: "destructive" });
    }
  };

  const openCsvPicker = () => {
    if (!migrationDate) {
      toast({ title: "Choose a balances-as-of date first", variant: "destructive" });
      return;
    }
    fileRef.current?.click();
  };

  // ── Delete all ────────────────────────────────────────────────────────────

  const handleDeleteAll = async () => {
    if (!currentEntityId || !existingDate) return;
    setSubmitting(true);
    try {
      await apiPost("/api/setup/custom/migration-journal-delete", {
        legal_entity_id: currentEntityId,
        migration_date: existingDate,
      });
      toast({ title: "Opening balances removed" });
      setExistingCount(0);
      setExistingDate(null);
      setImportedPostings([]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const imbalance = computeImbalance(rows);
  const isBalanced = Math.abs(imbalance) < 0.01;
  const usedAccountIds = new Set(rows.map((r) => r.account_id).filter(Boolean));
  const savedAsOfLabel = formatBalanceSheetDate(existingDate);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto py-6">
      {/* ── Page header ── */}
      <div className="space-y-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Opening Balances</h2>
          {savedAsOfLabel ? (
            <p className="text-sm text-muted-foreground mt-0.5">
              Current balances as of <span className="font-medium">{savedAsOfLabel}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">
              Set balance-sheet opening balances for the selected entity — enter manually or import a CSV.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="migration-date">Balances as of</Label>
            <Input
              id="migration-date"
              type="date"
              value={migrationDate}
              onChange={(e) => setMigrationDate(e.target.value)}
              className="w-48 bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Same date is used for manual entry and CSV import.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleDownloadSample}
            >
              <Download size={16} />
              Download sample CSV
            </Button>
            <Button
              className="flex items-center gap-2 bg-primary hover:bg-primary/90"
              onClick={openAddModal}
              disabled={accountsLoading || !migrationDate}
            >
              <Plus size={16} />
              {existingCount > 0 ? "Edit manually" : "Enter manually"}
            </Button>
            <Button
              className="flex items-center gap-2 bg-primary hover:bg-primary/90"
              onClick={openCsvPicker}
              disabled={submitting || !migrationDate}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Import CSV
            </Button>
            <input
              type="file"
              accept=".csv,text/csv"
              ref={fileRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                handleCsvUpload(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {existingCount > 0 && existingDate && migrationDate !== existingDate && (
          <p className="text-sm text-amber-600 flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Saving on {formatBalanceSheetDate(migrationDate)} will add a new batch; existing balances on{" "}
            {savedAsOfLabel} stay until removed.
          </p>
        )}
      </div>

      {/* ── Imported entries table ── */}
      {importedLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : importedPostings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm font-medium">No opening balances set yet.</p>
          <p className="text-xs mt-1 max-w-md text-center">
            Choose a date above, then enter balances manually or import a CSV. Download the sample to see the expected format.
          </p>
        </div>
      ) : (
        <div className="w-full space-y-4">
          {/* CSV hint */}
          <p className="text-xs text-muted-foreground">
            CSV format: <code className="bg-muted px-1 rounded">Account Code</code> or{" "}
            <code className="bg-muted px-1 rounded">Account Name</code>, plus{" "}
            <code className="bg-muted px-1 rounded">Debit Balance</code> /{" "}
            <code className="bg-muted px-1 rounded">Credit Balance</code> or{" "}
            <code className="bg-muted px-1 rounded">Balance</code>.
          </p>

          <div className="rounded-md border">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground">
                {importedPostings.length} accounts
                {savedAsOfLabel ? ` · as of ${savedAsOfLabel}` : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                onClick={handleDeleteAll}
                disabled={submitting}
              >
                <Trash2 size={13} className="mr-1" />
                Remove all
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Account</TableHead>
                  <TableHead className="text-right pr-4 w-48">Balance ({displayCurrencyCode})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importedPostings.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell className="pl-4 text-sm">
                      {row.accountCode && (
                        <span className="text-muted-foreground mr-1.5 font-mono text-xs">{row.accountCode}</span>
                      )}
                      {row.accountName}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <span className="font-mono text-sm">
                        {formatCurrency(row.amount, displayCurrencyCode)}
                      </span>
                      <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${
                        row.isDebitLeg
                          ? "bg-blue-50 text-blue-700"
                          : "bg-green-50 text-green-700"
                      }`}>
                        {row.isDebitLeg ? "Dr" : "Cr"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Add / Replace Modal ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {replaceOnSave ? "Replace Opening Balances" : "Enter Opening Balances"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {existingCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Existing accounts are loaded below. Change a balance or add accounts, then save —
                the full list replaces opening balances for this date (one row per account).
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="modal-migration-date">Balances as of</Label>
                <Input
                  id="modal-migration-date"
                  type="date"
                  value={migrationDate}
                  onChange={(e) => setMigrationDate(e.target.value)}
                  className="w-48 bg-background"
                />
              </div>
              {replaceOnSave && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  {existingCount} existing entries on this date will be replaced.
                </p>
              )}
            </div>

            {/* Accounts table */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Account</TableHead>
                    <TableHead className="w-32">Classification</TableHead>
                    <TableHead className="text-right w-44 pr-4">Balance</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                        No accounts added yet. Click "Add account" below.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="pl-4">
                        <Select
                          value={row.account_id}
                          onValueChange={(v) => handleAccountSelect(idx, v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select account…" />
                          </SelectTrigger>
                          <SelectContent>
                            {BALANCE_SHEET_CLASSIFICATIONS.map((cls) => {
                              const clsAccounts = accounts.filter(
                                (a) => a.classification === cls &&
                                  (!usedAccountIds.has(a.id) || a.id === row.account_id)
                              );
                              if (!clsAccounts.length) return null;
                              return (
                                <React.Fragment key={cls}>
                                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    {cls}
                                  </div>
                                  {clsAccounts.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {a.code ? `${a.code} · ${a.name}` : a.name}
                                    </SelectItem>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.classification || "—"}
                      </TableCell>
                      <TableCell className="pr-4">
                        <Input
                          type="number"
                          step="0.01"
                          className="text-right h-8 text-sm"
                          placeholder="0.00"
                          value={row.balance}
                          onChange={(e) => handleBalanceChange(idx, e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="px-4 py-2 border-t">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-8"
                  onClick={addRow}
                  disabled={accountsLoading}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add account
                </Button>
              </div>
            </div>

            {/* Balance check */}
            {rows.length > 0 && (
              <div className={`flex items-center gap-2 text-sm px-1 ${isBalanced ? "text-green-700" : "text-amber-600"}`}>
                {isBalanced
                  ? <CheckCircle2 size={15} />
                  : <AlertTriangle size={15} />}
                {isBalanced
                  ? "Assets = Liabilities + Equity"
                  : `Difference: ${formatCurrency(Math.abs(imbalance), displayCurrencyCode)} — will post to "Opening Balance Clearing"`}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !migrationDate || rows.length === 0}
              className="bg-primary hover:bg-primary/90"
            >
              {submitting ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" />Saving…</>
              ) : (
                replaceOnSave ? "Replace opening balances" : "Save opening balances"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
