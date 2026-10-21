import type { OnboardingSettings } from './types';

export function parseOrgSettings(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // leave empty
  }
  return {};
}

export function readOnboardingSettings(raw: string | null | undefined): OnboardingSettings {
  const root = parseOrgSettings(raw);
  const onboarding = root.onboarding;
  if (!onboarding || typeof onboarding !== 'object' || Array.isArray(onboarding)) {
    return {};
  }
  const o = onboarding as Record<string, unknown>;
  const settings: OnboardingSettings = {};
  if (o.profileCompleted === true) settings.profileCompleted = true;
  if (o.chartCompleted === true) settings.chartCompleted = true;
  if (o.chartSkipped === true) settings.chartSkipped = true;
  if (o.geo === 'us-ca' || o.geo === 'india') settings.geo = o.geo;
  return settings;
}

export function mergeOnboardingSettings(
  raw: string | null | undefined,
  patch: OnboardingSettings
): string {
  const root = parseOrgSettings(raw);
  const prev =
    root.onboarding && typeof root.onboarding === 'object' && !Array.isArray(root.onboarding)
      ? { ...(root.onboarding as Record<string, unknown>) }
      : {};
  const next = { ...prev };
  if (patch.profileCompleted !== undefined) next.profileCompleted = patch.profileCompleted;
  if (patch.chartCompleted !== undefined) next.chartCompleted = patch.chartCompleted;
  if (patch.chartSkipped !== undefined) next.chartSkipped = patch.chartSkipped;
  if (patch.geo !== undefined) next.geo = patch.geo;
  return JSON.stringify({ ...root, onboarding: next });
}
