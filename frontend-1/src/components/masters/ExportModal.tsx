import { useState, useMemo } from "react";
import Papa from "papaparse";
import { viewAPI } from "@/api/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ChevronDown, ChevronUp } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  metaData: Record<string, any>;
  type: string;
  view: string;
  currentFilters: Record<string, any>;
  displayName: string;
  sortOption?: Record<string, string>;
}

interface ColumnOption {
  key: string;
  label: string;
  meta: any;
  checked: boolean;
}

const SEPARATORS = [
  { label: "Comma  ( , )", value: "," },
  { label: "Pipe  ( | )", value: "|" },
  { label: "Tab  ( ⇥ )", value: "\t" },
];

function getNestedValue(record: Record<string, any>, path: string): unknown {
  return path.split(".").reduce((obj: any, prop) => obj?.[prop], record);
}

function extractCsvValue(record: Record<string, any>, key: string, meta: any): string {
  const raw = record[key];

  if (meta.listProps) {
    const val = meta.listProps.recordPath
      ? getNestedValue(record, meta.listProps.recordPath)
      : raw;
    if (Array.isArray(val)) return val.map((v: any) => v?.label ?? v?.name ?? String(v ?? "")).join(", ");
    return String(val ?? "");
  }

  if (meta.select && (meta.datatype === "table" || meta.dataType === "table")) {
    if (!raw || typeof raw !== "object") return "";
    const selectKeys = Object.keys(meta.select);
    return selectKeys.map((k) => raw[k] ?? "").filter(Boolean).join(" ");
  }

  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

export default function ExportModal({
  isOpen,
  onClose,
  metaData,
  type,
  view,
  currentFilters,
  displayName,
  sortOption = {},
}: ExportModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxRows, setMaxRows] = useState(1000);
  const [separator, setSeparator] = useState(",");
  const [enclosedByQuotes, setEnclosedByQuotes] = useState(true);
  const [loading, setLoading] = useState(false);

  const initialColumns: ColumnOption[] = useMemo(() => {
    if (!metaData) return [];
    const sorted = Object.entries(metaData).sort(([, a]: any, [, b]: any) => {
      return (a.orderNo ?? Infinity) - (b.orderNo ?? Infinity);
    });
    return sorted
      .filter(([, meta]: any) => meta.displayName)
      .map(([key, meta]: any) => ({
        key,
        label: meta.displayName,
        meta,
        checked: meta.isColumnShow !== false,
      }));
  }, [metaData]);

  const [columns, setColumns] = useState<ColumnOption[]>([]);

  const activeColumns = columns.length > 0 ? columns : initialColumns;

  const handleOpen = () => {
    setColumns(initialColumns);
    setShowAdvanced(false);
    setMaxRows(1000);
    setSeparator(",");
    setEnclosedByQuotes(true);
  };

  const allChecked = activeColumns.every((c) => c.checked);
  const noneChecked = activeColumns.every((c) => !c.checked);

  const toggleColumn = (key: string) => {
    setColumns(activeColumns.map((c) => (c.key === key ? { ...c, checked: !c.checked } : c)));
  };

  const selectAll = () => {
    setColumns(activeColumns.map((c) => ({ ...c, checked: true })));
  };

  const clearAll = () => {
    setColumns(activeColumns.map((c) => ({ ...c, checked: false })));
  };

  const handleExport = async () => {
    const selected = activeColumns.filter((c) => c.checked);
    if (selected.length === 0) return;

    setLoading(true);
    try {
      const limit = Math.min(Math.max(1, maxRows), 10000);
      const res: any = await viewAPI.search(type, view, 1, limit, undefined, currentFilters, sortOption);
      const rows: Record<string, any>[] = res?.data ?? [];

      const csvData = rows.map((record) => {
        const row: Record<string, string> = {};
        selected.forEach(({ key, label, meta }) => {
          row[label] = extractCsvValue(record, key, meta);
        });
        return row;
      });

      const csv = Papa.unparse(csvData, {
        delimiter: separator,
        quotes: enclosedByQuotes,
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${displayName.toLowerCase().replace(/\s+/g, "_")}_export_${dateStr}.csv`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) handleOpen();
        else onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {displayName}</DialogTitle>
          <DialogDescription>
            Select columns to include in the CSV export.
          </DialogDescription>
        </DialogHeader>

        {/* Select All / Clear All */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            {activeColumns.filter((c) => c.checked).length} of {activeColumns.length} columns selected
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAll}
              disabled={allChecked}
              className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-default"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={noneChecked}
              className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-default"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Column list */}
        <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 px-2 py-1 space-y-0.5">
          {activeColumns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer select-none"
            >
              <Checkbox
                checked={col.checked}
                onCheckedChange={() => toggleColumn(col.key)}
                id={`col-${col.key}`}
              />
              <span className="text-sm">{col.label}</span>
            </label>
          ))}
          {activeColumns.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No columns available
            </p>
          )}
        </div>

        <Separator />

        {/* Advanced section */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Advanced
          </button>
          {showAdvanced && (
            <div className="space-y-4 pl-1">
              {/* Max rows */}
              <div className="space-y-1.5">
                <Label htmlFor="max-rows" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Max rows
                </Label>
                <Input
                  id="max-rows"
                  type="number"
                  min={1}
                  max={10000}
                  value={maxRows}
                  onChange={(e) => setMaxRows(Number(e.target.value))}
                  className="h-9 w-36"
                />
                <p className="text-xs text-muted-foreground">Default: 1,000. Maximum: 10,000.</p>
              </div>

              {/* Separator */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Separator
                </Label>
                <Select value={separator} onValueChange={setSeparator}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEPARATORS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Enclosed by quotes */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  id="enclosed-quotes"
                  checked={enclosedByQuotes}
                  onCheckedChange={(checked) => setEnclosedByQuotes(!!checked)}
                />
                <span className="text-sm">Enclose fields in quotes</span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading || noneChecked}>
            {loading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
