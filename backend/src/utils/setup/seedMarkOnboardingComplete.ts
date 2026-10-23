/**
 * Mark org_kernel first-run onboarding complete without running the wizard.
 *
 * Use after a **dev bootstrap** that already loaded chart / demo data via CLI
 * (`seed:coa`, `seed:books-demo`, …). Tenant onboarding must use the in-app
 * wizard instead — see docs/domain/AGENTS.md.
 *
 *   npm run seed:mark-onboarding-complete
 *   npm run seed:mark-onboarding-complete -- org_kernel us-ca
 */
import prisma from '../../lib/prisma';
import { mergeOnboardingSettings, readOnboardingSettings } from '../../onboarding/settings';

const DEFAULT_ORG = 'org_kernel';
const DEFAULT_GEO = 'us-ca' as const;

async function main() {
  const orgId = process.argv[2] || DEFAULT_ORG;
  const geoArg = process.argv[3];
  const geo =
    geoArg === 'india' || geoArg === 'us-ca' ? geoArg : DEFAULT_GEO;

  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) throw new Error(`Org ${orgId} not found`);

  const prev = readOnboardingSettings(org.settings);
  const settings = mergeOnboardingSettings(org.settings, {
    profileCompleted: true,
    chartCompleted: true,
    chartSkipped: false,
    geo,
  });

  await prisma.org.update({ where: { id: orgId }, data: { settings } });

  console.log(
    `Onboarding marked complete on ${orgId} (geo=${geo}; was profile=${!!prev.profileCompleted} chart=${!!prev.chartCompleted})`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
