import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/utils/roleUtils';
import { OnboardingLayout } from './OnboardingLayout';
import { OnboardingStatusUnavailable } from './OnboardingErrorPage';
import { resolveOnboardingPhase, useOnboardingStatus } from './useOnboardingStatus';

export const ONBOARDING_PATH = '/onboarding';

/**
 * Wraps the authenticated shell. A Super Admin whose org still needs first-run
 * setup (or whose database is inconsistent) is sent to `/onboarding` from any
 * deep link. Other users pass straight through.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const query = useOnboardingStatus(user?.id, superAdmin);

  if (!superAdmin) return <>{children}</>;
  if (query.isPending) return <Loading message="Checking setup..." />;

  if (query.isError) {
    return (
      <OnboardingLayout>
        <OnboardingStatusUnavailable
          message={query.error instanceof Error ? query.error.message : 'Request failed'}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </OnboardingLayout>
    );
  }

  if (resolveOnboardingPhase(query.data).kind !== 'complete') {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }

  return <>{children}</>;
}
