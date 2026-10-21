import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { adminAPI } from '@/api/superAdminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { FormError, StepPanel } from '../StepPanel';

const NAME_MAX_LENGTH = 120;

function detectTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function listTimeZones(preferred: string | undefined): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported('timeZone') : [];
  if (preferred && !zones.includes(preferred)) return [preferred, ...zones];
  return zones.length > 0 ? zones : preferred ? [preferred] : [];
}

interface OrganizationStepProps {
  onDone: () => Promise<unknown>;
}

export function OrganizationStep({ onDone }: OrganizationStepProps) {
  const { user, refreshUser } = useAuth();
  const initialTimeZone = user?.org?.customer_timezone || detectTimeZone();
  const timeZones = useMemo(() => listTimeZones(initialTimeZone), [initialTimeZone]);

  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState(initialTimeZone ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameError = trimmed.length === 0 ? 'Enter your organization name.' : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (nameError) return;

    setSubmitting(true);
    try {
      await adminAPI.updateOnboardingOrganization({
        name: trimmed,
        ...(timeZone ? { timezone: timeZone } : {}),
      });
      await refreshUser().catch(() => undefined);
      await onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save the organization');
    } finally {
      setSubmitting(false);
    }
  };

  const showNameError = submitted && !!nameError;

  return (
    <StepPanel
      title="Name your organization"
      description="This is the name that appears on invoices, reports, and across the app."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="onboarding-org-name">Organization name</Label>
          <Input
            id="onboarding-org-name"
            autoFocus
            autoComplete="organization"
            maxLength={NAME_MAX_LENGTH}
            placeholder="e.g. Northwind Trading Ltd"
            value={name}
            aria-invalid={showNameError ? true : undefined}
            aria-describedby={showNameError ? 'onboarding-org-name-error' : undefined}
            className={cn(showNameError && 'border-destructive focus-visible:ring-destructive')}
            onChange={(e) => setName(e.target.value)}
          />
          {showNameError && (
            <p id="onboarding-org-name-error" className="text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>

        {timeZones.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="onboarding-timezone">Time zone</Label>
            <select
              id="onboarding-timezone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {user?.org?.customer_timezone ? 'Used for document dates.' : 'Detected from this browser. Used for document dates.'}
            </p>
          </div>
        )}

        <FormError message={serverError} />

        <div className="flex justify-end pt-1">
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </form>
    </StepPanel>
  );
}
