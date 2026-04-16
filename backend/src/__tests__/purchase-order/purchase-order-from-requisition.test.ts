import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createPurchaseRequisitionData,
  createPurchaseRequisitionItemData,
  assertWorkflowState,
} from '../purchase-requisition/purchase-requisition-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

/** PR line → PO grouping uses supplier + need_by_date (DD-MM-YYYY); see generate_po_from_pr in zeiv.ts */
describe('Purchase order creation from purchase requisition (workflow)', () => {
  jest.setTimeout(45000);

  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma, { executeSideEffects: true });

  let config: TestConfig;
  let context: ReturnType<typeof createTestContext>;
  let locationId: string;
  let managerId: string;
  let managerContext: { user: { id: string; org_id: string; email: string; name: string }; org: { id: string } };
  let buyerContext: { user: { id: string; org_id: string; email: string; name: string }; org: { id: string } };

  const sameNeedBy = new Date('2026-06-10T12:00:00.000Z');
  const secondNeedBy = new Date('2026-07-20T12:00:00.000Z');

  async function ensureBuyerApproveRunsPoGeneration(): Promise<void> {
    const prFlow = await prisma.workflow_flow.findFirst({
      where: { model_name: 'purchase_requisition' },
    });
    if (!prFlow) return;

    const buyerReviewState = await prisma.workflow_state.findFirst({
      where: { flow_id: prFlow.id, name: 'Buyer Review' },
    });
    if (!buyerReviewState) return;

    const approveBuyerAction = await prisma.workflow_action.findFirst({
      where: { source_state_id: buyerReviewState.id, name: 'Approve by Buyer' },
    });
    if (!approveBuyerAction) return;

    const currentSideEffects = approveBuyerAction.side_effects as { effects?: Array<{ type?: string; config?: { method?: string } }> };
    const hasPoGeneration = currentSideEffects?.effects?.some(
      (e) => e.type === 'database' && e.config?.method === 'generate_po_from_pr',
    );
    if (hasPoGeneration) return;

    await prisma.workflow_action.update({
      where: { id: approveBuyerAction.id },
      data: {
        side_effects: {
          effects: [{ type: 'database', config: { method: 'generate_po_from_pr' } }],
        },
      },
    });
  }

  async function submitManagerApproveBuyerApprove(wfInstanceId: string): Promise<void> {
    const wf1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
    const submit = wf1.availableActions.find((a) => a.name === 'Submit');
    expect(submit).toBeDefined();
    await workflowEngine.executeTransition(wf1, submit!, context, {});

    const wf2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
    const approveMgr = wf2.availableActions.find((a) => a.name === 'Approve by Manager');
    expect(approveMgr).toBeDefined();
    await workflowEngine.executeTransition(wf2, approveMgr!, managerContext, {});

    const wf3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
    const approveBuyer = wf3.availableActions.find((a) => a.name === 'Approve by Buyer');
    expect(approveBuyer).toBeDefined();
    await workflowEngine.executeTransition(wf3, approveBuyer!, buyerContext, {});
  }

  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    await validateTestData(config, prisma);

    const location = await prisma.location.findUnique({ where: { id: config.locationId } });
    if (!location) {
      throw new Error(`Location ${config.locationId} not found. Run the appropriate setup script first.`);
    }
    locationId = location.id;

    const managerUser = await prisma.user.findFirst({
      where: { org_id: config.orgId, id: { not: config.userId } },
      orderBy: { created_at: 'asc' },
    });
    if (!managerUser) {
      throw new Error(`No manager user found in organization ${config.orgId}.`);
    }
    managerId = managerUser.id;

    const testUser = await prisma.user.findUnique({
      where: { id: config.userId },
      select: { manager_id: true },
    });
    if (!testUser || testUser.manager_id !== managerId) {
      await prisma.user.update({
        where: { id: config.userId },
        data: { manager_id: managerId },
      });
    }

    managerContext = {
      user: {
        id: managerId,
        org_id: config.orgId,
        email: `${managerId}@example.com`,
        name: managerId.replace('user_', '').replace('_', ' ').toUpperCase(),
      },
      org: { id: config.orgId },
    };

    buyerContext = {
      user: {
        id: config.buyerUserId,
        org_id: config.orgId,
        email: `${config.buyerUserId}@example.com`,
        name: config.buyerUserId.replace('user_', '').replace('_', ' ').toUpperCase(),
      },
      org: { id: config.orgId },
    };

    await ensureBuyerApproveRunsPoGeneration();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates one PO for two lines: same supplier and same need-by date', async () => {
    const supplierId = config.supplierId;
    const prData = createPurchaseRequisitionData(locationId, config.orgId, context.user.id);
    const prResult = await modelService.create('purchase_requisition', context, prData, {});
    expect(prResult.success).toBe(true);
    const prId = prResult.data.id;
    const wfInstanceId = prResult.data.wf_instance_id;

    const itemA = config.items.productA;
    const itemC = config.items.productC;
    const lines = [
      { ...createPurchaseRequisitionItemData(itemA, config.orgId, context.user.id, supplierId), need_by_date: sameNeedBy },
      { ...createPurchaseRequisitionItemData(itemC, config.orgId, context.user.id, supplierId), need_by_date: sameNeedBy },
    ];
    await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, lines, {});

    await submitManagerApproveBuyerApprove(wfInstanceId);
    await assertWorkflowState(wfInstanceId, 'Delivery');

    const pos = await prisma.purchase_order.findMany({
      where: { purchase_id: prId },
      orderBy: { created_at: 'asc' },
    });
    expect(pos.length).toBe(1);
    expect(pos[0].supplier_id).toBe(supplierId);

    const poItems = await prisma.purchase_order_item.findMany({
      where: { instance_id: pos[0].id },
    });
    expect(poItems.length).toBe(2);
    const productIds = poItems.map((p) => p.product_id).sort();
    expect(productIds).toEqual([itemA, itemC].sort());
  });

  it('creates two POs for two lines: same supplier and different need-by dates', async () => {
    const supplierId = config.supplierId;
    const prData = createPurchaseRequisitionData(locationId, config.orgId, context.user.id);
    const prResult = await modelService.create('purchase_requisition', context, prData, {});
    expect(prResult.success).toBe(true);
    const prId = prResult.data.id;
    const wfInstanceId = prResult.data.wf_instance_id;

    const itemA = config.items.productA;
    const itemC = config.items.productC;
    const lines = [
      { ...createPurchaseRequisitionItemData(itemA, config.orgId, context.user.id, supplierId), need_by_date: sameNeedBy },
      { ...createPurchaseRequisitionItemData(itemC, config.orgId, context.user.id, supplierId), need_by_date: secondNeedBy },
    ];
    await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, lines, {});

    await submitManagerApproveBuyerApprove(wfInstanceId);
    await assertWorkflowState(wfInstanceId, 'Delivery');

    const pos = await prisma.purchase_order.findMany({
      where: { purchase_id: prId },
      orderBy: { need_by_date: 'asc' },
    });
    expect(pos.length).toBe(2);
    expect(pos.every((p) => p.supplier_id === supplierId)).toBe(true);

    const dates = pos
      .map((p) => (p.need_by_date ? new Date(p.need_by_date).toISOString().slice(0, 10) : null))
      .sort();
    expect(dates).toEqual([sameNeedBy.toISOString().slice(0, 10), secondNeedBy.toISOString().slice(0, 10)].sort());

    for (const po of pos) {
      const n = await prisma.purchase_order_item.count({ where: { instance_id: po.id } });
      expect(n).toBe(1);
    }
  });

  it('creates two POs for two lines: different suppliers and same need-by date', async () => {
    const masterA = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
    const masterC = await prisma.item_master.findUnique({ where: { id: config.items.productC } });
    if (!masterA?.supplier_id || !masterC?.supplier_id) {
      throw new Error('productA and productC must have supplier_id on item_master for this test.');
    }
    if (masterA.supplier_id === masterC.supplier_id) {
      throw new Error('productA and productC must map to different suppliers for this test.');
    }

    const prData = createPurchaseRequisitionData(locationId, config.orgId, context.user.id);
    const prResult = await modelService.create('purchase_requisition', context, prData, {});
    expect(prResult.success).toBe(true);
    const prId = prResult.data.id;
    const wfInstanceId = prResult.data.wf_instance_id;

    const lines = [
      {
        ...createPurchaseRequisitionItemData(config.items.productA, config.orgId, context.user.id, masterA.supplier_id),
        need_by_date: sameNeedBy,
      },
      {
        ...createPurchaseRequisitionItemData(config.items.productC, config.orgId, context.user.id, masterC.supplier_id),
        need_by_date: sameNeedBy,
      },
    ];
    await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, lines, {});

    await submitManagerApproveBuyerApprove(wfInstanceId);
    await assertWorkflowState(wfInstanceId, 'Delivery');

    const pos = await prisma.purchase_order.findMany({
      where: { purchase_id: prId },
      orderBy: { supplier_id: 'asc' },
    });
    expect(pos.length).toBe(2);
    const supplierIds = pos.map((p) => p.supplier_id).sort();
    expect(supplierIds).toEqual([masterA.supplier_id, masterC.supplier_id].sort());

    for (const po of pos) {
      const items = await prisma.purchase_order_item.findMany({ where: { instance_id: po.id } });
      expect(items.length).toBe(1);
      expect(items[0].supplier_id).toBe(po.supplier_id);
    }
  });
});
