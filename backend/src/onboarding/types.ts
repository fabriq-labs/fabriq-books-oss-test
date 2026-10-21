import type { ChartGeo } from '../../lib/gl/seedChart';

export type OnboardingSettings = {
  profileCompleted?: boolean;
  geo?: ChartGeo;
  chartCompleted?: boolean;
  chartSkipped?: boolean;
};

export type InconsistencyReason =
  | 'org_renamed'
  | 'password_changed'
  | 'accounts_exist'
  | 'business_rows_exist'
  | 'onboarding_flags_incomplete';

export type OnboardingStatus = {
  mustChangePassword: boolean;
  profileCompleted: boolean;
  chartCompleted: boolean;
  chartSkipped: boolean;
  inconsistent: boolean;
  inconsistencyReasons: InconsistencyReason[];
  org: {
    id: string;
    name: string;
    slug: string;
    base_currency: string | null;
  };
  geo: ChartGeo | null;
};
