import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/utils/roleUtils';
import { OnboardingLayout } from './OnboardingLayout';
import { OnboardingProgress } from './OnboardingProgress';
import { OnboardingInconsistentPage, OnboardingStatusUnavailable } from './OnboardingErrorPage';
import { PasswordStep } from './steps/PasswordStep';
import { OrganizationStep } from './steps/OrganizationStep';
import { ChartStep } from './steps/ChartStep';
import { resolveOnboardingPhase, useOnboardingStatus, useRefreshOnboardingStatus } from './useOnboardingStatus';

/** `/onboarding`: first-run wizard for the Super Admin, or the inconsistent-database page. */
export default function OnboardingPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const query = useOnboardingStatus(user?.id, superAdmin);
  const refreshStatus = useRefreshOnboardingStatus();
  const navigate = useNavigate();
  const finishing = useRef(false);

  const phase = query.data !== undefined ? resolveOnboardingPhase(query.data) : null;

  useEffect(() => {
    if (finishing.current && phase?.kind === 'complete') {
      finishing.current = false;
      toast.success('Setup complete');
      navigate('/', { replace: true });
    }
  }, [phase?.kind, navigate]);

  if (!superAdmin) return <Navigate to="/" replace />;
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

  if (!phase || phase.kind === 'complete') {
    return finishing.current ? <Loading message="Opening the app..." /> : <Navigate to="/" replace />;
  }

  if (phase.kind === 'inconsistent') {
    return (
      <OnboardingLayout>
        <OnboardingInconsistentPage status={phase.status} />
      </OnboardingLayout>
    );
  }

  const finishChart = () => {
    finishing.current = true;
    return refreshStatus();
  };

  return (
    <OnboardingLayout>
      <OnboardingProgress current={phase.step} />
      {phase.step === 'password' && <PasswordStep key="password" onDone={refreshStatus} />}
      {phase.step === 'organization' && <OrganizationStep key="organization" onDone={refreshStatus} />}
      {phase.step === 'chart' && <ChartStep key="chart" status={phase.status} onDone={finishChart} />}
    </OnboardingLayout>
  );
}
