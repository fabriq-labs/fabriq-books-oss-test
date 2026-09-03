import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { adminAPI, type SyncMetadataTarget } from "@/api/api";
import { ChevronDown } from "lucide-react";
import { DemoDatabaseResetSection } from "./DemoDatabaseResetSection";
import { formatSyncMetadataStats, SyncMetadataModal } from "./SyncMetadataModal";

export default function DeveloperOptionsPage() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [lastStats, setLastStats] = useState<string | null>(null);

  const handleSyncMetadata = async (targets: SyncMetadataTarget[]) => {
    setSyncing(true);
    setLastStats(null);
    try {
      const res = await adminAPI.devOptionsSyncMetadata(targets);
      setLastStats(formatSyncMetadataStats(res.stats, targets));
      toast({
        title: "Metadata synced",
        description: res.message,
      });
      setSyncModalOpen(false);
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

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Developer options</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Super Admin tools that run server-side scripts against <code className="text-xs bg-muted px-1 rounded">DATABASE_URL</code>.
          In production, enable <code className="text-xs">ALLOW_DEV_OPTIONS_API=true</code> for metadata sync.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync metadata from repo</CardTitle>
          <CardDescription>
            Choose which metadata to upsert from <code className="text-xs">backend/prisma/</code> into this
            database: views, prompt templates, agent templates, currencies, and agent model tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => setSyncModalOpen(true)} disabled={syncing}>
            {syncing ? "Syncing…" : "Choose what to sync…"}
          </Button>
          <SyncMetadataModal
            open={syncModalOpen}
            syncing={syncing}
            onOpenChange={setSyncModalOpen}
            onConfirm={handleSyncMetadata}
          />
          {lastStats && (
            <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {lastStats}
            </p>
          )}
        </CardContent>
      </Card>

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
            Runs <code className="text-xs bg-muted px-1 rounded">setup-db.js</code> on the server. Output goes to
            the backend process logs only.
          </p>
          <DemoDatabaseResetSection />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
