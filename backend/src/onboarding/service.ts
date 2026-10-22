import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import { parseChartGeo, seedChartOfAccounts, type ChartGeo } from '../../lib/gl/seedChart';
import logger from '../utils/logger';
import { mergeOnboardingSettings, readOnboardingSettings } from './settings';
import type { InconsistencyReason, OnboardingStatus } from './types';

export const SEED_ADMIN_USER_ID = 'user_kernel_admin';
export const SEED_ORG_ID = 'org_kernel';
export const SEED_ORG_NAME = 'Kernel';
export const SEED_PASSWORD = 'admin123';

async function passwordMatchesSeed(hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(SEED_PASSWORD, hash);
}

async function countBusinessRows(prisma: PrismaClient, orgId: string): Promise<number> {
  const [entities, postings, customers, invoices, suppliers, items] = await Promise.all([
    prisma.entity.count({ where: { org_id: orgId } }).catch(() => 0),
    prisma.posting.count({ where: { org_id: orgId } }).catch(() => 0),
    prisma.customer.count({ where: { org_id: orgId } }).catch(() => 0),
    prisma.invoice.count({ where: { org_id: orgId } }).catch(() => 0),
    prisma.supplier.count({ where: { org_id: orgId } }).catch(() => 0),
    prisma.item_master.count({ where: { org_id: orgId } }).catch(() => 0),
  ]);
  return entities + postings + customers + invoices + suppliers + items;
}

/**
 * Detect databases customized outside the onboarding flow (or before flags existed).
 * Do not infer completion; callers show an error page / CLI failure.
 */
export async function detectOnboardingInconsistency(
  prisma: PrismaClient,
  orgId: string = SEED_ORG_ID
): Promise<{ inconsistent: boolean; reasons: InconsistencyReason[] }> {
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) {
    return { inconsistent: false, reasons: [] };
  }

  const flags = readOnboardingSettings(org.settings);
  const flagsComplete =
    flags.profileCompleted === true && flags.chartCompleted === true;

  if (flagsComplete) {
    return { inconsistent: false, reasons: [] };
  }

  // Mid-wizard is normal: password may already be changed before profile/chart
  // flags exist. Only treat as inconsistent when data looks customized *outside*
  // the wizard while flags are still incomplete.
  const reasons: InconsistencyReason[] = [];

  if (org.name !== SEED_ORG_NAME && flags.profileCompleted !== true) {
    // Renamed without completing the profile step (SQL / old tooling).
    reasons.push('org_renamed');
  }

  const accountCount = await prisma.account.count({ where: { org_id: orgId } }).catch(() => 0);
  if (accountCount > 0 && flags.chartCompleted !== true) {
    reasons.push('accounts_exist');
  }

  const business = await countBusinessRows(prisma, orgId);
  if (business > 0) {
    reasons.push('business_rows_exist');
  }

  if (reasons.length === 0) {
    return { inconsistent: false, reasons: [] };
  }

  reasons.push('onboarding_flags_incomplete');

  logger.error('Onboarding inconsistent database detected', {
    orgId,
    reasons,
    profileCompleted: !!flags.profileCompleted,
    chartCompleted: !!flags.chartCompleted,
  });

  return { inconsistent: true, reasons };
}

export async function getOnboardingStatus(
  prisma: PrismaClient,
  orgId: string,
  options?: { userId?: string }
): Promise<OnboardingStatus> {
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) {
    throw new Error(`Organization ${orgId} not found`);
  }

  const flags = readOnboardingSettings(org.settings);
  const { inconsistent, reasons } = await detectOnboardingInconsistency(prisma, orgId);

  let mustChangePassword = false;
  const userId = options?.userId ?? SEED_ADMIN_USER_ID;
  if (userId === SEED_ADMIN_USER_ID) {
    const admin = await prisma.user.findUnique({
      where: { id: SEED_ADMIN_USER_ID },
      select: { password: true },
    });
    mustChangePassword = !!(admin?.password && (await passwordMatchesSeed(admin.password)));
  }

  return {
    mustChangePassword,
    profileCompleted: flags.profileCompleted === true,
    chartCompleted: flags.chartCompleted === true,
    chartSkipped: flags.chartSkipped === true,
    inconsistent,
    inconsistencyReasons: reasons,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      base_currency: org.base_currency,
    },
    geo: flags.geo ?? null,
  };
}

export async function updateOnboardingOrganization(
  prisma: PrismaClient,
  orgId: string,
  input: { name: string; timezone?: string }
) {
  if (orgId === 'org_system') {
    throw Object.assign(new Error('Cannot update org_system via onboarding'), { status: 400 });
  }
  const name = (input.name || '').trim();
  if (!name) {
    throw Object.assign(new Error('Organization name is required'), { status: 400 });
  }

  const { inconsistent } = await detectOnboardingInconsistency(prisma, orgId);
  if (inconsistent) {
    throw Object.assign(new Error('Database is in an inconsistent onboarding state'), {
      status: 409,
      code: 'ONBOARDING_INCONSISTENT',
    });
  }

  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) {
    throw Object.assign(new Error('Organization not found'), { status: 404 });
  }

  const settings = mergeOnboardingSettings(org.settings, { profileCompleted: true });

  return prisma.org.update({
    where: { id: orgId },
    data: {
      name,
      settings,
      ...(input.timezone !== undefined
        ? { customer_timezone: input.timezone.trim() || null }
        : {}),
    },
  });
}

export async function completeOnboardingChart(
  prisma: PrismaClient,
  orgId: string,
  body: { geo?: string; skip?: boolean }
) {
  if (orgId === 'org_system') {
    throw Object.assign(new Error('Cannot update org_system via onboarding'), { status: 400 });
  }

  const { inconsistent } = await detectOnboardingInconsistency(prisma, orgId);
  if (inconsistent) {
    throw Object.assign(new Error('Database is in an inconsistent onboarding state'), {
      status: 409,
      code: 'ONBOARDING_INCONSISTENT',
    });
  }

  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) {
    throw Object.assign(new Error('Organization not found'), { status: 404 });
  }

  if (body.skip === true) {
    const settings = mergeOnboardingSettings(org.settings, {
      chartCompleted: true,
      chartSkipped: true,
    });
    await prisma.org.update({ where: { id: orgId }, data: { settings } });
    return { skipped: true as const, created: 0, existing: 0, total: 0, currencyCode: null };
  }

  let geo: ChartGeo;
  try {
    geo = parseChartGeo(body.geo);
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { status: 400 });
  }

  const flags = readOnboardingSettings(org.settings);
  const chartSeedCount = await prisma.account
    .count({ where: { org_id: orgId, source_system_id: 'chart_seed' } })
    .catch(() => 0);

  if (chartSeedCount > 0 && flags.geo && flags.geo !== geo) {
    throw Object.assign(
      new Error(`Chart already seeded for geo ${flags.geo}; refusing to switch to ${geo}`),
      { status: 409 }
    );
  }

  const result = await seedChartOfAccounts(geo, orgId);

  const settings = mergeOnboardingSettings(org.settings, {
    geo,
    chartCompleted: true,
    chartSkipped: false,
  });

  await prisma.org.update({
    where: { id: orgId },
    data: {
      settings,
      base_currency: result.currencyCode,
      basecurrency_id: result.currencyId,
    },
  });

  return { skipped: false as const, ...result };
}

/** CLI / auto-setup: refuse to clobber a customized org without onboarding flags. */
export async function assertSafeForKernelReseed(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: SEED_ADMIN_USER_ID } });
  if (!admin) return;

  const { inconsistent, reasons } = await detectOnboardingInconsistency(prisma, SEED_ORG_ID);
  if (inconsistent) {
    const msg =
      `Refusing to re-seed kernel identity: database looks customized without onboarding flags (${reasons.join(', ')}). ` +
      'Fix org.settings.onboarding or restore from backup; do not reset the admin password.';
    logger.error(msg, { reasons });
    throw new Error(msg);
  }
}
