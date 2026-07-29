import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  adminAPI,
  type IndianDemoReconStatus,
  type ResetIndianDemoReconciliationResult,
} from "@/api/superAdminApi";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-right">{value}</span>
    </div>
  );
}

export default function DemoDataManagementPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<IndianDemoReconStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [lastResult, setLastResult] = useState<ResetIndianDemoReconciliationResult | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await adminAPI.getIndianDemoReconStatus();
      setStatus(res.status);
    } catch (err) {
      setStatus(null);
      toast({
        title: "Could not load indian-demo status",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setStatusLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleResetReconciliation = async () => {
    const confirmed = window.confirm(
      "Reset indian-demo reconciliation data?\n\n" +
        "This restores post_demo_* bank lines from seed CSV, clears AI categorization on those lines, " +
        "and deletes payment receipts created by confirm-match.\n\n" +
        "FY journals and master data are not changed. Scope: org_indian_demo only."
    );
    if (!confirmed) return;

    setResetting(true);
    setLastResult(null);
    try {
      const res = await adminAPI.resetIndianDemoReconciliation();
      setLastResult(res.result);
      toast({
        title: "Reconciliation demo reset",
        description: res.message,
      });
      await loadStatus();
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  const canReset =
    Boolean(status?.orgExists) && Boolean(status?.checkingAccountExists) && !resetting;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo Data Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Super Admin tools for restoring demo use-case data. Currently scoped to{" "}
          <code className="text-xs">org_indian_demo</code> only.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Indian demo status</CardTitle>
            <CardDescription>
              Live counts for reconciliation / categorization seed lines (
              <code className="text-xs">post_demo_*</code>).
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadStatus()}
            disabled={statusLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {statusLoading && !status ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !status?.orgExists ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">Indian demo org not found</p>
              <p className="mt-1 text-muted-foreground">
                Seed it via Tenant Administration (demo data only) or{" "}
                <code className="text-xs">
                  node setup-db.js --demo-data-only --demo-data=indian-demo --skip-tests
                </code>
                .
              </p>
            </div>
          ) : (
            <div className="divide-y">
              <StatusRow label="Org" value={`${status.orgName} (${status.orgId})`} />
              <StatusRow
                label="Checking account (1102)"
                value={status.checkingAccountExists ? "Present" : "Missing"}
              />
              <StatusRow label="Recon demo postings" value={status.reconPostingCount} />
              <StatusRow label="Matched" value={status.matchedCount} />
              <StatusRow label="Unmatched" value={status.unmatchedCount} />
              <StatusRow label="AI-categorized" value={status.aiCategorizedCount} />
              <StatusRow
                label="Confirm-created receipts linked"
                value={status.confirmCreatedReceiptCount}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset reconciliation &amp; categorization</CardTitle>
          <CardDescription>
            Restores bank statement demo lines used for match / categorize demos. Deletes receipts
            created when confirming matches; keeps seeded <code className="text-xs">payr_demo_*</code>{" "}
            receipts. Does not touch FY journals or other orgs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-muted-foreground">
              Safe for production demo orgs: only <code className="text-xs">org_indian_demo</code>{" "}
              <code className="text-xs">post_demo_*</code> rows and confirm-created receipts are
              changed.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => void handleResetReconciliation()}
            disabled={!canReset}
          >
            <RotateCcw className={`mr-2 h-4 w-4 ${resetting ? "animate-spin" : ""}`} />
            {resetting ? "Resetting…" : "Reset recon / categorization / confirm receipts"}
          </Button>

          {lastResult && (
            <p className="text-sm text-muted-foreground">
              Last run: deleted {lastResult.deletedPostings} posting(s),{" "}
              {lastResult.deletedConfirmReceipts} confirm receipt(s); reloaded{" "}
              {lastResult.reloadedPostings}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Also available elsewhere</CardTitle>
          <CardDescription>
            Broader tenant ops stay on Tenant Administration; CLI covers org wipe and full posting
            reset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Tenant Administration</span> — apply COA,
            sync metadata, seed payment terms, onboard a tenant, full / demo-data-only{" "}
            <code className="text-xs">setup-db</code> reset.
          </p>
          <p>
            <span className="font-medium text-foreground">CLI</span> —{" "}
            <code className="text-xs">remove-tenant-data</code> (drop org),{" "}
            <code className="text-xs">--reset-postings-full</code> (all indian-demo journals),{" "}
            <code className="text-xs">--reset-transactions</code> (global AI + agent wipe).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
