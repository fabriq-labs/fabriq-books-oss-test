import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type {
  DevOptionsSyncMetadataResponse,
  SyncMetadataTarget,
} from "@/api/superAdminApi";

export const SYNC_METADATA_OPTIONS: {
  id: SyncMetadataTarget;
  label: string;
  description: string;
}[] = [
  {
    id: "views",
    label: "Views",
    description: "List and form layouts from prisma/metadata/views (upserts by id / name).",
  },
  {
    id: "promptTemplates",
    label: "Prompt templates",
    description: "LLM prompts including invoice extractor. Needed for PDF discount extraction.",
  },
  {
    id: "agentTemplates",
    label: "Agent templates",
    description: "Workbench skills (Book Transactions, Reconcile, Categorise, tax package, …).",
  },
  {
    id: "currencies",
    label: "Currencies",
    description: "Global currency master (USD, INR, CAD, …). Safe upsert on currency code.",
  },
  {
    id: "agentModelTools",
    label: "Agent model tools",
    description: "Per-model chat tool configs (which tools unified chat may call on each page).",
  },
];

export const ALL_SYNC_METADATA_TARGETS: SyncMetadataTarget[] = SYNC_METADATA_OPTIONS.map(
  (o) => o.id,
);

export function formatSyncMetadataStats(
  stats: DevOptionsSyncMetadataResponse["stats"],
  targets: SyncMetadataTarget[],
): string {
  const selected = new Set(targets);
  const parts: string[] = [];
  if (selected.has("views")) {
    parts.push(
      `Views: ${stats.views.created} created, ${stats.views.updated} updated, ${stats.views.errors} errors`,
    );
  }
  if (selected.has("promptTemplates")) {
    parts.push(
      `Prompts: ${stats.promptTemplates.created} created, ${stats.promptTemplates.updated} updated, ${stats.promptTemplates.errors} errors`,
    );
  }
  if (selected.has("agentTemplates")) {
    parts.push(
      `Agent templates: ${stats.agentTemplates.rowsAffected} rows upserted, ${stats.agentTemplates.errors} errors`,
    );
  }
  if (selected.has("currencies")) {
    parts.push(
      `Currencies: ${stats.currencies.rowsAffected} rows upserted, ${stats.currencies.errors} errors`,
    );
  }
  if (selected.has("agentModelTools")) {
    parts.push(
      `Agent model tools: ${stats.agentModelTools.rowsAffected} rows upserted, ${stats.agentModelTools.errors} errors`,
    );
  }
  return parts.join(". ");
}

interface SyncMetadataModalProps {
  open: boolean;
  syncing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targets: SyncMetadataTarget[]) => void;
}

export function SyncMetadataModal({
  open,
  syncing,
  onOpenChange,
  onConfirm,
}: SyncMetadataModalProps) {
  const [selected, setSelected] = useState<SyncMetadataTarget[]>(ALL_SYNC_METADATA_TARGETS);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = selected.length === ALL_SYNC_METADATA_TARGETS.length;

  const toggle = (id: SyncMetadataTarget, checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        return ALL_SYNC_METADATA_TARGETS.filter((t) => t === id || prev.includes(t));
      }
      return prev.filter((t) => t !== id);
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? [...ALL_SYNC_METADATA_TARGETS] : []);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!syncing) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose metadata to sync</DialogTitle>
          <DialogDescription>
            Only the types you tick are written to this database. Each type is an upsert — existing
            rows are updated, not duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 cursor-pointer">
            <Checkbox
              id="sync-all"
              checked={allSelected ? true : selected.length === 0 ? false : "indeterminate"}
              onCheckedChange={(v) => toggleAll(v === true)}
              disabled={syncing}
            />
            <span className="grid gap-0.5 leading-none">
              <Label htmlFor="sync-all" className="cursor-pointer font-medium">
                Select all
              </Label>
              <span className="text-xs text-muted-foreground">
                Views, prompts, agent templates, currencies, and model tools
              </span>
            </span>
          </label>

          {SYNC_METADATA_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/20"
            >
              <Checkbox
                id={`sync-${opt.id}`}
                checked={selectedSet.has(opt.id)}
                onCheckedChange={(v) => toggle(opt.id, v === true)}
                disabled={syncing}
              />
              <span className="grid gap-0.5 leading-none">
                <Label htmlFor={`sync-${opt.id}`} className="cursor-pointer font-medium">
                  {opt.label}
                </Label>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(selected)}
            disabled={syncing || selected.length === 0}
          >
            {syncing ? "Syncing…" : `Sync ${selected.length} type${selected.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
