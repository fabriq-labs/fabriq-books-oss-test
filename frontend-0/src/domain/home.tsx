import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { viewAPI, workflowManagementAPI } from "@/api/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HomeCard {
  label: string;
  to: string;
  count: number;
  sample: string;
}

const SOURCES: Array<{
  label: string;
  to: string;
  load: () => Promise<unknown>;
  sampleOf: (row: Record<string, unknown>) => string;
}> = [
  {
    label: "Users",
    to: "/settings/users",
    load: () => viewAPI.getAll("user", "user_view", 1, 100),
    sampleOf: (row) => String(row.name || row.email || ""),
  },
  {
    label: "Roles",
    to: "/settings/roles",
    load: () => viewAPI.getAll("role", "role_view", 1, 100),
    sampleOf: (row) => String(row.name || ""),
  },
  {
    label: "Views",
    to: "/settings/views",
    load: () => viewAPI.getAll("view", "view", 1, 100),
    sampleOf: (row) => String(row.name || ""),
  },
  {
    label: "Permissions",
    to: "/settings/permissions",
    load: () => viewAPI.getAll("permission", "permission_view", 1, 100),
    sampleOf: (row) => String(row.field_name || ""),
  },
  {
    label: "Currencies",
    to: "/accounting/currency",
    load: () => viewAPI.getAll("currency", "currency_view", 1, 100),
    sampleOf: (row) => String(row.code || row.name || ""),
  },
  {
    label: "Chart of Accounts",
    to: "/accounting/accounts",
    load: () => viewAPI.getAll("account", "account_view", 1, 100),
    sampleOf: (row) => String(row.name || row.code || ""),
  },
  {
    label: "Transactions",
    to: "/accounting/transactions",
    load: () => viewAPI.getAll("posting", "posting_view", 1, 100),
    sampleOf: (row) => String(row.description || row.name || ""),
  },
  {
    label: "Workflows",
    to: "/settings/workflows",
    load: () => workflowManagementAPI.getFlows(),
    sampleOf: (row) => String(row.name || ""),
  },
];

function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

/**
 * Default screen at `/`.
 * A domain replaces this file to make its own page the home screen.
 * See docs/kernel/BUILDING_A_DOMAIN.md.
 */
export function DomainHome() {
  const [cards, setCards] = useState<HomeCard[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all(SOURCES.map(async (source) => {
      try {
        const rows = rowsOf(await source.load());
        return {
          label: source.label,
          to: source.to,
          count: rows.length,
          sample: rows[0] ? source.sampleOf(rows[0]) : "None yet",
        };
      } catch (err) {
        return {
          label: source.label,
          to: source.to,
          count: 0,
          sample: err instanceof Error ? err.message : "Could not load",
        };
      }
    }))
      .then((loaded) => { if (!cancelled) setCards(loaded); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the dashboard"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Chart of accounts, transactions, and organization setup.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} to={card.to}>
            <Card className="hover:border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-primary">{card.count}</p>
                <p className="text-sm text-muted-foreground">{card.sample}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
