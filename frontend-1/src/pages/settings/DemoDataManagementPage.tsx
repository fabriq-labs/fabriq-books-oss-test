import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  adminAPI,
  type IndianDemoReconStatus,
  type LegalEntitySummary,
  type RemoveLegalEntityResult,
  type ResetIndianDemoReconciliationResult,
} from "@/api/superAdminApi";
import { AlertTriangle, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

const INDIAN_DEMO_ORG_ID = "org_indian_demo";

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

  const [entities, setEntities] = useState<LegalEntitySummary[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [preview, setPreview] = useState<RemoveLegalEntityResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [lastDrop, setLastDrop] = useState<RemoveLegalEntityResult | null>(null);

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

  const loadEntities = useCallback(async () => {
    setEntitiesLoading(true);
    try {
      const res = await adminAPI.listLegalEntities(INDIAN_DEMO_ORG_ID);
      setEntities(res.entities);
      setSelectedEntityId((prev) =>
        prev && res.entities.some((e) => e.id === prev) ? prev : ""
      );
    } catch (err) {
      setEntities([]);
      toast({
        title: "Could not load legal entities",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setEntitiesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStatus();
    void loadEntities();
  }, [loadStatus, loadEntities]);

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

  const handlePreviewDrop = async () => {
    if (!selectedEntityId) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await adminAPI.previewDropLegalEntity(selectedEntityId);
      setPreview(res.result);
    } catch (err) {
      toast({
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDropLegalEntity = async () => {
    if (!selectedEntityId) return;
    const selected = entities.find((e) => e.id === selectedEntityId);
    const label = selected
      ? `${selected.organizationName} (${selected.id})`
      : selectedEntityId;

    const confirmed = window.confirm(
      `Drop legal entity ${label}?\n\n` +
        "This permanently deletes invoices, bills, postings, COA accounts, org-structure " +
        "(departments, locations, …), linked sales docs, payment receipts, and the entity row.\n\n" +
        "Tenant org and shared masters (customers, suppliers, items, users) are kept.\n\n" +
        "Type OK in the next prompt to continue."
    );
    if (!confirmed) return;

    const typed = window.prompt(`Type the entity id to confirm:\n${selectedEntityId}`);
    if (typed !== selectedEntityId) {
      toast({
        title: "Drop cancelled",
        description: "Entity id did not match.",
        variant: "destructive",
      });
      return;
    }

    setDropping(true);
    setLastDrop(null);
    try {
      const res = await adminAPI.dropLegalEntity(selectedEntityId);
      setLastDrop(res.result);
      setPreview(null);
      setSelectedEntityId("");
      toast({
        title: "Legal entity dropped",
        description: res.message,
      });
      await Promise.all([loadEntities(), loadStatus()]);
    } catch (err) {
      toast({
        title: "Drop failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setDropping(false);
    }
  };

  const canReset =
    Boolean(status?.orgExists) && Boolean(status?.checkingAccountExists) && !resetting;
  const selectedEntity = entities.find((e) => e.id === selectedEntityId);
  const previewNonZero = preview
    ? Object.entries(preview.counts).filter(([, n]) => n > 0)
    : [];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo Data Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Super Admin tools for demo use-case data. Recon reset is scoped to{" "}
          <code className="text-xs">org_indian_demo</code>; legal-entity drop works per entity under
          that tenant.
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
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Drop legal entity</CardTitle>
            <CardDescription>
              Deletes one legal entity under <code className="text-xs">{INDIAN_DEMO_ORG_ID}</code>{" "}
              and all related invoices, bills, postings, accounts, and org-structure. Shared tenant
              masters are kept.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadEntities()}
            disabled={entitiesLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${entitiesLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-muted-foreground">
              Destructive and irreversible. Prefer dropping a branch entity (e.g. Mumbai / Bangalore
              / US) rather than HQ unless you intend to remove the main demo company.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="legal-entity">Legal entity</Label>
            <Select
              value={selectedEntityId || undefined}
              onValueChange={(v) => {
                setSelectedEntityId(v);
                setPreview(null);
              }}
              disabled={entitiesLoading || entities.length === 0}
            >
              <SelectTrigger id="legal-entity">
                <SelectValue
                  placeholder={
                    entitiesLoading
                      ? "Loading…"
                      : entities.length === 0
                        ? "No legal entities found"
                        : "Select a legal entity"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.organizationName}
                    {e.isHeadquarters ? " (HQ)" : ""} — {e.id} · inv {e.invoiceCount} · post{" "}
                    {e.postingCount} · accts {e.accountCount}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEntity && (
            <div className="divide-y rounded-md border px-3">
              <StatusRow label="Entity" value={selectedEntity.organizationName} />
              <StatusRow label="Id" value={selectedEntity.id} />
              <StatusRow label="Country" value={selectedEntity.country || "—"} />
              <StatusRow label="Invoices" value={selectedEntity.invoiceCount} />
              <StatusRow label="Postings" value={selectedEntity.postingCount} />
              <StatusRow label="Accounts" value={selectedEntity.accountCount} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePreviewDrop()}
              disabled={!selectedEntityId || previewLoading || dropping}
            >
              {previewLoading ? "Previewing…" : "Preview delete counts"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDropLegalEntity()}
              disabled={!selectedEntityId || dropping}
            >
              <Trash2 className={`mr-2 h-4 w-4 ${dropping ? "animate-pulse" : ""}`} />
              {dropping ? "Dropping…" : "Drop legal entity"}
            </Button>
          </div>

          {preview && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">
                Dry run — {preview.total} row(s) would be affected for {preview.entityName}
              </p>
              <div className="max-h-48 overflow-y-auto divide-y">
                {previewNonZero.length === 0 ? (
                  <p className="text-muted-foreground py-1">No related rows found.</p>
                ) : (
                  previewNonZero.map(([name, n]) => (
                    <StatusRow key={name} label={name} value={n} />
                  ))
                )}
              </div>
            </div>
          )}

          {lastDrop && (
            <p className="text-sm text-muted-foreground">
              Last drop: {lastDrop.entityName} ({lastDrop.entityId}) — removed {lastDrop.total}{" "}
              row(s).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Also available elsewhere</CardTitle>
          <CardDescription>
            Broader tenant ops stay on Tenant Administration; CLI covers org wipe and entity wipe.
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
            <code className="text-xs">npm run remove-tenant-data -- --legal-entity=&lt;id&gt; --confirm</code>{" "}
            (entity wipe), or{" "}
            <code className="text-xs">npm run remove-tenant-data -- &lt;org_id&gt; --confirm</code>{" "}
            (full tenant wipe).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
