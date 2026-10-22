import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { AdminApiError, adminAPI, OnboardingStatus } from '@/api/superAdminApi';

export const ONBOARDING_STATUS_QUERY_KEY = ['admin', 'onboarding-status'] as const;

export const ONBOARDING_STEPS = [
  { id: 'password', label: 'Password' },
  { id: 'organization', label: 'Organization' },
  { id: 'chart', label: 'Chart of accounts' },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]['id'];

export type OnboardingPhase =
  | { kind: 'inconsistent'; status: OnboardingStatus }
  | { kind: 'step'; step: OnboardingStep; status: OnboardingStatus }
  | { kind: 'complete' };

/**
 * `null` status means the server has no onboarding API (404) or this caller may
 * not use it (403); the app treats both as "nothing to onboard".
 */
export function resolveOnboardingPhase(status: OnboardingStatus | null | undefined): OnboardingPhase {
  if (!status) return { kind: 'complete' };
  if (status.inconsistent) return { kind: 'inconsistent', status };
  if (status.mustChangePassword) return { kind: 'step', step: 'password', status };
  if (!status.profileCompleted) return { kind: 'step', step: 'organization', status };
  if (!status.chartCompleted) return { kind: 'step', step: 'chart', status };
  return { kind: 'complete' };
}

function unwrapStatus(body: unknown): OnboardingStatus {
  const maybeWrapped = body as { data?: OnboardingStatus } | null;
  if (maybeWrapped && maybeWrapped.data && typeof maybeWrapped.data === 'object' && 'mustChangePassword' in maybeWrapped.data) {
    return maybeWrapped.data;
  }
  return body as OnboardingStatus;
}

async function fetchOnboardingStatus(): Promise<OnboardingStatus | null> {
  try {
    return unwrapStatus(await adminAPI.getOnboardingStatus());
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 404 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

export function useOnboardingStatus(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...ONBOARDING_STATUS_QUERY_KEY, userId ?? 'anonymous'],
    queryFn: fetchOnboardingStatus,
    enabled: enabled && !!userId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      if (err instanceof AdminApiError && err.status < 500) return false;
      return failureCount < 2;
    },
  });
}

export function useRefreshOnboardingStatus() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY }),
    [queryClient]
  );
}
