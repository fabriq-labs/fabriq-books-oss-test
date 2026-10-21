import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ONBOARDING_STEPS, OnboardingStep } from './useOnboardingStatus';

export function OnboardingProgress({ current }: { current: OnboardingStep }) {
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Setup progress" className="mb-6">
      <p className="mb-3 text-sm text-gray-500">
        Step {currentIndex + 1} of {ONBOARDING_STEPS.length}
      </p>
      <ol className="flex items-center gap-2 sm:gap-3">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const isLast = index === ONBOARDING_STEPS.length - 1;
          return (
            <li
              key={step.id}
              className={cn('flex items-center gap-2 sm:gap-3', !isLast && 'flex-1')}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done && 'bg-primary-600 text-white',
                  active && 'border-2 border-primary-600 bg-white text-primary-700',
                  !done && !active && 'border border-gray-300 bg-white text-gray-400'
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-sm',
                  active ? 'font-medium text-gray-900' : 'hidden sm:inline',
                  done && 'text-gray-600',
                  !done && !active && 'text-gray-400'
                )}
              >
                {step.label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
              {!isLast && (
                <span
                  aria-hidden
                  className={cn('h-px flex-1', done ? 'bg-primary-300' : 'bg-gray-200')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
