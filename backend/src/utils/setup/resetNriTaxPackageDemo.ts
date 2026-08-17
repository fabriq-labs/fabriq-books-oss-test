/**
 * Reset org_rajesh to the pre tax-package-agent run state:
 * re-seed NRI postings/FX/CoA and delete T1 package sessions.
 *
 * In-process seed only — no setup-db.js, no prisma generate / db push.
 * The OSS image has no npx.
 */
import prisma from '../../lib/prisma';
import { TAX_PACKAGE_TEMPLATE_ID } from '../../agent/taxPackage/constants';
import logger from '../logger';
import { ORG_ID, setupNriDemo } from './setupNriDemo';

export interface NriTaxPackageDemoStatus {
  orgExists: boolean;
  orgId: string;
  orgName: string | null;
  unmatchedCount: number;
  taxPackageSessionCount: number;
  pendingActionCount: number;
}

export interface ResetNriTaxPackageDemoResult {
  orgId: string;
  deletedSessions: number;
  deletedPendingActions: number;
  unmatchedAfter: number;
}

export async function getNriTaxPackageDemoStatus(): Promise<NriTaxPackageDemoStatus> {
  const org = await prisma.org.findUnique({
    where: { id: ORG_ID },
    select: { id: true, name: true },
  });
  if (!org) {
    return {
      orgExists: false,
      orgId: ORG_ID,
      orgName: null,
      unmatchedCount: 0,
      taxPackageSessionCount: 0,
      pendingActionCount: 0,
    };
  }
  const [unmatchedCount, taxPackageSessionCount, pendingActionCount] = await Promise.all([
    prisma.posting.count({
      where: { org_id: ORG_ID, reconciliation_status: 'UNMATCHED' },
    }),
    prisma.agent_session.count({
      where: { org_id: ORG_ID, template_id: TAX_PACKAGE_TEMPLATE_ID },
    }),
    prisma.pending_action.count({
      where: { org_id: ORG_ID, session: { template_id: TAX_PACKAGE_TEMPLATE_ID } },
    }),
  ]);
  return {
    orgExists: true,
    orgId: org.id,
    orgName: org.name,
    unmatchedCount,
    taxPackageSessionCount,
    pendingActionCount,
  };
}

export async function resetNriTaxPackageDemo(): Promise<ResetNriTaxPackageDemoResult> {
  const sessions = await prisma.agent_session.findMany({
    where: { org_id: ORG_ID, template_id: TAX_PACKAGE_TEMPLATE_ID },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const deletedPending = sessionIds.length
    ? await prisma.pending_action.deleteMany({ where: { session_id: { in: sessionIds } } })
    : { count: 0 };

  if (sessionIds.length) {
    await prisma.agent_message.deleteMany({ where: { session_id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.llm_trace.deleteMany({ where: { session_id: { in: sessionIds } } }).catch(() => undefined);
  }

  const deletedSessions = sessionIds.length
    ? await prisma.agent_session.deleteMany({ where: { id: { in: sessionIds } } })
    : { count: 0 };

  await setupNriDemo();

  const unmatchedAfter = await prisma.posting.count({
    where: { org_id: ORG_ID, reconciliation_status: 'UNMATCHED' },
  });

  logger.info('NRI tax package demo reset', {
    deletedSessions: deletedSessions.count,
    deletedPendingActions: deletedPending.count,
    unmatchedAfter,
  });

  return {
    orgId: ORG_ID,
    deletedSessions: deletedSessions.count,
    deletedPendingActions: deletedPending.count,
    unmatchedAfter,
  };
}
