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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Lock } from "lucide-react";

interface MyProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MyProfileModal: React.FC<MyProfileModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { getUserName, getUserEmail } = useUserData();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!open) {
      setRevealedKey(null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFieldError(null);
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

  const handleChangePassword = async () => {
    setPasswordFieldError(null);
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setPasswordFieldError("All password fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFieldError("New password and confirmation do not match.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await userAPI.changePassword({
        currentPassword,
        newPassword,
      });
      toast.success("Password updated. Please sign in again.");
      onOpenChange(false);
      logout();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not change password";
      toast.error(message);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My profile</DialogTitle>
          <DialogDescription>
            {getUserName()} · {getUserEmail()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="h-4 w-4" />
              Change password
            </div>
            <p className="text-xs text-muted-foreground">
              For accounts that use a Fabriq password. After a successful change you
              will be signed out everywhere on this browser.
            </p>
            {passwordFieldError ? (
              <p className="text-sm text-destructive">{passwordFieldError}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="profile-current-password">Current password</Label>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-new-password">New password</Label>
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-confirm-password">Confirm new password</Label>
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleChangePassword}
              disabled={passwordSubmitting}
            >
              {passwordSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              Update password
            </Button>
          </div>

          <div className="border-t pt-4 space-y-3">
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
