import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Pagination } from "antd";
import {
  Activity,
  Edit,
  Eye,
  Layers,
  Loader2,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { viewAPI, bulkEditAPI } from "@/api/api";
import { BulkEdit } from "@/components/masters/BulkEdit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/llmTokenCost";

const MODEL = "llm_trace";
const VIEW = "llm_trace_view";

interface TraceRow {
  id: string;
  question: string;
  query_type?: string;
  status: string;
  llm_model: string;
  duration_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_prompt_tokens?: number | null;
  cache_creation_tokens?: number | null;
  cost_usd?: number | string | null;
  tools_called?: string[];
  steps_count?: number;
  model_name?: string;
  user_id?: string;
  session_id?: string;
  response_text?: string;
  error_message?: string;
  created_at: string;
}

interface Filters {
  status: string;
  model_name: string;
  llm_model: string;
  query_type: string;
  date_range: string;
}

const DATE_RANGE_OPTIONS = [
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "all", label: "All Time" },
];

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(count?: number): string {
  if (count == null) return "—";
  return count.toLocaleString();
}

function formatCostUsd(value?: number | string | null): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  return formatUsd(n);
}

function formatShortId(id: string): string {
  const suffix = id.split("_").pop() ?? id;
  return `#${suffix.slice(-4)}`;
}

function statusLabel(status: string): string {
  if (status === "error" || status === "failed") return "Failed";
  if (status === "success") return "Success";
  return status;
}

function statusBadgeClass(status: string): string {
  if (status === "error" || status === "failed") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (status === "success") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function getDateRangeFilter(range: string): Record<string, string> | null {
  if (range === "all") return null;
  const now = new Date();
  const from = new Date(now);
  if (range === "24h") from.setHours(from.getHours() - 24);
  else if (range === "7d") from.setDate(from.getDate() - 7);
  else if (range === "30d") from.setDate(from.getDate() - 30);
  return { gte: from.toISOString(), lte: now.toISOString() };
}

function buildFilters(
  filters: Filters,
  searchTerm: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (filters.status) result.status = { eq: filters.status };
  if (filters.model_name) result.model_name = { eq: filters.model_name };
  if (filters.llm_model) result.llm_model = { eq: filters.llm_model };
  if (filters.query_type) result.query_type = { eq: filters.query_type };

  const dateFilter = getDateRangeFilter(filters.date_range);
  if (dateFilter) result.created_at = dateFilter;

  const term = searchTerm.trim();
  if (term) {
    result.OR = [
      { question: { contains: term } },
      { user_id: { contains: term } },
      { session_id: { contains: term } },
    ];
  }

  return result;
}

const filterSelectClass =
  "text-xs border rounded-md px-2 py-1.5 bg-white text-gray-700 h-8 min-w-[120px]";

export const LLMTracesPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [metaData, setMetaData] = useState<Record<string, unknown>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<TraceRow[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<Filters>({
    status: "",
    model_name: "",
    llm_model: "",
    query_type: "",
    date_range: "24h",
  });

  const loadingRef = useRef(false);

  const selectedIds = useMemo(
    () => new Set(selectedRows.map((r) => r.id)),
    [selectedRows]
  );
  const allSelected =
    traces.length > 0 && traces.every((t) => selectedIds.has(t.id));

  const modelNameOptions = useMemo(() => {
    const values = new Set<string>();
    traces.forEach((t) => {
      if (t.model_name) values.add(t.model_name);
    });
    return [...values].sort();
  }, [traces]);

  const llmModelOptions = useMemo(() => {
    const values = new Set<string>();
    traces.forEach((t) => {
      if (t.llm_model) values.add(t.llm_model);
    });
    return [...values].sort();
  }, [traces]);

  const loadTraces = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    try {
      const res: any = await viewAPI.search(
        MODEL,
        VIEW,
        page,
        pageSize,
        undefined,
        buildFilters(filters, searchTerm),
        { created_at: "desc" }
      );
      setTraces(res.data ?? []);
      setMetaData(res.metaData ?? {});
      setTotal(res.total ?? 0);
      setSelectedRows([]);
    } catch {
      setTraces([]);
      setMetaData({});
      setTotal(0);
      setSelectedRows([]);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [page, pageSize, filters, searchTerm]);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  const handleView = (id: string) => {
    navigate(`/llm_trace/${id}/view/${VIEW}`);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (current: number, size: number) => {
    setPageSize(size);
    setPage(current);
  };

  const toggleAll = () => {
    if (allSelected) {
      const pageIds = new Set(traces.map((t) => t.id));
      setSelectedRows((prev) => prev.filter((r) => !pageIds.has(r.id)));
    } else {
      const toAdd = traces.filter((t) => !selectedIds.has(t.id));
      setSelectedRows((prev) => [...prev, ...toAdd]);
    }
  };

  const toggleOne = (trace: TraceRow) => {
    setSelectedRows((prev) =>
      prev.some((r) => r.id === trace.id)
        ? prev.filter((r) => r.id !== trace.id)
        : [...prev, trace]
    );
  };

  const handleBulkEditClose = () => {
    setIsBulkEditOpen(false);
  };

  const handleBulkEditSave = async () => {
    setIsBulkEditOpen(false);
    setSelectedRows([]);
    void loadTraces();
  };

  const handleBulkDelete = (ids: string[]) => {
    Modal.confirm({
      title: "Are you sure you want to delete the selected items?",
      content: `This will delete ${ids.length} items.`,
      okText: "Yes, Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await bulkEditAPI.bulkDelete(MODEL, VIEW, ids);
          toast({
            title: "Success",
            description: `${ids.length} items deleted successfully`,
          });
          setSelectedRows([]);
          void loadTraces();
        } catch {
          toast({
            title: "Bulk delete",
            description: "Failed to delete items",
            variant: "destructive",
          });
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: "Are you sure you want to delete this item?",
      content: "This action cannot be undone.",
      okText: "Yes, Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await viewAPI.delete(MODEL, id, VIEW);
          toast({
            title: "Success",
            description: "Item deleted successfully",
          });
          void loadTraces();
        } catch {
          toast({
            title: "Error",
            description: "Failed to delete item",
            variant: "destructive",
          });
        }
      },
    });
  };

  const handleClearFilters = () => {
    setFilters({
      status: "",
      model_name: "",
      llm_model: "",
      query_type: "",
      date_range: "24h",
    });
    setSearchInput("");
    setSearchTerm("");
    setPage(1);
  };

  const hasActiveFilters =
    !!filters.status ||
    !!filters.model_name ||
    !!filters.llm_model ||
    !!filters.query_type ||
    filters.date_range !== "24h" ||
    !!searchTerm;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      <BulkEdit
        isOpen={isBulkEditOpen}
        onClose={handleBulkEditClose}
        onSave={handleBulkEditSave}
        selectedRows={selectedRows}
        metaData={metaData}
        type={MODEL}
        view={VIEW}
      />
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h1 className="text-lg font-semibold text-gray-900">LLM Traces</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Monitor agent queries, latency, and token usage
          </p>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search question, user, session..."
              className="pl-9 h-10 rounded-lg"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearchTerm(searchInput.trim());
                  setPage(1);
                }
              }}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b flex items-center gap-2 flex-wrap bg-gray-50/60">
          <select
            className={filterSelectClass}
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">Status: All</option>
            <option value="success">Success</option>
            <option value="error">Failed</option>
          </select>

          <select
            className={filterSelectClass}
            value={filters.model_name}
            onChange={(e) => {
              setFilters((f) => ({ ...f, model_name: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">Model Name: All</option>
            {modelNameOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            className={filterSelectClass}
            value={filters.llm_model}
            onChange={(e) => {
              setFilters((f) => ({ ...f, llm_model: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">LLM Model: All</option>
            {llmModelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            className={filterSelectClass}
            value={filters.date_range}
            onChange={(e) => {
              setFilters((f) => ({ ...f, date_range: e.target.value }));
              setPage(1);
            }}
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Date Range: {opt.label}
              </option>
            ))}
          </select>

          <select
            className={filterSelectClass}
            value={filters.query_type}
            onChange={(e) => {
              setFilters((f) => ({ ...f, query_type: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">Query Type: All</option>
            <option value="analytical">Analytical</option>
            <option value="transactional">Transactional</option>
          </select>

          {hasActiveFilters && (
            <Button
              variant="link"
              size="sm"
              className="text-xs h-8 px-2 text-primary"
              onClick={handleClearFilters}
            >
              Clear Filters
            </Button>
          )}
        </div>

        {!isLoading && selectedRows.length > 1 && (
          <div className="mx-6 mt-3 flex justify-between items-center p-3 bg-[#F1F0FB] rounded-md shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 text-[#9b87f5] border-[#9b87f5] hover:bg-[#E5DEFF]"
                onClick={() => setIsBulkEditOpen(true)}
              >
                <Edit size={16} />
                <span>Edit</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 text-red-500 hover:text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => handleBulkDelete(selectedRows.map((row) => row.id))}
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </Button>
            </div>
            <div className="text-sm font-medium text-[#403E43]">
              {selectedRows.length} items selected
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : traces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
              <Activity className="h-8 w-8" />
              <p className="text-sm font-medium">No traces found</p>
              <p className="text-xs">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b z-10">
                <tr>
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-24">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-36">Timestamp</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Trace / Context</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-36">LLM Model</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-20">Latency</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-24">Tokens</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-20">Cost</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {traces.map((trace) => {
                  const toolsCount = trace.tools_called?.length ?? 0;
                  const stepsCount = trace.steps_count ?? 0;

                  return (
                    <tr
                      key={trace.id}
                      className={cn(
                        "transition-colors hover:bg-gray-50/80",
                        selectedIds.has(trace.id) && "bg-blue-50/40"
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedIds.has(trace.id)}
                          onChange={() => toggleOne(trace)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] h-5 px-2 capitalize font-medium",
                                statusBadgeClass(trace.status)
                              )}
                            >
                              {statusLabel(trace.status)}
                            </Badge>
                          </TooltipTrigger>
                          {trace.error_message && (
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              {trace.error_message}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-gray-800 font-medium text-xs">
                          {formatAge(trace.created_at)}
                        </p>
                        <p className="text-gray-400 text-[11px] mt-0.5">
                          {formatTimestamp(trace.created_at)}
                        </p>
                      </td>

                      <td className="px-4 py-3 min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-md">
                          {trace.question}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {trace.model_name && (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                              {trace.model_name}
                            </span>
                          )}
                          {trace.query_type && (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                              {trace.query_type}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            ID: {formatShortId(trace.id)}
                          </span>
                          {toolsCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                              <Wrench className="h-3 w-3" />
                              {toolsCount} Tool{toolsCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {stepsCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                              <Layers className="h-3 w-3" />
                              {stepsCount} Step{stepsCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                        {trace.llm_model}
                      </td>

                      <td className="px-4 py-3 text-gray-700 text-xs tabular-nums whitespace-nowrap">
                        {formatDuration(trace.duration_ms)}
                      </td>

                      <td className="px-4 py-3 text-gray-700 text-xs tabular-nums whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default underline decoration-dotted underline-offset-2">
                              {formatTokens(trace.total_tokens)}
                              {trace.cached_prompt_tokens != null &&
                                trace.cached_prompt_tokens > 0 && (
                                  <span className="ml-1 text-emerald-600">
                                    · {formatTokens(trace.cached_prompt_tokens)} c
                                  </span>
                                )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {formatTokens(trace.prompt_tokens)} prompt
                            {trace.cached_prompt_tokens != null &&
                            trace.cached_prompt_tokens > 0
                              ? ` (${formatTokens(trace.cached_prompt_tokens)} cached)`
                              : ""}{" "}
                            / {formatTokens(trace.completion_tokens)} completion
                          </TooltipContent>
                        </Tooltip>
                      </td>

                      <td className="px-4 py-3 text-gray-700 text-xs tabular-nums whitespace-nowrap">
                        {formatCostUsd(trace.cost_usd)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(trace.id)}
                            title="View trace"
                          >
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(trace.id)}
                            title="Delete trace"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="px-6 py-3 border-t shrink-0 flex justify-end">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={handlePageChange}
            onShowSizeChange={handlePageSizeChange}
            showSizeChanger
            pageSizeOptions={["10", "20", "50", "100"]}
            showTotal={(totalCount, range) =>
              `${range[0]}-${range[1]} of ${totalCount} items`
            }
          />
        </div>
    </div>
  );
};
