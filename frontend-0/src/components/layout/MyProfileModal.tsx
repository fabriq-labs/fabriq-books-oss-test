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
import { Copy, Eye, EyeOff, KeyRound, Loader2, Lock } from "lucide-react";

type PasswordPolicyFailure = "length" | "digit" | "special";

/** New password policy (keep in sync with backend change-password). */
function getNewPasswordPolicyFailures(pw: string): PasswordPolicyFailure[] {
  const failures: PasswordPolicyFailure[] = [];
  if (pw.length < 8) failures.push("length");
  if (!/[0-9]/.test(pw)) failures.push("digit");
  if (!/[^A-Za-z0-9]/.test(pw)) failures.push("special");
  return failures;
}

function joinElegant(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** One readable sentence listing only what still needs to change. */
function formatPasswordPolicyMessage(failures: PasswordPolicyFailure[]): string {
  const has = (f: PasswordPolicyFailure) => failures.includes(f);
  const len = has("length");
  const dig = has("digit");
  const spec = has("special");

  if (len && dig && spec) {
    return "Your new password must be at least 8 characters long, and include a number and a symbol.";
  }
  if (dig && spec && !len) {
    return "Your password must include a number and a symbol.";
  }

  const phrases: Record<PasswordPolicyFailure, string> = {
    length: "be at least 8 characters long",
    digit: "include a number",
    special: "include a symbol",
  };
  const parts = failures.map((f) => phrases[f]);
  return `Your password must ${joinElegant(parts)}.`;
}

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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  /** Shown in red below New password after Update password fails policy check. */
  const [newPasswordPolicyMessage, setNewPasswordPolicyMessage] = useState<
    string | null
  >(null);
  /** Remount password inputs each open so the browser does not reuse login autofill. */
  const [profileFormInstance, setProfileFormInstance] = useState(0);
  /** Prevents autofill into current password until the user focuses the field. */
  const [allowCurrentPasswordInput, setAllowCurrentPasswordInput] =
    useState(false);

  useEffect(() => {
    const resetPasswordFields = () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setNewPasswordPolicyMessage(null);
      setAllowCurrentPasswordInput(false);
    };

    if (open) {
      setProfileFormInstance((n) => n + 1);
      resetPasswordFields();
    } else {
      setRevealedKey(null);
      resetPasswordFields();
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
    setNewPasswordPolicyMessage(null);
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      toast.error("All password fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    const policyFailures = getNewPasswordPolicyFailures(newPassword);
    if (policyFailures.length > 0) {
      setNewPasswordPolicyMessage(formatPasswordPolicyMessage(policyFailures));
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
            <div className="space-y-2">
              <Label htmlFor="profile-current-password">Current password</Label>
              <div className="relative">
                <Input
                  key={`profile-current-${profileFormInstance}`}
                  id="profile-current-password"
                  className="pr-10"
                  type={showCurrentPassword ? "text" : "password"}
                  name={`fabriq-change-current-${profileFormInstance}`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  readOnly={!allowCurrentPasswordInput}
                  value={currentPassword}
                  onFocus={() => setAllowCurrentPasswordInput(true)}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full rounded-l-none text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  aria-label={
                    showCurrentPassword ? "Hide current password" : "Show current password"
                  }
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-new-password">New password</Label>
              <div className="relative">
                <Input
                  key={`profile-new-${profileFormInstance}`}
                  id="profile-new-password"
                  className={
                    newPasswordPolicyMessage
                      ? "border-destructive pr-10 focus-visible:ring-destructive"
                      : "pr-10"
                  }
                  type={showNewPassword ? "text" : "password"}
                  name={`fabriq-change-new-${profileFormInstance}`}
                  autoComplete="new-password"
                  value={newPassword}
                  aria-invalid={newPasswordPolicyMessage ? true : undefined}
                  aria-describedby={
                    newPasswordPolicyMessage
                      ? "profile-new-password-policy"
                      : undefined
                  }
                  onChange={(e) => {
                    setNewPasswordPolicyMessage(null);
                    setNewPassword(e.target.value);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full rounded-l-none text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={
                    showNewPassword ? "Hide new password" : "Show new password"
                  }
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {newPasswordPolicyMessage ? (
                <p
                  id="profile-new-password-policy"
                  role="alert"
                  className="text-sm text-destructive leading-relaxed pt-1"
                >
                  {newPasswordPolicyMessage}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-confirm-password">Confirm new password</Label>
              <div className="relative">
                <Input
                  key={`profile-confirm-${profileFormInstance}`}
                  id="profile-confirm-password"
                  className="pr-10"
                  type={showConfirmPassword ? "text" : "password"}
                  name={`fabriq-change-confirm-${profileFormInstance}`}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full rounded-l-none text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
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
