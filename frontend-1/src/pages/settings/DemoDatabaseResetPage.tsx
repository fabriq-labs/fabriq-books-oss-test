import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminAPI, type DemoDataOption } from "@/api/api";
import { AlertTriangle } from "lucide-react";

const DEMO_OPTIONS: { value: DemoDataOption; label: string; description: string }[] = [
  {
    value: "indian-demo",
    label: "Indian demo",
    description: "₹ INR — Mumbai/Bangalore companies (setup-db choice 1)",
  },
  {
    value: "us-ca-demo",
    label: "US-CA demo",
    description: "$ USD — San Francisco tech companies (choice 2)",
  },
  {
    value: "perfin-demo",
    label: "Personal finance demo",
    description: "Personal finance dataset (choice 3)",
  },
  {
    value: "both",
    label: "Both Indian and US-CA",
    description: "Runs Indian then US-CA loaders (choice 4)",
  },
  {
    value: "nri",
    label: "NRI personal finance",
    description: "CAD/INR — Canada and India (choice 5)",
  },
];

export default function DemoDatabaseResetPage() {
  const { toast } = useToast();
  const [demoData, setDemoData] = useState<DemoDataOption>("indian-demo");
  const [runTests, setRunTests] = useState(false);
  const [demoDataOnly, setDemoDataOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleReset = async () => {
    setSubmitting(true);
    try {
      const res = await adminAPI.demoDatabaseReset({
        demoData,
        runTests,
        demoDataOnly,
      });
      toast({
        title: "Reset started",
        description: res.message,
      });
    } catch (err) {
      toast({
        title: "Could not start reset",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Demo database reset</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Runs <code className="text-xs bg-muted px-1 rounded">setup-db.js</code> on the server with the same
          flags as the CLI: <code className="text-xs">--demo-data=…</code>, optional{" "}
          <code className="text-xs">--demo-data-only</code>, and optional{" "}
          <code className="text-xs">--skip-tests</code>. Output goes to the backend process logs only.
        </p>
      </div>

      <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium text-destructive">Destructive operation</p>
          <p className="text-muted-foreground">
            Unless you enable &quot;Demo data only&quot;, this resets schema and data for{" "}
            <code className="text-xs">DATABASE_URL</code>. Production may require{" "}
            <code className="text-xs">ALLOW_DEMO_RESET_API=true</code> on the server.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demo data profile</CardTitle>
          <CardDescription>
            Passed as <code className="text-xs">--demo-data=</code> (one of the five demo seeds; there is no
            &quot;skip&quot; path here).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={demoData} onValueChange={(v) => setDemoData(v as DemoDataOption)}>
            {DEMO_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-start space-x-3 rounded-md border p-3">
                <RadioGroupItem value={opt.value} id={opt.value} className="mt-1" />
                <div className="grid gap-1 flex-1">
                  <Label htmlFor={opt.value} className="font-medium cursor-pointer">
                    {opt.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup script options</CardTitle>
          <CardDescription>
            Same switches as <code className="text-xs">node setup-db.js</code> (see repo{" "}
            <code className="text-xs">backend/setup-db.js</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="run-tests" className="text-base">
                Run tests after setup
              </Label>
              <p className="text-xs text-muted-foreground">
                Off by default: passes <code className="text-xs">--skip-tests</code>. Turn on to run setup-db
                Step 5: <code className="text-xs">npm test -- src/__tests__</code>.
              </p>
            </div>
            <Switch id="run-tests" checked={runTests} onCheckedChange={setRunTests} />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="demo-data-only" className="text-base">
                Demo data only
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, adds <code className="text-xs">--demo-data-only</code>: skips full DB reset / metadata
                / workflows and only runs the demo seed for the profile above (plus prisma generate in that
                mode).
              </p>
            </div>
            <Switch id="demo-data-only" checked={demoDataOnly} onCheckedChange={setDemoDataOnly} />
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="destructive" onClick={handleReset} disabled={submitting}>
              {submitting ? "Starting…" : "Run setup"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
