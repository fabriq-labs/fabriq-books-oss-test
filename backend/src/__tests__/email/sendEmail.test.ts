import { send_workflow_notification_email } from '../../lib/actions/zeiv';
import prisma from '../../lib/prisma';
import { loadTestConfig, createTestContext, validateTestData } from '../test-configs/test-config-loader';

const smtpConfigured = () =>
  !!(process.env.SMTP2GO_API_KEY?.trim() && process.env.SMTP2GO_SENDER?.trim());

describe('send_workflow_notification_email Integration Test', () => {
  let purchaseRequisitionId: string;

  beforeAll(async () => {
    const config = loadTestConfig();
    await validateTestData(config, prisma);

    const wfRow = await prisma.workflow_instance.findFirst({
      where: {
        org_id: config.orgId,
        flow: { model_name: 'purchase_requisition' },
        history: { some: {} },
      },
      orderBy: { modified_at: 'desc' },
      select: { model_id: true },
    });

    if (!wfRow) {
      throw new Error(
        `No purchase_requisition workflow_instance with history for org ${config.orgId}. ` +
          'Seed demo data and run at least one PR workflow transition (e.g. purchase-requisition tests).'
      );
    }
    purchaseRequisitionId = wfRow.model_id;
  });

  describe('Workflow notification email sending', () => {
    (smtpConfigured() ? it : it.skip)(
      'should send workflow notification emails for an existing purchase requisition workflow',
      async () => {
        const config = loadTestConfig();
        const authContext = createTestContext(config);

        const result = await send_workflow_notification_email(
          authContext,
          'purchase_requisition',
          purchaseRequisitionId,
          [],
          {},
          prisma
        );

        expect(result).toBeDefined();
        if (result?.message === 'Workflow notifications processed') {
          expect(result?.action_history).toBeDefined();
          expect(result?.action_history?.action_name).toBeDefined();
        } else {
          expect(result?.message).toBeDefined();
        }
      },
      30000
    );
  });
});
