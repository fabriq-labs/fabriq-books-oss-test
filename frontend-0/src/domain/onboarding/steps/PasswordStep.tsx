import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { userAPI } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  PASSWORD_POLICY_RULES,
  formatPasswordPolicyMessage,
  getNewPasswordPolicyFailures,
} from '@/lib/passwordPolicy';
import { PasswordInput } from '../PasswordInput';
import { FormError, StepPanel } from '../StepPanel';

interface PasswordStepProps {
  onDone: () => Promise<unknown>;
}

export function PasswordStep({ onDone }: PasswordStepProps) {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const failures = getNewPasswordPolicyFailures(newPassword);
  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  let validationError: string | null = null;
  if (!currentPassword) validationError = 'Enter your current password.';
  else if (failures.length > 0) validationError = formatPasswordPolicyMessage(failures);
  else if (sameAsCurrent) validationError = 'Choose a password that is different from the current one.';
  else if (confirmPassword !== newPassword) validationError = 'The two new passwords do not match.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (validationError) return;

    setSubmitting(true);
    try {
      await userAPI.changePassword({ currentPassword, newPassword });
      toast.success('Password updated');
      await onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StepPanel
      title="Set a new password"
      description="This account still uses the default sign-in password. Replace it before anyone else can use it."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user?.email ?? ''}
          readOnly
          hidden
        />

        <div className="space-y-2">
          <Label htmlFor="onboarding-current-password">Current password</Label>
          <PasswordInput
            id="onboarding-current-password"
            revealLabel="current password"
            autoComplete="current-password"
            autoFocus
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">The password you just signed in with.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-new-password">New password</Label>
          <PasswordInput
            id="onboarding-new-password"
            revealLabel="new password"
            autoComplete="new-password"
            value={newPassword}
            aria-describedby="onboarding-password-rules"
            aria-invalid={submitted && (failures.length > 0 || sameAsCurrent) ? true : undefined}
            className={cn(
              submitted && (failures.length > 0 || sameAsCurrent) && 'border-destructive focus-visible:ring-destructive'
            )}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <ul id="onboarding-password-rules" className="grid gap-1 pt-1 text-xs sm:grid-cols-2">
            {PASSWORD_POLICY_RULES.map((rule) => (
              <RuleLine key={rule.id} met={newPassword.length > 0 && !failures.includes(rule.id)}>
                {rule.label}
              </RuleLine>
            ))}
            <RuleLine met={newPassword.length > 0 && currentPassword.length > 0 && !sameAsCurrent}>
              Different from the current password
            </RuleLine>
          </ul>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-confirm-password">Confirm new password</Label>
          <PasswordInput
            id="onboarding-confirm-password"
            revealLabel="confirmation"
            autoComplete="new-password"
            value={confirmPassword}
            aria-invalid={mismatch ? true : undefined}
            className={cn(mismatch && 'border-destructive focus-visible:ring-destructive')}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {mismatch && (
            <p className="text-xs text-destructive">The two new passwords do not match.</p>
          )}
        </div>

        <FormError message={serverError ?? (submitted ? validationError : null)} />

        <div className="flex justify-end pt-1">
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save password
          </Button>
        </div>
      </form>
    </StepPanel>
  );
}

function RuleLine({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5', met ? 'text-green-700' : 'text-gray-500')}>
      {met ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <span className="mx-[5px] h-1 w-1 shrink-0 rounded-full bg-gray-400" aria-hidden />
      )}
      <span>
        {children}
        <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
      </span>
    </li>
  );
}
