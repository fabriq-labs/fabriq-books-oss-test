import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useUserData } from "@/hooks/useUserData";
import {
  adminAPI,
  type CoaTemplate,
  type OnboardTenantPayload,
  type SeedModelName,
  type SeedProfile,
} from "@/api/superAdminApi";
import { viewAPI } from "@/api/metadataApi";
import { v4 as uuidv4 } from "uuid";
import { DemoDatabaseResetSection } from "./DemoDatabaseResetSection";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Plus,
  Trash2,
  Building2,
  Users,
} from "lucide-react";

// ── COA template options ───────────────────────────────────────────────────────

const COA_TEMPLATES: { value: CoaTemplate; label: string; currency: string }[] = [
  { value: "indian", label: "Indian (INR)", currency: "INR" },
  { value: "us-ca", label: "US / Canada (USD)", currency: "USD" },
  { value: "perfin", label: "Personal Finance (USD)", currency: "USD" },
  { value: "nri-india", label: "NRI — India (INR)", currency: "INR" },
  { value: "nri-canada", label: "NRI — Canada (CAD)", currency: "CAD" },
];

// Extension path: add more models/profiles here after backend seeders are wired.
const SEED_MODEL_OPTIONS: { value: SeedModelName; label: string }[] = [
  { value: "payment_terms", label: "Payment Terms" },
];

const SEED_PROFILE_OPTIONS: { value: SeedProfile; label: string }[] = [
  { value: "indian-demo", label: "Indian demo" },
];

// ── Tenant Onboarding Wizard (lifted from TenantOnboardingPage) ───────────────

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  password: string;
}

const initialUserRow = (): AdminUserRow => ({
  id: uuidv4(),
  email: "",
  name: "",
  password: "",
});

function TenantOnboardingWizard({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([initialUserRow()]);
  const [submitting, setSubmitting] = useState(false);

  const slugFromName = (name: string) =>
    name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const handleNameChange = (value: string) => {
    setTenantName(value);
    if (!tenantSlug || tenantSlug === slugFromName(tenantName)) {
      setTenantSlug(slugFromName(value));
    }
  };

  const addAdminUser = () => setAdminUsers((prev) => [...prev, initialUserRow()]);
  const removeAdminUser = (id: string) => {
    if (adminUsers.length <= 1) return;
    setAdminUsers((prev) => prev.filter((u) => u.id !== id));
  };
  const updateAdminUser = (id: string, field: keyof AdminUserRow, value: string) => {
    setAdminUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)));
  };

  const step1Valid = tenantName.trim() && tenantSlug.trim();
  const step2Valid = adminUsers.every((u) => u.email.trim() && u.password) && adminUsers.length >= 1;

  const handleSubmit = async () => {
    if (!step1Valid || !step2Valid) return;
    setSubmitting(true);
    try {
      const payload: OnboardTenantPayload = {
        tenant: {
          name: tenantName.trim(),
          slug: tenantSlug.trim().toLowerCase().replace(/\s+/g, "-"),
        },
        adminUsers: adminUsers.map((u) => ({
          email: u.email.trim(),
          name: u.name.trim() || undefined,
          password: u.password,
        })),
      };
      await adminAPI.onboardTenant(payload);
      toast({
        title: "Tenant created",
        description: `"${tenantName}" is ready. Admin users can log in and complete setup.`,
      });
      setStep(0);
      setTenantName("");
      setTenantSlug("");
      setAdminUsers([initialUserRow()]);
      onSuccess();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create tenant",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        <button
          type="button"
          onClick={() => setStep(0)}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
            step === 0 ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          <Building2 className="h-4 w-4" /> Tenant
        </button>
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
            step === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          <Users className="h-4 w-4" /> Admin users
        </button>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Name</Label>
            <Input
              id="tenant-name"
              value={tenantName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-slug">Slug</Label>
            <Input
              id="tenant-slug"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="acme-corp"
            />
            <p className="text-xs text-muted-foreground">URL-friendly identifier; must be unique.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!step1Valid}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {adminUsers.map((u) => (
            <div key={u.id} className="flex flex-wrap gap-3 items-end p-3 border rounded-lg">
              <div className="flex-1 min-w-[180px] space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={u.email}
                  onChange={(e) => updateAdminUser(u.id, "email", e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="flex-1 min-w-[140px] space-y-2">
                <Label>Name</Label>
                <Input
                  value={u.name}
                  onChange={(e) => updateAdminUser(u.id, "name", e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="flex-1 min-w-[140px] space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={u.password}
                  onChange={(e) => updateAdminUser(u.id, "password", e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAdminUser(u.id)}
                disabled={adminUsers.length <= 1}
                title="Remove user"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addAdminUser} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add another admin
          </Button>
          <div className="flex justify-between pt-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSubmit} disabled={!step2Valid || submitting}>
              {submitting ? "Creating…" : "Create tenant"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TenantAdministrationPage() {
  const { toast } = useToast();
  const { user } = useUserData();

  // Section 2 — Chart of Accounts
  const [entities, setEntities] = useState<any[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<CoaTemplate | "">("");
  const [applyingCoa, setApplyingCoa] = useState(false);
  const [coaResult, setCoaResult] = useState<{ created: number; existing: number; total: number } | null>(null);

  // Section 3 — Metadata sync
  const [syncing, setSyncing] = useState(false);
  const [lastSyncStats, setLastSyncStats] = useState<string | null>(null);

  // Section 4 — Targeted model seed
  const [seedEntityId, setSeedEntityId] = useState("");
  const [seedModel, setSeedModel] = useState<SeedModelName | "">("");
  const [seedProfile, setSeedProfile] = useState<SeedProfile | "">("");
  const [seedingModelData, setSeedingModelData] = useState(false);
  const [seedModelResult, setSeedModelResult] = useState<{
    created: number;
    updated: number;
    total: number;
  } | null>(null);

  // Section 5 — Onboard New Tenant
  const [onboardOpen, setOnboardOpen] = useState(false);

  // Section 6 — Danger Zone
  const [dangerOpen, setDangerOpen] = useState(false);

  // Fetch entities for current org
  useEffect(() => {
    if (!user?.org_id) return;
    let cancelled = false;
    (async () => {
      setEntitiesLoading(true);
      try {
        const res: any = await viewAPI.search(
          "entity",
          "entity_view",
          1,
          500,
          undefined,
          { org_id: { eq: user.org_id } },
          {}
        );
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setEntities(list);
      } catch {
        if (!cancelled) setEntities([]);
      } finally {
        if (!cancelled) setEntitiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.org_id]);

  const handleApplyCoa = async () => {
    if (!selectedEntityId || !selectedTemplate) return;
    setApplyingCoa(true);
    setCoaResult(null);
    try {
      const res = await adminAPI.setupChartOfAccounts({
        entityId: selectedEntityId,
        coaTemplate: selectedTemplate as CoaTemplate,
      });
      setCoaResult(res.counts);
      toast({
        title: "Chart of accounts applied",
        description: `${res.counts.created} accounts created, ${res.counts.existing} already existed.`,
      });
    } catch (err) {
      toast({
        title: "Failed to apply chart of accounts",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setApplyingCoa(false);
    }
  };

  const handleSyncMetadata = async () => {
    setSyncing(true);
    setLastSyncStats(null);
    try {
      const res = await adminAPI.devOptionsSyncMetadata();
      const v = res.stats.views;
      const p = res.stats.promptTemplates;
      const summary = `Views: ${v.created} created, ${v.updated} updated, ${v.errors} errors. Prompts: ${p.created} created, ${p.updated} updated, ${p.errors} errors. Agent templates: ${res.agentTemplatesSeeded ? "seeded" : "skipped"}.`;
      setLastSyncStats(summary);
      toast({ title: "Metadata synced", description: res.message });
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const selectedTemplateMeta = COA_TEMPLATES.find((t) => t.value === selectedTemplate);

  const handleSeedModelData = async () => {
    if (!seedEntityId || !seedModel || !seedProfile) return;
    setSeedingModelData(true);
    setSeedModelResult(null);
    try {
      const res = await adminAPI.seedModelData({
        entityId: seedEntityId,
        model: seedModel,
        profile: seedProfile,
      });
      setSeedModelResult(res.counts);
      toast({
        title: "Model data seeded",
        description: `${res.counts.created} created, ${res.counts.updated} updated.`,
      });
    } catch (err) {
      toast({
        title: "Failed to seed model data",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSeedingModelData(false);
    }
  };

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Tenant Administration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Super Admin tools for setting up and maintaining this tenant's data and configuration.
        </p>
      </div>

      {/* Section 1 — Tenant Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Current tenant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24">Name</span>
            <span className="font-medium">{user?.org?.name ?? "—"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24">Org ID</span>
            <span className="font-mono text-xs">{user?.org_id ?? "—"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24">Entities</span>
            <span>{entitiesLoading ? "Loading…" : entities.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Chart of Accounts Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Chart of accounts setup</CardTitle>
          <CardDescription>
            Load a standard chart of accounts for a legal entity. Existing accounts are preserved — only missing ones are added.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Legal entity</Label>
            {entitiesLoading ? (
              <p className="text-sm text-muted-foreground">Loading entities…</p>
            ) : entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No legal entities found. Create one in Masters → Organization first.
              </p>
            ) : (
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a legal entity…" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.organization_name || e.legal_name || e.id}
                      {e.legal_name && e.organization_name !== e.legal_name && (
                        <span className="text-muted-foreground ml-1">({e.legal_name})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>COA template</Label>
            <Select
              value={selectedTemplate}
              onValueChange={(v) => setSelectedTemplate(v as CoaTemplate)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template…" />
              </SelectTrigger>
              <SelectContent>
                {COA_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplateMeta && (
              <p className="text-xs text-muted-foreground">
                Currency: <span className="font-medium">{selectedTemplateMeta.currency}</span>
              </p>
            )}
          </div>

          <Button
            onClick={handleApplyCoa}
            disabled={!selectedEntityId || !selectedTemplate || applyingCoa || entities.length === 0}
          >
            {applyingCoa ? "Applying…" : "Apply chart of accounts"}
          </Button>

          {coaResult && (
            <p className="text-sm rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {coaResult.created} accounts created · {coaResult.existing} already existed · {coaResult.total} total
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Metadata & Templates Sync */}
      <Card>
        <CardHeader>
          <CardTitle>Sync metadata &amp; templates</CardTitle>
          <CardDescription>
            Syncs views, prompt templates, currencies, and agent templates from the backend repo. Safe to repeat — uses upserts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleSyncMetadata} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync views, prompts & agent templates"}
          </Button>
          {lastSyncStats && (
            <p className="text-sm rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {lastSyncStats}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 4 — Seed Model Data */}
      <Card>
        <CardHeader>
          <CardTitle>Seed model data</CardTitle>
          <CardDescription>
            Seed one model for a selected legal entity using a profile template. Currently supports Payment Terms with Indian demo profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Legal entity</Label>
            {entitiesLoading ? (
              <p className="text-sm text-muted-foreground">Loading entities…</p>
            ) : entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No legal entities found. Create one in Masters → Organization first.
              </p>
            ) : (
              <Select value={seedEntityId} onValueChange={setSeedEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a legal entity…" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.organization_name || e.legal_name || e.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={seedModel} onValueChange={(value) => setSeedModel(value as SeedModelName)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model…" />
              </SelectTrigger>
              <SelectContent>
                {SEED_MODEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Profile</Label>
            <Select value={seedProfile} onValueChange={(value) => setSeedProfile(value as SeedProfile)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a profile…" />
              </SelectTrigger>
              <SelectContent>
                {SEED_PROFILE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSeedModelData}
            disabled={!seedEntityId || !seedModel || !seedProfile || seedingModelData || entities.length === 0}
          >
            {seedingModelData ? "Seeding…" : "Load seed data"}
          </Button>

          {seedModelResult && (
            <p className="text-sm rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {seedModelResult.created} created · {seedModelResult.updated} updated · {seedModelResult.total} total
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 5 — Onboard New Tenant */}
      <Collapsible open={onboardOpen} onOpenChange={setOnboardOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between gap-2"
            aria-expanded={onboardOpen}
          >
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Onboard a new tenant
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${onboardOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>New tenant</CardTitle>
              <CardDescription>
                Create a new tenant and initial admin users. Note: this creates an entirely separate organisation — not a sub-entity of the current tenant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TenantOnboardingWizard onSuccess={() => setOnboardOpen(false)} />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Section 6 — Danger Zone */}
      <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-between gap-2"
            aria-expanded={dangerOpen}
          >
            <span>Dangerously full reset</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${dangerOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Runs{" "}
            <code className="text-xs bg-muted px-1 rounded">setup-db.js</code> on the server. Output goes to
            the backend process logs only. This will wipe and re-seed the entire database.
          </p>
          <DemoDatabaseResetSection />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
