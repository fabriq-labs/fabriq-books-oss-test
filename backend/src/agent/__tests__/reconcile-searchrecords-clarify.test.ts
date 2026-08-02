/**
 * Reconcile template: searchRecords allowlist + requestClarification input_schema.
 *
 * Run with:
 *   npx jest src/agent/__tests__/reconcile-searchrecords-clarify.test.ts --runInBand
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import prisma from '../../lib/prisma';
import { ToolManager } from '../ToolManager';
import { requestClarificationTool } from '../tools/sessionTools';
import { createAgentSession, getAgentSession, updateAgentSession } from '../services/SessionService';
import { buildTestAuthContext } from './posting-harness-auth';

describe('atpl_reconcile — searchRecords + clarification schema', () => {
  let sessionId: string;
  let auth: Awaited<ReturnType<typeof buildTestAuthContext>>;
  let allowedTools: string[];

  beforeAll(async () => {
    auth = await buildTestAuthContext();

    const template = await prisma.agent_template.findUnique({
      where: { id: 'atpl_reconcile' },
      select: { allowed_tools: true, system_prompt: true },
    });
    expect(template).toBeTruthy();
    allowedTools = template!.allowed_tools || [];

    const session = await createAgentSession({
      org_id: auth.user!.org_id!,
      user_id: auth.user!.id,
      goal: 'reconcile the transactions in checking account',
      goal_model: 'posting',
      template_id: 'atpl_reconcile',
      mode: 'supervised',
    });
    sessionId = session.id;

    await updateAgentSession(sessionId, {
      status: 'executing',
      current_step_index: 0,
      plan: [
        {
          index: 0,
          type: 'query',
          title: 'Find Checking Account',
          description: 'Find account id',
          status: 'in_progress',
          requires_approval: false,
        },
      ],
    });
  }, 60000);

  afterAll(async () => {
    if (sessionId) {
      await prisma.agent_message.deleteMany({ where: { session_id: sessionId } }).catch(() => {});
      await prisma.agent_session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test('template allowlist includes searchRecords and keeps write tools out', () => {
    expect(allowedTools).toContain('searchRecords');
    expect(allowedTools).toContain('analyticsQuery');
    expect(allowedTools).toContain('requestClarification');
    expect(allowedTools).not.toContain('createRecord');
    expect(allowedTools).not.toContain('updateRecord');
    expect(allowedTools).not.toContain('categorizePostings');
  });

  test('template prompt steers account lookup to searchRecords', async () => {
    const template = await prisma.agent_template.findUnique({
      where: { id: 'atpl_reconcile' },
      select: { system_prompt: true },
    });
    const prompt = template!.system_prompt || '';
    expect(prompt).toMatch(/searchRecords on the account model/i);
    expect(prompt).toMatch(/do NOT use analyticsQuery for account discovery/i);
    expect(prompt).toMatch(/Use analyticsQuery to find unreconciled postings/i);
  });

  test('getUnifiedTools exposes searchRecords for reconcile session', async () => {
    const tools = await ToolManager.getInstance().getUnifiedTools(
      'posting',
      auth,
      { modelName: 'posting' },
      sessionId,
      allowedTools
    );
    const names = Object.keys(tools).sort();
    expect(names).toContain('searchRecords');
    expect(names).toContain('analyticsQuery');
    expect(names).toContain('suggestReconciliationMatches');
    expect(names).toContain('requestClarification');
    expect(names).toContain('createPlan');
    expect(names).toContain('completeStep');
    expect(names).not.toContain('createRecord');
    expect(names).not.toContain('updateRecord');
  });

  test('requestClarification persists input_schema options for dropdown UI', async () => {
    const tool = requestClarificationTool(sessionId, auth) as any;
    const result = await tool.execute(
      {
        question: 'Which Checking Account would you like to reconcile?',
        context: { searched_for: 'checking account' },
        input_schema: {
          type: 'single_select',
          options: [
            { id: 'acco_org_indian_demo_1102', label: 'Checking Account (HQ)' },
            { id: 'acco_org_mumbai_branch_1102', label: 'Checking Account (Mumbai Branch)' },
            { id: 'acco_org_bangalore_office_1102', label: 'Checking Account (Bangalore Office)' },
          ],
        },
      },
      {}
    );

    expect(result.success).toBe(true);

    const session = await getAgentSession(sessionId);
    expect(session.status).toBe('awaiting_input');
    const clarification = session.clarification_request as any;
    expect(clarification.question).toMatch(/Checking Account/i);
    expect(clarification.input_schema?.type).toBe('single_select');
    expect(clarification.input_schema?.options).toHaveLength(3);
    expect(clarification.input_schema.options[0]).toEqual({
      id: 'acco_org_indian_demo_1102',
      label: 'Checking Account (HQ)',
    });
  });

  test('requestClarification promotes context.account_ids into input_schema', async () => {
    await updateAgentSession(sessionId, {
      status: 'executing',
      clarification_request: null,
    });

    const tool = requestClarificationTool(sessionId, auth) as any;
    await tool.execute(
      {
        question: 'Pick an account',
        context: {
          searched_for: 'checking',
          account_ids: {
            acco_a: 'Checking Account (HQ)',
            acco_b: 'Checking Account (US Office)',
          },
        },
      },
      {}
    );

    const session = await getAgentSession(sessionId);
    const clarification = session.clarification_request as any;
    expect(clarification.input_schema?.type).toBe('single_select');
    expect(clarification.input_schema?.options).toEqual(
      expect.arrayContaining([
        { id: 'acco_a', label: 'Checking Account (HQ)' },
        { id: 'acco_b', label: 'Checking Account (US Office)' },
      ])
    );
  });
});
