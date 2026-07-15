import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
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

function parseExpiry(symbol: string): string | null {
  const m = symbol.match(/(\d{6})[CP]/);
  if (!m) return null;
  const s = m[1];
  const year = 2000 + parseInt(s.slice(0, 2), 10);
  const month = parseInt(s.slice(2, 4), 10) - 1;
  const day = parseInt(s.slice(4, 6), 10);
  return new Date(year, month, day).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function daysToExpiry(symbol: string): number | null {
  const m = symbol.match(/(\d{6})[CP]/);
  if (!m) return null;
  const s = m[1];
  const expiry = new Date(2000 + parseInt(s.slice(0, 2), 10), parseInt(s.slice(2, 4), 10) - 1, parseInt(s.slice(4, 6), 10));
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000));
}

function fmtNum(v: number | null | undefined, decimals = 4): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
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
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const analysisInitiated = useRef(false);

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

  /* Fetch live quote */
  const fetchQuote = useCallback(async () => {
    if (!row.instrument_id) return;
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

  /* Streaming analysis chat */
  const { messages, append, isLoading, input, setInput } = useChat({
    api: `${import.meta.env.VITE_API_BASE_URL || ""}/api/investments/option-analysis`,
    experimental_prepareRequestBody: ({ messages: msgs }) => ({
      messages: msgs,
      positionContext: row,
      liveQuote: quote,
    }),
  });

  /* Kick off first analysis turn once quote is available */
  useEffect(() => {
    if (analysisInitiated.current) return;
    // Start analysis once quote fetch has completed (success or failure — we proceed either way)
    if (quoteLoading) return;
    analysisInitiated.current = true;
    void append({
      role: "user",
      content: `Analyse this ${row.option_type === "P" ? "short put" : row.option_type === "C" ? "short call" : "option"} position on ${row.underlying_symbol ?? row.symbol}. Is the theta decaying nicely? Any risks I should watch?`,
    });
  }, [quoteLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
