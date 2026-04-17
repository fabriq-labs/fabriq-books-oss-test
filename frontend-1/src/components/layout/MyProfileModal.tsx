import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userAPI } from "@/api/api";
import { useUserData } from "@/hooks/useUserData";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";

interface MyProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MyProfileModal: React.FC<MyProfileModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { getUserName, getUserEmail } = useUserData();
  const [loading, setLoading] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRevealedKey(null);
    }
  }, [open]);

  const handleGenerate = async () => {
    setLoading(true);
    setRevealedKey(null);
    try {
      const res = await userAPI.generateApiKey();
      setRevealedKey(res.api_key);
      toast.success("API key created. Copy it now — it will not be shown again.");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>My profile</DialogTitle>
          <DialogDescription>
            {getUserName()} · {getUserEmail()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Use an API key for scripts and integrations. Send it in the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">X-API-Key</code>{" "}
            header. Creating a new key replaces the previous one.
          </div>

          {revealedKey ? (
            <div className="space-y-2">
              <Label htmlFor="api-key-once">Your new API key (copy now)</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key-once"
                  readOnly
                  className="font-mono text-xs"
                  value={revealedKey}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy API key"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            Generate new API key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
