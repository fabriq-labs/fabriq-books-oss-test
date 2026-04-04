import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupExpenseReportWorkflow(financeTeamRole: any) {
  // Guard: Check if Expense Report flow already exists
  const existingFlow = await prisma.workflow_flow.findFirst({
    where: { name: 'Expense Report Approval' }
  });
  if (existingFlow) {
    console.log('  ⏭️  Expense Report workflow already exists. Skipping.');
    return;
  }

  // Create Workflow Flow for expense_report
  const flow = await prisma.workflow_flow.create({
    data: {
      name: 'Expense Report Approval',
      model_name: 'expense_report',
      description: 'Workflow for expense report approval process',
      is_active: true,
    }
  });

  // Create Workflow States
  const draftState = await prisma.workflow_state.create({
    data: {
      flow_id: flow.id,
      name: 'Draft',
      description: 'Initial state for new expense reports',
      sequence: 0,
      is_initial: true,
      is_final: false,
      assigned_for: 'USER',
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const managerReviewState = await prisma.workflow_state.create({
    data: {
      flow_id: flow.id,
      name: 'Manager Review',
      description: 'Pending manager approval',
      sequence: 1,
      is_initial: false,
      is_final: false,
      assigned_for: 'EXPRESSION',
      assigned_expression: 'created_by.manager',
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const financeReviewState = await prisma.workflow_state.create({
    data: {
      flow_id: flow.id,
      name: 'Finance Review',
      description: 'Pending finance team approval',
      sequence: 2,
      is_initial: false,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: financeTeamRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const approvedState = await prisma.workflow_state.create({
    data: {
      flow_id: flow.id,
      name: 'Approved',
      description: 'Expense report approved',
      sequence: 3,
      is_initial: false,
      is_final: true,
      assigned_for: 'USER',
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const rejectedState = await prisma.workflow_state.create({
    data: {
      flow_id: flow.id,
      name: 'Rejected',
      description: 'Expense report rejected',
      sequence: 4,
      is_initial: false,
      is_final: true,
      assigned_for: 'USER',
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  // Create Workflow Actions
  await prisma.workflow_action.create({
    data: {
      name: 'Submit',
      description: 'Submit expense report for approval',
      source_state_id: draftState.id,
      target_state_id: managerReviewState.id,
      conditions: { conditions: [{ field: 'total_amount', value: true, operator: 'exists' }] },
      side_effects: { effects: [{ type: 'set_field', field: 'submitted_at', value: 'now()' }] }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve by Manager',
      description: 'Manager approves expense report',
      source_state_id: managerReviewState.id,
      target_state_id: financeReviewState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          { type: 'set_field', field: 'manager_approved', value: true },
          { type: 'set_field', field: 'manager_approved_at', value: 'now()' }
        ]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Reject by Manager',
      description: 'Manager rejects expense report',
      source_state_id: managerReviewState.id,
      target_state_id: rejectedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          { type: 'set_field', field: 'manager_approved', value: false },
          { type: 'set_field', field: 'rejected_at', value: 'now()' }
        ]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve by Finance',
      description: 'Finance team approves expense report',
      source_state_id: financeReviewState.id,
      target_state_id: approvedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          { type: 'set_field', field: 'finance_approved', value: true },
          { type: 'set_field', field: 'finance_approved_at', value: 'now()' }
        ]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Reject by Finance',
      description: 'Finance team rejects expense report',
      source_state_id: financeReviewState.id,
      target_state_id: rejectedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          { type: 'set_field', field: 'finance_approved', value: false },
          { type: 'set_field', field: 'rejected_at', value: 'now()' }
        ]
      }
    }
  });

  console.log('  ✓ Expense Report workflow created');
}

async function setupPurchaseRequisitionWorkflow(buyerRole: any, deliveryRole: any) {
  // Guard: Check if PR flow already exists
  const existingPRFlow = await prisma.workflow_flow.findFirst({
    where: { name: 'Purchase Requisition Approval' }
  });
  if (existingPRFlow) {
    console.log('  ⏭️  Purchase Requisition workflow already exists. Skipping.');
    return;
  }

  // Create Workflow Flow for purchase_requisition
  const prFlow = await prisma.workflow_flow.create({
    data: {
      name: 'Purchase Requisition Approval',
      model_name: 'purchase_requisition',
      description: 'Workflow for purchase requisition approval process',
      is_active: true,
    }
  });

  // Create Workflow States
  const draftState = await prisma.workflow_state.create({
    data: {
      flow_id: prFlow.id,
      name: 'Draft',
      description: 'Initial state for new purchase requisitions',
      sequence: 0,
      is_initial: true,
      is_final: false,
      assigned_for: 'USER',
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const managerReviewState = await prisma.workflow_state.create({
    data: {
      flow_id: prFlow.id,
      name: 'Manager Review',
      description: 'Pending manager approval',
      sequence: 1,
      is_initial: false,
      is_final: false,
      assigned_for: 'EXPRESSION',
      assigned_expression: 'created_by.manager',
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const buyerReviewState = await prisma.workflow_state.create({
    data: {
      flow_id: prFlow.id,
      name: 'Buyer Review',
      description: 'Pending buyer approval',
      sequence: 2,
      is_initial: false,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const deliveryState = await prisma.workflow_state.create({
    data: {
      flow_id: prFlow.id,
      name: 'Delivery',
      description: 'Delivery in progress',
      sequence: 3,
      is_initial: false,
      is_final: true,
      assigned_for: 'ROLE',
      assigned_role_id: deliveryRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  // Create Workflow Actions
  await prisma.workflow_action.create({
    data: {
      name: 'Submit',
      description: 'Submit purchase requisition for manager review',
      source_state_id: draftState.id,
      target_state_id: managerReviewState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve by Manager',
      description: 'Manager approves purchase requisition',
      source_state_id: managerReviewState.id,
      target_state_id: buyerReviewState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Reject to Draft',
      description: 'Manager rejects, returns to Draft',
      source_state_id: managerReviewState.id,
      target_state_id: draftState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Send Back',
      description: 'Send Back PR Manager to User',
      source_state_id: managerReviewState.id,
      target_state_id: draftState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve by Buyer',
      description: 'Buyer approves purchase requisition',
      source_state_id: buyerReviewState.id,
      target_state_id: deliveryState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          {
            type: 'database',
            config: { method: 'generate_po_from_pr' }
          },
          {
            type: 'database',
            config: { method: 'send_workflow_notification_email' }
          }
        ]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Reject to Manager',
      description: 'Buyer rejects, returns to Manager Review',
      source_state_id: buyerReviewState.id,
      target_state_id: managerReviewState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Send Back',
      description: 'Send Back PR Buyer to Manager',
      source_state_id: buyerReviewState.id,
      target_state_id: managerReviewState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Send Back',
      description: 'Send Back PR Buyer to User',
      source_state_id: buyerReviewState.id,
      target_state_id: draftState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  console.log('  ✓ Purchase Requisition workflow created');
}

async function setupPurchaseOrderWorkflow(buyerRole: any) {
  const existingPOFlow = await prisma.workflow_flow.findFirst({
    where: { name: 'Purchase Order Approval' }
  });
  if (existingPOFlow) {
    console.log('  ⏭️  Purchase Order workflow already exists. Skipping.');
    return;
  }

  const poFlow = await prisma.workflow_flow.create({
    data: {
      name: 'Purchase Order Approval',
      model_name: 'purchase_order',
      description: 'Workflow for purchase order approval process',
      is_active: true,
    }
  });

  const pendingPOCreationState = await prisma.workflow_state.create({
    data: {
      flow_id: poFlow.id,
      name: 'Pending PO Creation',
      description: 'Initial state for new purchase orders',
      sequence: 0,
      is_initial: true,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const poPendingApprovalState = await prisma.workflow_state.create({
    data: {
      flow_id: poFlow.id,
      name: 'PO Pending Approval',
      description: 'Purchase order submitted for approval',
      sequence: 1,
      is_initial: false,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const poIssuedState = await prisma.workflow_state.create({
    data: {
      flow_id: poFlow.id,
      name: 'PO Issued',
      description: 'Purchase order approved and issued',
      sequence: 2,
      is_initial: false,
      is_final: true,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const poCancelledState = await prisma.workflow_state.create({
    data: {
      flow_id: poFlow.id,
      name: 'PO Cancelled',
      description: 'Purchase order cancelled',
      sequence: 3,
      is_initial: false,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Submit',
      description: 'Submit purchase order',
      source_state_id: pendingPOCreationState.id,
      target_state_id: poPendingApprovalState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve',
      description: 'Approve purchase order',
      source_state_id: poPendingApprovalState.id,
      target_state_id: poIssuedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          { type: 'database', config: { method: 'send_workflow_notification_email' } },
          { type: 'database', config: { method: 'generate_invoice_from_po' } },
          { type: 'database', config: { method: 'sync_po_to_erp' }, enabled: false },
        ]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Reject',
      description: 'Reject purchase order and return to Draft',
      source_state_id: poPendingApprovalState.id,
      target_state_id: poCancelledState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  console.log('  ✓ Purchase Order workflow created');
}

async function setupInvoiceWorkflow(buyerRole: any) {
  const existingInvoiceFlow = await prisma.workflow_flow.findFirst({
    where: { name: 'Invoice Approval' }
  });
  if (existingInvoiceFlow) {
    console.log('  ⏭️  Invoice workflow already exists. Skipping.');
    return;
  }

  const invoiceFlow = await prisma.workflow_flow.create({
    data: {
      name: 'Invoice Approval',
      model_name: 'invoice',
      description: 'Workflow for invoice approval process',
      is_active: true,
    }
  });

  const draftState = await prisma.workflow_state.create({
    data: {
      flow_id: invoiceFlow.id,
      name: 'Draft',
      description: 'Initial state for new invoices',
      sequence: 0,
      is_initial: true,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const submittedState = await prisma.workflow_state.create({
    data: {
      flow_id: invoiceFlow.id,
      name: 'Submitted',
      description: 'Invoice submitted for approval',
      sequence: 1,
      is_initial: false,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const approvedState = await prisma.workflow_state.create({
    data: {
      flow_id: invoiceFlow.id,
      name: 'Approved',
      description: 'Invoice approved',
      sequence: 2,
      is_initial: false,
      is_final: true,
      assigned_for: 'ROLE',
      assigned_role_id: buyerRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Submit',
      description: 'Submit invoice',
      source_state_id: draftState.id,
      target_state_id: submittedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          {
            type: 'database',
            config: { method: 'calculate_invoice_total' }
          },
          {
            type: 'database',
            config: { method: 'send_workflow_notification_email' }
          }
        ]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve',
      description: 'Approve invoice',
      source_state_id: submittedState.id,
      target_state_id: approvedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'send_workflow_notification_email' }
        }]
      }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Reject',
      description: 'Reject invoice and return to Draft',
      source_state_id: submittedState.id,
      target_state_id: draftState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [
          {
            type: 'database',
            config: { method: 'handle_invoice_reject' }
          },
          {
            type: 'database',
            config: { method: 'send_workflow_notification_email' }
          }
        ]
      }
    }
  });

  console.log('  ✓ Invoice workflow created');
}

async function setupSalesOrderWorkflow(employeeRole: any) {
  const existingSOFlow = await prisma.workflow_flow.findFirst({
    where: { name: 'Sales Order Approval' }
  });
  if (existingSOFlow) {
    console.log('  ⏭️  Sales Order workflow already exists. Skipping.');
    return;
  }

  const soFlow = await prisma.workflow_flow.create({
    data: {
      name: 'Sales Order Approval',
      model_name: 'sales_order',
      description: 'Workflow for sales order approval process',
      is_active: true,
    }
  });

  const draftState = await prisma.workflow_state.create({
    data: {
      flow_id: soFlow.id,
      name: 'Draft',
      description: 'Initial state for new sales orders',
      sequence: 0,
      is_initial: true,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: employeeRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const submittedState = await prisma.workflow_state.create({
    data: {
      flow_id: soFlow.id,
      name: 'Submitted',
      description: 'Sales order submitted for processing',
      sequence: 1,
      is_initial: false,
      is_final: false,
      assigned_for: 'ROLE',
      assigned_role_id: employeeRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  const invoicedState = await prisma.workflow_state.create({
    data: {
      flow_id: soFlow.id,
      name: 'Invoiced',
      description: 'Sales order invoiced and completed',
      sequence: 2,
      is_initial: false,
      is_final: true,
      assigned_for: 'ROLE',
      assigned_role_id: employeeRole.id,
      entry_conditions: { conditions: [] },
      exit_conditions: { conditions: [] }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Submit',
      description: 'Submit Sales Order',
      source_state_id: draftState.id,
      target_state_id: submittedState.id,
      conditions: { conditions: [] },
      side_effects: { effects: [] }
    }
  });

  await prisma.workflow_action.create({
    data: {
      name: 'Approve',
      description: 'Invoiced',
      source_state_id: submittedState.id,
      target_state_id: invoicedState.id,
      conditions: { conditions: [] },
      side_effects: {
        effects: [{
          type: 'database',
          config: { method: 'generate_invoice_from_so' }
        }]
      }
    }
  });

  console.log('  ✓ Sales Order workflow created');
}

async function main() {
  try {
    console.log('🚀 Setting up workflows...');
    console.log('');

    // Fetch required roles
    const buyerRole = await prisma.role.findUnique({
      where: { name: 'Buyer' }
    });
    if (!buyerRole) throw new Error('Buyer role not found. Please run setup-metadata.ts first.');

    const deliveryRole = await prisma.role.findUnique({
      where: { name: 'Delivery' }
    });
    if (!deliveryRole) throw new Error('Delivery role not found. Please run setup-metadata.ts first.');

    const employeeRole = await prisma.role.findUnique({
      where: { name: 'Employee' }
    });
    if (!employeeRole) throw new Error('Employee role not found. Please run setup-metadata.ts first.');

    const financeTeamRole = await prisma.role.findUnique({
      where: { name: 'Finance Team' }
    });
    if (!financeTeamRole) throw new Error('Finance Team role not found. Please run setup-metadata.ts first.');

    console.log('📋 Creating Expense Report workflow...');
    await setupExpenseReportWorkflow(financeTeamRole);

    console.log('📋 Creating Purchase Requisition workflow...');
    await setupPurchaseRequisitionWorkflow(buyerRole, deliveryRole);

    console.log('📋 Creating Purchase Order workflow...');
    await setupPurchaseOrderWorkflow(buyerRole);

    console.log('📋 Creating Invoice workflow...');
    await setupInvoiceWorkflow(buyerRole);

    console.log('📋 Creating Sales Order workflow...');
    await setupSalesOrderWorkflow(employeeRole);

    console.log('');
    console.log('✅ Workflow setup complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log('   🔄 Workflows: 5 workflows (Expense Report, PR, PO, Invoice, Sales Order)');
    console.log('   📊 States: 19 total states');
    console.log('   ⚡ Actions: 21 total actions');

  } catch (error) {
    console.error('❌ Error in workflow setup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { main };
