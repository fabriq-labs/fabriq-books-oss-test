import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import Cookies from "js-cookie";
import { X, RefreshCw, Loader2, ArrowUp, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────────── */

interface TradeLeg {
  trade_id: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
  value_date: string;
}

export interface OpenOptionRow {
  account_id: string;
  account_name: string;
  instrument_id: string;
  /** Holding that owns this open option position — used as llm_trace.record_id. */
  holding_id?: string | null;
  external_symbol_id?: number | null;
  symbol: string;
  instrument_name: string;
  underlying_symbol: string | null;
  quantity: number;
  position_qty: number;
  sale_cost: number;
  acquisition_cost: number;
  profit_loss: number;
  open_leg: TradeLeg | null;
  close_leg: TradeLeg | null;
  trade_date: string;
  underlying_current_price?: number | null;
  option_current_price?: number | null;
  strike_price?: number | null;
  option_type?: "C" | "P" | null;
  unrealized_pnl?: number | null;
  is_covered_call?: boolean;
  strategy?:
    | "covered_call"
    | "naked_short_call"
    | "long_call"
    | "short_put"
    | "long_put"
    | "option";
  underlying_instrument_id?: string | null;
  underlying_holding_id?: string | null;
  underlying_qty?: number | null;
  underlying_average_cost?: number | null;
  underlying_market_value?: number | null;
  shares_needed?: number | null;
  holding_average_cost?: number | null;
  holding_market_value?: number | null;
  underlying_trades?: TradeLeg[];
}

interface LiveQuote {
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
  volatility?: number | null;
  openInterest?: number | null;
  bidPrice?: number | null;
  askPrice?: number | null;
  volume?: number | null;
  lastTradePrice?: number | null;
}

interface Props {
  row: OpenOptionRow;
  currency: string;
  onClose: () => void;
}

/* ── Helpers ─────────────────────────────────────────────── */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse expiry date from an option symbol. Supports OCC-style
 *  `AAPL240119C00150000` (YYMMDD) and Questrade-style
 *  `SPCX17Jul26P135.00` (DDMonYY). */
function parseExpiryDate(symbol: string): Date | null {
  const occ = symbol.match(/(\d{6})[CP]/);
  if (occ) {
    const s = occ[1];
    return new Date(2000 + parseInt(s.slice(0, 2), 10), parseInt(s.slice(2, 4), 10) - 1, parseInt(s.slice(4, 6), 10));
  }
  const qt = symbol.match(/(\d{1,2})([A-Za-z]{3})(\d{2})[CP]/);
  if (qt) {
    const month = MONTHS[qt[2].toLowerCase()];
    if (month === undefined) return null;
    return new Date(2000 + parseInt(qt[3], 10), month, parseInt(qt[1], 10));
  }
  return null;
}

function parseExpiry(symbol: string): string | null {
  const d = parseExpiryDate(symbol);
  if (!d) return null;
  return d.toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function daysToExpiry(symbol: string): number | null {
  const d = parseExpiryDate(symbol);
  if (!d) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

function fmtNum(v: number | null | undefined, decimals = 4): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

/**
 * Flatten holding + instrument + open trade + underlying stock leg + quote into
 * flat modelContext keys for options_analysis. Always include stock-leg fields
 * when present — not only when is_covered_call — so assignment / P&L math works.
 * Arrays are preformatted as strings because prompt placeholders stringify values.
 */
export function buildModelContext(row: OpenOptionRow, quote: LiveQuote | null): Record<string, string | number | boolean> {
  const ctx: Record<string, string | number | boolean> = {
    symbol: row.symbol,
    instrumentName: row.instrument_name,
    underlyingSymbol: row.underlying_symbol ?? row.symbol,
    optionType: row.option_type === "P" ? "Put" : row.option_type === "C" ? "Call" : "Option",
    positionQty: row.position_qty,
    contracts: Math.abs(row.position_qty),
    accountName: row.account_name,
    accountId: row.account_id,
  };

  if (row.holding_id) ctx.holdingId = row.holding_id;
  if (row.instrument_id) ctx.instrumentId = row.instrument_id;
  if (row.underlying_instrument_id) ctx.underlyingInstrumentId = row.underlying_instrument_id;
  if (row.underlying_holding_id) ctx.underlyingHoldingId = row.underlying_holding_id;

  if (row.strategy) ctx.strategy = row.strategy;
  if (row.is_covered_call) ctx.isCoveredCall = true;

  if (row.strike_price != null) ctx.strike = row.strike_price;
  if (row.holding_average_cost != null) ctx.optionAverageCost = row.holding_average_cost;
  if (row.holding_market_value != null) ctx.optionMarketValue = row.holding_market_value;

  if (row.open_leg) {
    ctx.entryTradeId = row.open_leg.trade_id;
    ctx.entryTradeType = row.open_leg.type;
    ctx.entryDate = row.open_leg.value_date;
    ctx.entryPrice = row.open_leg.price;
    ctx.entryQuantity = row.open_leg.quantity;
    ctx.entryPremiumAmount = row.open_leg.amount;
  }
  if (row.sale_cost != null) ctx.premiumCollected = row.sale_cost;
  if (row.acquisition_cost != null) ctx.premiumPaid = row.acquisition_cost;

  if (row.underlying_current_price != null) ctx.underlyingCurrentPrice = row.underlying_current_price;
  if (row.option_current_price != null) ctx.optionMarkPrice = row.option_current_price;
  if (row.unrealized_pnl != null) ctx.unrealizedPnl = row.unrealized_pnl;

  if (row.underlying_qty != null) ctx.underlyingQty = row.underlying_qty;
  if (row.shares_needed != null) ctx.sharesNeeded = row.shares_needed;
  if (row.underlying_average_cost != null) ctx.underlyingAverageCost = row.underlying_average_cost;
  if (row.underlying_market_value != null) ctx.underlyingMarketValue = row.underlying_market_value;

  if (row.underlying_trades && row.underlying_trades.length > 0) {
    ctx.underlyingTrades = formatUnderlyingTrades(row.underlying_trades);
    ctx.underlyingTradeCount = row.underlying_trades.length;
    const firstLot = row.underlying_trades[0];
    ctx.underlyingEntryDate = firstLot.value_date;
    ctx.underlyingEntryPrice = firstLot.price;
    ctx.underlyingEntryQuantity = firstLot.quantity;
  }

  if (quote) {
    if (quote.delta != null) ctx.delta = quote.delta;
    if (quote.gamma != null) ctx.gamma = quote.gamma;
    if (quote.theta != null) ctx.theta = quote.theta;
    if (quote.vega != null) ctx.vega = quote.vega;
    if (quote.rho != null) ctx.rho = quote.rho;
    if (quote.volatility != null) ctx.impliedVolatility = Number(quote.volatility).toFixed(1);
    if (quote.openInterest != null) ctx.openInterest = quote.openInterest;
    if (quote.bidPrice != null) ctx.bidPrice = quote.bidPrice;
    if (quote.askPrice != null) ctx.askPrice = quote.askPrice;
    if (quote.volume != null) ctx.volume = quote.volume;
  }

  return ctx;
}

const MAX_UNDERLYING_TRADES_IN_CONTEXT = 40;

function trimNum(n: number, decimals: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

export function formatUnderlyingTrades(legs: TradeLeg[]): string {
  const shown = legs.slice(0, MAX_UNDERLYING_TRADES_IN_CONTEXT);
  const lines = shown.map(
    (leg) =>
      `${leg.value_date} ${leg.type} ${trimNum(leg.quantity, 4)} @ ${trimNum(leg.price, 4)} (cash ${trimNum(leg.amount, 2)}; id ${leg.trade_id})`
  );
  if (legs.length > shown.length) {
    lines.push(`… ${legs.length - shown.length} more lot(s) omitted`);
  }
  return lines.join("\n");
}

/** First-turn user message. Must name covered calls explicitly — otherwise Theta treats them as naked shorts. */
export function initialAnalysisPrompt(row: OpenOptionRow): string {
  const underlying = row.underlying_symbol ?? row.symbol;
  if (row.is_covered_call) {
    const contracts = Math.abs(row.position_qty);
    const shareBit =
      row.underlying_qty != null ? ` vs ${row.underlying_qty} long shares` : " vs long underlying shares";
    return `Analyse this covered call on ${underlying} (short ${contracts} call(s)${shareBit}). Treat it as a covered call, not a naked short. Is the theta decaying nicely? Any risks I should watch?`;
  }
  const kind =
    row.strategy === "naked_short_call"
      ? "naked short call"
      : row.option_type === "P"
        ? "short put"
        : row.option_type === "C"
          ? "short call"
          : "option";
  return `Analyse this ${kind} position on ${underlying}. Is the theta decaying nicely? Any risks I should watch?`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

/* ── Sub-components ──────────────────────────────────────── */

function GreekCard({
  label, symbol: sym, value, note, accent,
}: { label: string; symbol?: string; value: string; note?: string; accent?: "green" | "amber" | "blue" | "red" | "neutral" }) {
  const valueColors: Record<string, string> = {
    green: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400",
    neutral: "text-slate-800 dark:text-slate-200",
  };
  const borderColors: Record<string, string> = {
    green: "border-emerald-200 dark:border-emerald-900",
    amber: "border-amber-200 dark:border-amber-900",
    blue: "border-blue-200 dark:border-blue-900",
    red: "border-red-200 dark:border-red-900",
    neutral: "border-slate-200 dark:border-slate-700",
  };
  const color = accent ?? "neutral";
  return (
    <div className={cn("rounded-lg border p-3 bg-slate-50 dark:bg-slate-800/50", borderColors[color])}>
      <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">
        {label}{sym && <span className="ml-1 italic normal-case font-normal">{sym}</span>}
      </div>
      <div className={cn("font-mono text-base font-bold tabular-nums leading-tight", valueColors[color])}>
        {value}
      </div>
      {note && <div className="text-[10px] text-slate-400 mt-0.5">{note}</div>}
    </div>
  );
}

function MetricCard({
  label, value, sub, barFill, barColor, accentValue,
}: {
  label: string;
  value: string;
  sub?: string;
  barFill?: number;
  barColor?: string;
  accentValue?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/50">
      <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">{label}</div>
      <div className={cn("font-mono text-sm font-bold tabular-nums", accentValue ? "" : "text-slate-800 dark:text-slate-200")}>
        {accentValue ? <span className={accentValue}>{value}</span> : value}
      </div>
      {barFill != null && (
        <div className="mt-1.5 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", barColor ?? "bg-emerald-500")} style={{ width: `${Math.min(100, barFill)}%` }} />
        </div>
      )}
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ── Status pills ─────────────────────────────────────────── */

function computeStatusPills(row: OpenOptionRow, quote: LiveQuote | null, dte: number | null) {
  const pills: Array<{ label: string; variant: "green" | "amber" | "red" }> = [];

  const premiumCaptured = row.sale_cost > 0
    ? ((row.sale_cost - (row.option_current_price ?? row.sale_cost) * Math.abs(row.position_qty) * 100) / row.sale_cost) * 100
    : null;

  if (premiumCaptured != null) {
    if (premiumCaptured >= 50) pills.push({ label: `${premiumCaptured.toFixed(0)}% premium captured`, variant: "green" });
    else if (premiumCaptured >= 25) pills.push({ label: `${premiumCaptured.toFixed(0)}% premium captured`, variant: "amber" });
  }

  if (quote?.theta != null) {
    const dailyDecay = Math.abs(quote.theta) * Math.abs(row.position_qty) * 100;
    if (row.position_qty < 0 && quote.theta < 0) {
      pills.push({ label: `Earning $${dailyDecay.toFixed(0)}/day theta`, variant: "green" });
    }
  }

  if (quote?.delta != null) {
    const absDelta = Math.abs(quote.delta);
    if (absDelta < 0.2) pills.push({ label: "Low directional risk", variant: "green" });
    else if (absDelta < 0.4) pills.push({ label: "Moderate delta exposure", variant: "amber" });
    else pills.push({ label: "High delta — near ITM", variant: "red" });
  }

  if (dte != null) {
    if (dte <= 7) pills.push({ label: `${dte} DTE — high gamma zone`, variant: "red" });
    else if (dte <= 21) pills.push({ label: `${dte} DTE — watch gamma`, variant: "amber" });
    else pills.push({ label: `${dte} DTE`, variant: "green" });
  }

  return pills;
}

/* ── Main modal ──────────────────────────────────────────── */

export function OptionPositionDetailModal({ row, currency, onClose }: Props) {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  // Start true so the first LLM turn waits for the Questrade fetch to settle.
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const analysisInitiated = useRef(false);
  const modelContextRef = useRef<Record<string, string | number | boolean>>(
    buildModelContext(row, null)
  );

  const dte = daysToExpiry(row.symbol);
  const expiry = parseExpiry(row.symbol);
  const isShort = row.position_qty < 0;
  const entryPrice = row.open_leg?.price ?? null;
  const markPrice = row.option_current_price ?? null;
  const premiumCapturedPct = entryPrice && markPrice
    ? Math.min(100, Math.max(0, ((entryPrice - markPrice) / entryPrice) * 100))
    : null;
  const breakeven = row.strike_price != null && entryPrice != null
    ? row.option_type === "P"
      ? row.strike_price - entryPrice
      : row.strike_price + entryPrice
    : null;
  const distancePct = breakeven != null && row.underlying_current_price
    ? ((row.underlying_current_price - row.strike_price!) / row.underlying_current_price) * 100
    : null;
  const dailyThetaDollar = quote?.theta != null
    ? Math.abs(quote.theta) * Math.abs(row.position_qty) * 100
    : null;

  /* Keep modelContext fresh for experimental_prepareRequestBody (avoids stale closure). */
  useEffect(() => {
    modelContextRef.current = buildModelContext(row, quote);
  }, [row, quote]);

  /* Fetch live quote */
  const fetchQuote = useCallback(async () => {
    if (!row.instrument_id) {
      setQuoteLoading(false);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetchAPI("/api/investments/option-quote", {
        method: "POST",
        body: JSON.stringify({ instrument_id: row.instrument_id }),
      }) as { quote: LiveQuote | null };
      setQuote(res?.quote ?? null);
    } catch {
      setQuoteError("Could not load live Greeks from Questrade.");
    } finally {
      setQuoteLoading(false);
    }
  }, [row.instrument_id]);

  useEffect(() => { void fetchQuote(); }, [fetchQuote]);

  /*
   * Streaming analysis chat — routed through the shared in-app agent endpoint
   * (/api/agent/chat/stream). First turn waits until quote fetch settles so
   * Greeks are in modelContext. Covered-call / underlying fields come from the
   * options_income row. getOptionChain is available for roll questions.
   */
  const authToken = Cookies.get("__session");
  const { messages, append, isLoading, input, setInput } = useChat({
    api: `${import.meta.env.VITE_API_BASE_URL || ""}/api/agent/chat/stream`,
    headers: authToken
      ? { Accept: "text/event-stream", Authorization: `Bearer ${authToken}` }
      : { Accept: "text/event-stream" },
    onError: (err) => {
      console.error("Option analysis stream error:", err);
    },
    experimental_prepareRequestBody: ({ messages: msgs }) => ({
      messages: msgs,
      context: {
        modelName: "holding",
        viewName: "holding_view",
        recordId: row.holding_id ?? undefined,
        promptTypes: ["options_analysis"],
        modelContext: modelContextRef.current,
      },
    }),
  });

  /* Kick off first analysis turn once quote fetch has settled (success or failure). */
  useEffect(() => {
    if (analysisInitiated.current) return;
    if (quoteLoading) return;
    analysisInitiated.current = true;
    void append({
      role: "user",
      content: initialAnalysisPrompt(row),
    });
  }, [quoteLoading, append, row]);

  /* Auto-scroll chat to bottom */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Keyboard send */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        void append({ role: "user", content: input });
        setInput("");
      }
    }
  };

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      void append({ role: "user", content: input });
      setInput("");
    }
  };

  const statusPills = computeStatusPills(row, quote, dte);
  const showAnalysisSkeleton =
    quoteLoading || (isLoading && messages.filter((m) => m.role === "assistant").length === 0);

  /* Backdrop close */
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-[960px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex flex-col gap-1">
            <div className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {row.symbol}
            </div>
            <div className="flex items-center flex-wrap gap-1.5">
              <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide",
                row.option_type === "P"
                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                  : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800"
              )}>
                {row.option_type === "P" ? "Put" : row.option_type === "C" ? "Call" : "Option"}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                {isShort ? "Short" : "Long"} · {Math.abs(row.position_qty)} contracts
              </span>
              {row.is_covered_call && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800">
                  Covered call
                </span>
              )}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                Open
              </span>
              <span className="font-mono text-[11px] text-slate-400 ml-1">{row.account_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchQuote()}
              disabled={quoteLoading}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
              title="Refresh live quote"
            >
              {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Body: two panels ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT: Data ── */}
          <div className="w-[45%] flex-shrink-0 border-r border-slate-200 dark:border-slate-700 overflow-y-auto p-5 space-y-5">

            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-px bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
              {[
                { label: "Entry price", value: entryPrice != null ? formatCurrency(entryPrice, currency) : "—", sub: "per share" },
                { label: "Mark price", value: markPrice != null ? formatCurrency(markPrice, currency) : "—", sub: "current" },
                {
                  label: "Unrealized P/L",
                  value: row.unrealized_pnl != null ? formatCurrency(row.unrealized_pnl, currency) : "—",
                  sub: premiumCapturedPct != null ? `${premiumCapturedPct.toFixed(0)}% captured` : "",
                  accent: row.unrealized_pnl != null
                    ? row.unrealized_pnl > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    : undefined,
                },
              ].map((cell) => (
                <div key={cell.label} className="bg-slate-50 dark:bg-slate-800 p-3">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{cell.label}</div>
                  <div className={cn("font-mono text-sm font-bold tabular-nums mt-0.5", cell.accent ?? "text-slate-800 dark:text-slate-100")}>
                    {cell.value}
                  </div>
                  {cell.sub && <div className="text-[10px] text-slate-400">{cell.sub}</div>}
                </div>
              ))}
            </div>

            {(row.is_covered_call || row.underlying_qty != null) && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                  <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
                    {row.is_covered_call ? "Covered-call stock leg" : "Underlying stock leg"}
                  </span>
                </div>
                <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <MetricCard
                      label="Shares"
                      value={row.underlying_qty != null ? String(row.underlying_qty) : "—"}
                      sub={row.shares_needed != null ? `Need ${row.shares_needed} to cover` : undefined}
                    />
                    <MetricCard
                      label="Avg cost"
                      value={row.underlying_average_cost != null ? formatCurrency(row.underlying_average_cost, currency) : "—"}
                      sub="per share"
                    />
                    <MetricCard
                      label="Market value"
                      value={row.underlying_market_value != null ? formatCurrency(row.underlying_market_value, currency) : "—"}
                    />
                  </div>
                  {row.underlying_trades && row.underlying_trades.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">
                        Remaining lots
                      </div>
                      <ul className="space-y-0.5 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                        {row.underlying_trades.slice(0, 8).map((lot) => (
                          <li key={lot.trade_id}>
                            {lot.value_date} {lot.type} {lot.quantity} @ {formatCurrency(lot.price, currency)}
                          </li>
                        ))}
                        {row.underlying_trades.length > 8 && (
                          <li className="text-slate-400">
                            … {row.underlying_trades.length - 8} more lot(s)
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Greeks */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", quoteLoading ? "bg-amber-400 animate-pulse" : quote ? "bg-emerald-400" : "bg-slate-300")} />
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
                  Live Greeks · Questrade
                </span>
                {quoteLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              </div>
              {quoteError && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {quoteError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <GreekCard
                  label="Theta" symbol="θ"
                  value={quote?.theta != null ? `${quote.theta < 0 && isShort ? "+" : ""}$${(Math.abs(quote.theta) * (isShort ? 1 : -1)).toFixed(2)}/day` : "—"}
                  note={dailyThetaDollar != null ? `$${dailyThetaDollar.toFixed(0)}/day across position` : undefined}
                  accent={isShort && quote?.theta != null ? "green" : "neutral"}
                />
                <GreekCard
                  label="Delta" symbol="Δ"
                  value={fmtNum(quote?.delta, 3)}
                  note="directional exposure"
                  accent={quote?.delta != null ? (Math.abs(quote.delta) < 0.25 ? "green" : Math.abs(quote.delta) < 0.4 ? "amber" : "red") : "neutral"}
                />
                <GreekCard
                  label="Gamma" symbol="Γ"
                  value={fmtNum(quote?.gamma, 4)}
                  note={dte != null && dte <= 21 ? "elevated — near expiry" : "rate of delta change"}
                  accent={dte != null && dte <= 21 ? "amber" : "neutral"}
                />
                <GreekCard
                  label="Vega" symbol="ν"
                  value={fmtNum(quote?.vega, 3)}
                  note="IV sensitivity"
                  accent="blue"
                />
                <GreekCard
                  label="Rho" symbol="ρ"
                  value={fmtNum(quote?.rho, 3)}
                  note="rate sensitivity"
                />
                <GreekCard
                  label="Implied Vol"
                  value={fmtPct(quote?.volatility)}
                  note="current IV"
                  accent="blue"
                />
              </div>
            </div>

            {/* Market data */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Market</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MetricCard
                  label="Bid / Ask"
                  value={quote?.bidPrice != null && quote.askPrice != null
                    ? `${quote.bidPrice.toFixed(2)} / ${quote.askPrice.toFixed(2)}`
                    : "—"}
                />
                <MetricCard label="Open Interest" value={quote?.openInterest?.toLocaleString() ?? "—"} />
                <MetricCard label="Volume" value={quote?.volume?.toLocaleString() ?? "—"} />
              </div>
            </div>

            {/* Derived metrics */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Position Metrics</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="Days to Expiry"
                  value={dte != null ? `${dte} DTE` : "—"}
                  sub={expiry ?? undefined}
                  barFill={dte != null ? Math.max(0, 100 - (dte / 90) * 100) : undefined}
                  barColor={dte != null && dte <= 7 ? "bg-red-500" : dte != null && dte <= 21 ? "bg-amber-500" : "bg-emerald-500"}
                  accentValue={dte != null && dte <= 21 ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-200"}
                />
                <MetricCard
                  label="Premium Captured"
                  value={premiumCapturedPct != null ? `${premiumCapturedPct.toFixed(0)}%` : "—"}
                  sub={entryPrice != null && markPrice != null ? `${formatCurrency(entryPrice, currency)} → ${formatCurrency(markPrice, currency)}` : undefined}
                  barFill={premiumCapturedPct ?? undefined}
                  barColor="bg-emerald-500"
                  accentValue={premiumCapturedPct != null && premiumCapturedPct >= 50 ? "text-emerald-600 dark:text-emerald-400" : undefined}
                />
                <MetricCard
                  label="Breakeven"
                  value={breakeven != null ? formatCurrency(breakeven, currency) : "—"}
                  sub={row.underlying_current_price != null ? `Underlying: ${formatCurrency(row.underlying_current_price, currency)}` : undefined}
                />
                <MetricCard
                  label="Distance to Strike"
                  value={distancePct != null ? `${distancePct > 0 ? "+" : ""}${distancePct.toFixed(1)}% OTM` : "—"}
                  sub={row.strike_price != null ? `Strike: ${formatCurrency(row.strike_price, currency)}` : undefined}
                  accentValue={distancePct != null && distancePct > 0 ? "text-emerald-600 dark:text-emerald-400" : distancePct != null ? "text-red-600 dark:text-red-400" : undefined}
                />
              </div>
            </div>
          </div>

          {/* ── RIGHT: AI Analysis + Chat ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Analysis area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* AI header */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Position Analysis</span>
                {isLoading && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Streaming" />
                )}
              </div>

              {/* Status pills */}
              {statusPills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {statusPills.map((p) => (
                    <span
                      key={p.label}
                      className={cn(
                        "text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5",
                        p.variant === "green" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
                        p.variant === "amber" && "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
                        p.variant === "red" && "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full",
                        p.variant === "green" && "bg-emerald-500",
                        p.variant === "amber" && "bg-amber-500",
                        p.variant === "red" && "bg-red-500",
                      )} />
                      {p.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Message thread */}
              <div className="space-y-4">
                {showAnalysisSkeleton && (
                  <div className="space-y-3 animate-pulse" aria-hidden>
                    <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                    <p className="text-[11px] text-slate-400 pt-1">
                      {quoteLoading ? "Loading live Greeks…" : "Analysing position…"}
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  if (msg.role === "user") {
                    // Hide the auto-generated first analysis prompt
                    if (i === 0) return null;
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[85%] bg-slate-100 dark:bg-slate-700 rounded-xl rounded-br-sm px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                          {typeof msg.content === "string" ? msg.content : ""}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {typeof msg.content === "string" ? msg.content : ""}
                      {isLoading && i === messages.length - 1 && (
                        <span className="inline-block w-0.5 h-4 bg-emerald-500 align-text-bottom ml-0.5 animate-pulse" />
                      )}
                    </div>
                  );
                })}
                {messages.length === 0 && isLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analysing position…
                  </div>
                )}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" />

            {/* Chat input */}
            <div className="p-4 flex gap-2 items-end flex-shrink-0">
              <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus-within:border-violet-400 dark:focus-within:border-violet-600 transition-colors">
                <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                  {row.symbol}
                </span>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a follow-up about this position…"
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 resize-none leading-snug"
                />
              </div>
              <Button
                size="sm"
                disabled={!input.trim() || isLoading}
                onClick={handleSend}
                className="bg-violet-600 hover:bg-violet-700 text-white h-9 w-9 p-0 flex-shrink-0"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
