/**
 * completeStep dispatcher for the T1 package playbook. No LLM.
 * Skips when org_rajesh / user_rajesh_menon are missing.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import '../builders';

import prisma from '../../lib/prisma';
import {
  createAgentSession,
  getAgentSession,
} from '../services/SessionService';
import { completeStepTool } from '../tools/sessionTools';
import { buildPinnedPlan, TAX_PACKAGE_KIND, TAX_PACKAGE_TEMPLATE_ID } from '../taxPackage/constants';
import { AuthContext } from '../../auth/types';

const ORG_ID = 'org_rajesh';
const USER_ID = 'user_rajesh_menon';

const createdSessionIds: string[] = [];

describe('tax package dispatcher', () => {
  let auth: AuthContext | null = null;

  beforeAll(async () => {
    const [org, user] = await Promise.all([
      prisma.org.findUnique({ where: { id: ORG_ID }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: USER_ID }, select: { id: true, email: true, name: true, org_id: true } }),
    ]);
    if (!org || !user) {
      console.warn('Skipping tax-package dispatcher tests — NRI org/user not seeded');
      return;
    }
    auth = {
      user: {
        id: user.id,
        email: user.email || '',
        name: user.name,
        org_id: user.org_id || ORG_ID,
      },
    } as any;
  });

  afterAll(async () => {
    for (const id of createdSessionIds) {
      await prisma.pending_action.deleteMany({ where: { session_id: id } }).catch(() => undefined);
      await prisma.agent_message.deleteMany({ where: { session_id: id } }).catch(() => undefined);
      await prisma.agent_session.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  test('scan completeStep queues categorise unmatched', async () => {
    if (!auth) return;
    const plan = buildPinnedPlan();
    plan[0].status = 'completed';
    plan[1].status = 'in_progress';
    const session = await createAgentSession({
      org_id: ORG_ID,
      user_id: USER_ID,
      goal: 'Prepare Canadian T1 package for TY 2025 for Meera Patel CPA.',
      goal_model: 'posting',
      template_id: TAX_PACKAGE_TEMPLATE_ID,
      mode: 'supervised',
      status: 'executing',
      plan,
      current_step_index: 1,
      accumulated_context: {
        tax_package_kind: TAX_PACKAGE_KIND,
        tax_year: 2025,
        recipient: 'Meera Patel CPA',
      },
    });
    createdSessionIds.push(session.id);

    const tool = completeStepTool(session.id, auth);
    await (tool as any).execute({
      step_index: 1,
      result_summary: 'Found unmatched lines',
      accumulated_context_update: {
        unmatched_postings: [
          {
            posting_id: 'post_demo_hd',
            description: 'Home Depot Milton — basement suite paint',
            amount: 214.67,
            value_date: '2025-04-12',
            entity: 'canada',
            currency: 'CAD',
            current_account_id: 'acco_x',
            current_account_name: 'Miscellaneous — Canada',
            predicted_account_id: 'acco_5220',
            predicted_account_name: 'Basement rental expenses (T776)',
            confidence: 'medium',
            reason: 'T776 vs personal',
          },
        ],
        unmatched_count: 1,
      },
    });

    const updated = await getAgentSession(session.id);
    expect(updated.status).toBe('awaiting_approval');
    const pending = await prisma.pending_action.findMany({ where: { session_id: session.id } });
    expect(pending).toHaveLength(1);
    expect(pending[0].action_type).toBe('categorize_transaction');
  });

  test('assemble completeStep queues approve_tax_package', async () => {
    if (!auth) return;
    const plan = buildPinnedPlan();
    for (let i = 0; i < 3; i++) plan[i].status = 'completed';
    plan[3].status = 'in_progress';
    const session = await createAgentSession({
      org_id: ORG_ID,
      user_id: USER_ID,
      goal: 'Prepare Canadian T1 package for TY 2025 for Meera Patel CPA.',
      goal_model: 'posting',
      template_id: TAX_PACKAGE_TEMPLATE_ID,
      mode: 'supervised',
      status: 'executing',
      plan,
      current_step_index: 3,
      accumulated_context: {
        tax_package_kind: TAX_PACKAGE_KIND,
        tax_year: 2025,
        recipient: 'Meera Patel CPA',
      },
    });
    createdSessionIds.push(session.id);

    const tool = completeStepTool(session.id, auth);
    await (tool as any).execute({
      step_index: 3,
      result_summary: 'Workpapers assembled',
      accumulated_context_update: {
        workpapers: { canada: { t4_net_salary: [] }, foreign: { nre_interest: [] }, exclusions: [] },
        unmatched_count: 0,
        gaps: [],
      },
    });

    const updated = await getAgentSession(session.id);
    expect(updated.status).toBe('awaiting_approval');
    const pending = await prisma.pending_action.findMany({ where: { session_id: session.id } });
    expect(pending.some((p) => p.action_type === 'approve_tax_package')).toBe(true);
  });

  test('assemble completeStep hydrates workpapers when the LLM omits them', async () => {
    if (!auth) return;
    const plan = buildPinnedPlan();
    for (let i = 0; i < 3; i++) plan[i].status = 'completed';
    plan[3].status = 'in_progress';
    const session = await createAgentSession({
      org_id: ORG_ID,
      user_id: USER_ID,
      goal: 'Prepare Canadian T1 package for TY 2025 for Meera Patel CPA.',
      goal_model: 'posting',
      template_id: TAX_PACKAGE_TEMPLATE_ID,
      mode: 'supervised',
      status: 'executing',
      plan,
      current_step_index: 3,
      accumulated_context: {
        tax_package_kind: TAX_PACKAGE_KIND,
        tax_year: 2025,
        recipient: 'Meera Patel CPA',
        include_foreign: true,
      },
    });
    createdSessionIds.push(session.id);

    const tool = completeStepTool(session.id, auth);
    await (tool as any).execute({
      step_index: 3,
      result_summary: 'Assembled without copying JSON',
    });

    const updated = await getAgentSession(session.id);
    const ctx = (updated.accumulated_context || {}) as Record<string, any>;
    expect(ctx.workpapers?.foreign?.nre_interest).toBeTruthy();
    expect(updated.status).toBe('awaiting_approval');
    const pending = await prisma.pending_action.findMany({ where: { session_id: session.id } });
    expect(pending.some((p) => p.action_type === 'approve_tax_package')).toBe(true);
  });
});
