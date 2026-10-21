import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminApiError, adminAPI, OnboardingGeo, OnboardingStatus } from '@/api/superAdminApi';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { FormError, StepPanel } from '../StepPanel';

type ChartChoice = OnboardingGeo | 'skip';

const GEO_OPTIONS: { value: OnboardingGeo; title: string; description: string; currency: string }[] = [
  {
    value: 'us-ca',
    title: 'United States / Canada',
    description: 'Standard chart of 53 accounts. Base currency becomes US dollar.',
    currency: 'USD',
  },
  {
    value: 'india',
    title: 'India',
    description: 'Standard chart of 53 accounts. Base currency becomes Indian rupee.',
    currency: 'INR',
  },
];

interface ChartStepProps {
  status: OnboardingStatus;
  onDone: () => Promise<unknown>;
}

export function ChartStep({ status, onDone }: ChartStepProps) {
  const { refreshUser } = useAuth();
  const [choice, setChoice] = useState<ChartChoice | null>(status.geo ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const currentCurrency = status.org.base_currency || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    setServerError(null);
    setSubmitting(true);
    try {
      await adminAPI.completeOnboardingChart(choice === 'skip' ? { skip: true } : { geo: choice });
      await refreshUser().catch(() => undefined);
      await onDone();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setServerError(
          `${err.message} This organization already has a chart for a different region, so it was left unchanged.`
        );
      } else {
        setServerError(err instanceof Error ? err.message : 'Could not finish setup');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel =
    choice === 'skip' ? 'Finish without a chart' : choice ? 'Create chart and finish' : 'Finish setup';

  return (
    <StepPanel
      title="Choose a chart of accounts"
      description="Start from a standard chart for your region, or skip it and add accounts yourself."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <RadioGroup
          value={choice ?? ''}
          onValueChange={(v) => setChoice(v as ChartChoice)}
          aria-label="Chart of accounts"
          className="gap-0 overflow-hidden rounded-md border divide-y"
          disabled={submitting}
        >
          {GEO_OPTIONS.map((option) => (
            <ChoiceRow
              key={option.value}
              value={option.value}
              selected={choice === option.value}
              title={option.title}
              description={option.description}
              aside={option.currency}
            />
          ))}
          <ChoiceRow
            value="skip"
            selected={choice === 'skip'}
            title="Skip for now"
            description={
              <>
                Start with an empty chart and add accounts later from Chart of Accounts.
                {currentCurrency ? ` Base currency stays ${currentCurrency}.` : ' Base currency is not changed.'}
              </>
            }
            aside={currentCurrency ?? undefined}
          />
        </RadioGroup>

        <FormError message={serverError} />

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
          {choice && choice !== 'skip' && (
            <p className="text-xs text-muted-foreground sm:mr-auto">Creating the chart can take a few seconds.</p>
          )}
          <Button type="submit" className="w-full sm:w-auto" disabled={!choice || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting && choice !== 'skip' ? 'Creating chart…' : submitLabel}
          </Button>
        </div>
      </form>
    </StepPanel>
  );
}

interface ChoiceRowProps {
  value: ChartChoice;
  selected: boolean;
  title: string;
  description: React.ReactNode;
  aside?: string;
}

function ChoiceRow({ value, selected, title, description, aside }: ChoiceRowProps) {
  const id = `onboarding-chart-${value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors',
        selected ? 'bg-gray-50' : 'bg-white hover:bg-gray-50/40'
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="mt-0.5 block text-sm text-gray-500">{description}</span>
      </span>
      {aside && <span className="shrink-0 pt-0.5 text-xs font-medium tabular-nums text-gray-500">{aside}</span>}
    </label>
  );
}
