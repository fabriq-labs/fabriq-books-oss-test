# Fabriq Workflow Engine - Implementation Documentation

**When to read**: Understanding workflows, adding new approval processes, debugging workflow issues
**Related docs**: [BACKEND.md](./BACKEND.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

**Last Updated**: 2026-01-04
**Version**: 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Workflow Engine Architecture](#workflow-engine-architecture)
4. [Side Effects System](#side-effects-system)
5. [Frontend Components](#frontend-components)
6. [API Endpoints](#api-endpoints)
7. [Configuration Examples](#configuration-examples)
8. [Future Enhancements](#future-enhancements)

---

## Overview

The Fabriq Workflow Engine is a **state machine system** that provides approval processes and automated actions for business documents. It enables:

- **Multi-level approvals** with role-based or user-based assignments
- **State-based routing** for documents (Draft → Review → Approved)
- **Automated side effects** (generate PO from PR, send notifications, sync to ERP)
- **Skip logic** for bypassing states based on business rules
- **Full audit trail** via workflow history

### Supported Workflow-Enabled Models

| Model | Workflow Flow | Description |
|-------|---------------|-------------|
| `purchase_requisition` | PR Workflow | Request items with multi-level approval |
| `purchase_order` | PO Workflow | Purchase order approval process |
| `invoice` | Invoice Workflow | Supplier invoice processing |
| `sales_order` | Sales Order Workflow | Order-to-cash approval |
| `expense_report` | Expense Workflow | Employee expense approval |

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORKFLOW ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ workflow_flow │───▶│workflow_state│───▶│workflow_action│     │
│  │  (Definition) │    │   (States)   │    │ (Transitions) │     │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                                        │               │
│         │                                        ▼               │
│         │                              ┌──────────────────┐     │
│         │                              │   side_effects   │     │
│         │                              │  (JSON Config)   │     │
│         │                              └──────────────────┘     │
│         ▼                                        │               │
│  ┌──────────────────┐                           ▼               │
│  │workflow_instance │◀───────── SideEffectExecutor             │
│  │  (Runtime)       │                   │                       │
│  └──────────────────┘                   ▼                       │
│         │                        workflowActionMap              │
│         ▼                        (Method Registry)              │
│  ┌──────────────────┐                                           │
│  │workflow_history  │                                           │
│  │  (Audit Trail)   │                                           │
│  └──────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### workflow_flow

**File**: `backend/prisma/schema/metadata.prisma:152-165`

Defines a workflow for a specific model type.

```prisma
model workflow_flow {
  id          String           @id @default(dbgenerated("'wflw_' || gen_random_uuid()"))
  name        String           // e.g., "Purchase Requisition Workflow"
  description String?
  model_name  String           // e.g., "purchase_requisition"
  is_active   Boolean          @default(true)
  created_by  String?
  modified_by String?
  created_at  DateTime         @default(now())
  modified_at DateTime         @default(now())
  org_id      String?
  states      workflow_state[]
  instances   workflow_instance[]
}
```

**Key Fields**:
- `model_name`: Links to the Prisma model this workflow manages
- `is_active`: Enable/disable the workflow
- One flow per model type

---

### workflow_state

**File**: `backend/prisma/schema/metadata.prisma:167-195`

Defines states within a workflow (e.g., Draft, Manager Review, Approved).

```prisma
model workflow_state {
  id                   String             @id @default(dbgenerated("'wsta_' || gen_random_uuid()"))
  flow_id              String
  name                 String             // e.g., "Manager Review"
  description          String?
  sequence             Int                @default(0)
  is_initial           Boolean            @default(false)
  is_final             Boolean            @default(false)
  is_active            Boolean            @default(true)

  // Assignment Configuration
  assigned_for         String?            // "USER" | "ROLE" | "EXPRESSION"
  assigned_role_id     String?            // Role ID if assigned_for = "ROLE"
  assigned_user_id     String?            // User ID if assigned_for = "USER"
  assigned_expression  String?            // Expression like "created_by.manager"

  // Skip Configuration
  skip                 Boolean            @default(false)
  skip_target_state_id String?            // Target state when skipping

  // Conditions
  entry_conditions     Json?              // Conditions to enter this state
  exit_conditions      Json?              // Conditions to exit this state

  // Relations
  flow                 workflow_flow      @relation(...)
  source_actions       workflow_action[]  @relation("source_state")
  target_actions       workflow_action[]  @relation("target_state")
  assigned_role        role?              @relation(...)
  assigned_user        user?              @relation(...)
}
```

**Assignment Types**:

| Type | Description | Field |
|------|-------------|-------|
| `USER` | Specific user assignment | `assigned_user_id` |
| `ROLE` | Any user with the role can act | `assigned_role_id` |
| `EXPRESSION` | Dynamic evaluation | `assigned_expression` (e.g., `created_by.manager`) |

---

### workflow_action

**File**: `backend/prisma/schema/metadata.prisma:197-213`

Defines transitions between states with optional side effects.

```prisma
model workflow_action {
  id              String             @id @default(dbgenerated("'wact_' || gen_random_uuid()"))
  name            String             // e.g., "Approve", "Reject", "Submit"
  description     String?
  source_state_id String             // From state
  target_state_id String             // To state
  conditions      Json?              // Conditions to perform action
  side_effects    Json?              // Side effects configuration (KEY FIELD)
  created_by      String?
  modified_by     String?
  created_at      DateTime           @default(now())
  modified_at     DateTime           @default(now())
  org_id          String?
  source_state    workflow_state     @relation("source_state", ...)
  target_state    workflow_state     @relation("target_state", ...)
  history         workflow_history[]
}
```

**Side Effects Structure**:
```json
{
  "effects": [
    {
      "type": "database",
      "config": { "method": "generate_po_from_pr" },
      "enabled": true
    },
    {
      "type": "database",
      "config": { "method": "send_workflow_notification_email" },
      "enabled": false
    }
  ]
}
```

- **`enabled`** (optional): When `false`, the effect is **not** executed. Omitted or `true` means the effect runs. Use this to disable an effect without removing it from the config.

---

### workflow_instance

**File**: `backend/prisma/schema/metadata.prisma:215-239`

Runtime instance tracking for a specific document.

```prisma
model workflow_instance {
  id               String           @id @default(dbgenerated("'wins_' || gen_random_uuid()"))
  flow_id          String
  model_id         String           // ID of the business document
  current_state    String           // Current state name
  current_state_id String?          // Reference to workflow_state.id
  assigned_user_id String?          // Currently assigned user
  status           String           // "active" | "completed" | "cancelled"
  created_by       String?
  modified_by      String?
  created_at       DateTime         @default(now())
  modified_at      DateTime         @default(now())
  org_id           String?

  // Relations
  flow              workflow_flow      @relation(...)
  current_state_ref workflow_state?    @relation(...)
  history           workflow_history[]
  comments          comment[]
}
```

---

### workflow_history

**File**: `backend/prisma/schema/metadata.prisma:241-264`

Audit trail for all state transitions.

```prisma
model workflow_history {
  id                 String             @id @default(dbgenerated("'whis_' || gen_random_uuid()"))
  instance_id        String
  action_id          String
  from_state         String
  from_state_id      String?
  to_state           String
  to_state_id        String?
  performed_by       String             // user_id
  performed_at       DateTime           @default(now())
  performed_by_name  String?
  performed_by_email String?
  comments           String?
  metadata           Json?              // Additional transition data
  skipped_states     Json?              // Array of skipped state IDs
}
```

---

## Workflow Engine Architecture

### WorkflowEngine Class

**File**: `backend/src/workflow-engine/core/WorkflowEngine.ts`

The main orchestrator for workflow operations.

```typescript
export class WorkflowEngine {
  private prisma: WorkflowPrismaClient;
  private config: WorkflowEngineConfig;
  private expressionEvaluator: ExpressionEvaluator;
  private sideEffectExecutor: SideEffectExecutor;

  constructor(prisma: WorkflowPrismaClient, config: WorkflowEngineConfig = {}) {
    this.config = {
      validateConditions: true,
      executeSideEffects: true,  // Global toggle for side effects
      logTransitions: true,
      ...config,
    };
    this.expressionEvaluator = new ExpressionEvaluator(prisma);
    this.sideEffectExecutor = new SideEffectExecutor(prisma);
  }
}
```

### Key Methods

#### `createWorkflowInstance()`

Creates a new workflow instance for a document.

```typescript
async createWorkflowInstance(
  modelName: string,
  modelId: string,
  startedBy: any,
  tx?: any
): Promise<WorkflowInstance>
```

**Process**:
1. Lookup flow by model name
2. Find initial state
3. Evaluate assigned user (USER/ROLE/EXPRESSION)
4. Create `workflow_instance` record
5. Update model with `wf_instance_id`

#### `executeTransition()`

**File**: `backend/src/workflow-engine/core/WorkflowEngine.ts:371-541`

Executes a state transition with full transaction safety.

```typescript
async executeTransition(
  context: WorkflowContext,
  action: WorkflowAction,
  authContext: AuthContext,
  metadata?: Record<string, any>
): Promise<WorkflowTransition>
```

**Process**:
1. **Validate Transition** (line 377-381)
   - Check action is available in current state
   - Verify user authorization (USER/ROLE/EXPRESSION)

2. **Resolve Skip Chain** (line 392-402)
   - Check if target state should be skipped
   - Recursively find final non-skipped state
   - Track skipped states for history

3. **Execute in Transaction** (line 434-517)
   ```typescript
   const result = await this.prisma.$transaction(async (tx) => {
     // Create history record
     const history = await tx.workflow_history.create({...});

     // Add comment if provided
     if (metadata?.comment) {
       await this.addComment(...);
     }

     // Update instance state
     const updatedInstance = await tx.workflow_instance.update({...});

     // Execute side effects (if no states were skipped)
     if (skippedStates.length === 0) {
       if (this.config.executeSideEffects && action.side_effects) {
         await this.sideEffectExecutor.execute(
           action.side_effects,
           context,
           authContext,
           tx
         );
       }
     }

     return { history, updatedInstance };
   });
   ```

4. **Return Transition Result**
   - From/to states
   - History record
   - Updated instance

#### `validateTransition()`

**File**: `backend/src/workflow-engine/core/WorkflowEngine.ts:191-240`

Validates if a user can perform an action.

```typescript
async validateTransition(
  context: WorkflowContext,
  action: WorkflowAction,
  metadata?: Record<string, any>
): Promise<WorkflowValidationResult>
```

**Authorization Logic**:

```typescript
switch (state.assigned_for) {
  case 'USER':
    // Must be assigned user OR document creator
    if (state.assigned_user_id !== context.user.id &&
        context.instance.created_by !== context.user.id) {
      errors.push('User not authorized');
    }
    break;

  case 'ROLE':
    // User must have the assigned role
    if (!context.user.roles.includes(state.assigned_role_id)) {
      errors.push('User does not have required role');
    }
    break;

  case 'EXPRESSION':
    // Evaluate expression to get authorized user
    const authorizedUserId = await this.expressionEvaluator.evaluateExpression(
      state.assigned_expression,
      { modelType, modelId, orgId }
    );
    if (authorizedUserId !== context.user.id) {
      errors.push('User not authorized by expression');
    }
    break;
}
```

#### `resolveSkipChain()`

**File**: `backend/src/workflow-engine/core/WorkflowEngine.ts:248-317`

Handles automatic state skipping.

```typescript
private async resolveSkipChain(
  stateId: string,
  skippedStates: string[],
  visitedStates: Set<string> = new Set()
): Promise<{ finalStateId: string; skippedStateIds: string[] } | null>
```

**Process**:
1. Detect circular skip loops
2. Check if state has `skip = true`
3. Use `skip_target_state_id` if specified
4. Auto-determine from single outgoing action
5. Error if multiple actions without specified target
6. Recursively continue until non-skipped state

---

## Side Effects System

### SideEffectExecutor Class

**File**: `backend/src/workflow-engine/core/SideEffectExecutor.ts`

Executes configured side effects during workflow transitions.

### Side Effect Types

```typescript
export interface SideEffect {
  type: 'database' | 'notification';
  config: Record<string, any>;
  conditions?: Record<string, any>;
}

export interface DatabaseEffect {
  type: 'database';
  config: {
    method?: string;      // Method name from workflowActionMap
    params?: any[];       // Optional parameters
  };
}

export interface NotificationEffect {
  type: 'notification';
  config: {
    recipients: string[];  // User IDs or expressions
    template: string;      // Notification template
    channels: string[];    // email, slack, etc.
    data?: Record<string, any>;
  };
}
```

### Execution Flow

**File**: `backend/src/workflow-engine/core/SideEffectExecutor.ts:38-150`

```typescript
async execute(
  effects: SideEffect[] | any,
  context: WorkflowContext,
  authContext: AuthContext,
  tx: any  // Transaction client for atomicity
): Promise<void> {
  // 1. Normalize effects (handle both array and { effects: [] })
  const normalizedEffects = Array.isArray(effects)
    ? effects
    : (effects?.effects || []);

  // 2. Execute each effect sequentially (skip when enabled === false)
  for (const effect of normalizedEffects) {
    if (effect.enabled === false) {
      logger.info('Skipping disabled effect', { effect });
      continue;
    }
    try {
      await this.executeEffect(effect, context, authContext, tx);
    } catch (error) {
      // Re-throw to rollback entire transaction
      throw error;
    }
  }
}

private async executeEffect(effect, context, authContext, tx) {
  switch (effect.type) {
    case 'database':
      await this.executeDatabaseUpdate(effect, context, authContext, tx);
      break;
    case 'notification':
      await this.executeNotification(effect, context, authContext, tx);
      break;
    default:
      logger.warn('Unknown side effect type', { type: effect.type });
  }
}
```

### Database Effect Execution

```typescript
private async executeDatabaseUpdate(effect, context, authContext, tx) {
  const { method } = effect.config;

  // Validate method exists
  if (!method || !workflowActionMap[method]) {
    throw new Error(
      `Workflow action method '${method}' not found. ` +
      `Available: ${Object.keys(workflowActionMap).join(', ')}`
    );
  }

  // Execute the method
  await workflowActionMap[method](
    context,
    context.instance.model_name,
    context.instance.model_id,
    [],
    {},
    tx
  );
}
```

### Workflow Action Map (Available Methods)

**File**: `backend/src/lib/actions.ts:33-50`

```typescript
export const workflowActionMap: Record<string, any> = {
  // Document Generation
  generate_po_from_pr: generate_po_from_pr,
  generate_invoice_from_po: generate_invoice_from_po,
  generate_invoice_from_so: generate_invoice_from_so,

  // Total Calculations
  calculate_invoice_total: calculate_invoice_total,
  calculate_pr_total: calculate_pr_total,
  calculate_po_total: calculate_po_total,
  calculate_payment_total: calculate_payment_total,
  calculate_sales_order_total: calculate_sales_order_total,
  calculate_delivery_challan_total: calculate_delivery_challan_total,
  calculate_credit_note_total: calculate_credit_note_total,
  calculate_quote_total: calculate_quote_total,

  // Status Handling
  handle_invoice_reject: handle_invoice_reject,

  // Accounting
  create_sales_invoice_posting: create_sales_invoice_posting,
  reverse_sales_invoice_postings: reverse_sales_invoice_postings,

  // Notifications
  send_workflow_notification_email: send_workflow_notification_email,

  // ERP Integration
  sync_po_to_erp: sync_purchase_order
};
```

### Variable Resolution

**File**: `backend/src/workflow-engine/core/SideEffectExecutor.ts:196-212`

Side effects support variable placeholders:

```typescript
private resolveStringVariables(str, context, authContext): string {
  return str
    .replace(/\{\{user\.id\}\}/g, authContext.user.id)
    .replace(/\{\{user\.email\}\}/g, authContext.user.email)
    .replace(/\{\{user\.name\}\}/g, authContext.user.name || '')
    .replace(/\{\{instance\.id\}\}/g, context.instance.id)
    .replace(/\{\{instance\.model_id\}\}/g, context.instance.model_id)
    .replace(/\{\{instance\.model_name\}\}/g, context.instance.model_name)
    .replace(/\{\{instance\.current_state\}\}/g, context.instance.current_state)
    .replace(/\{\{instance\.org_id\}\}/g, context.instance.org_id || '')
    .replace(/\{\{now\}\}/g, new Date().toISOString())
    .replace(/\{\{today\}\}/g, new Date().toISOString().split('T')[0]);
}
```

**Available Variables**:
- `{{user.id}}`, `{{user.email}}`, `{{user.name}}`
- `{{instance.id}}`, `{{instance.model_id}}`, `{{instance.model_name}}`
- `{{instance.current_state}}`, `{{instance.org_id}}`
- `{{now}}` (ISO timestamp), `{{today}}` (YYYY-MM-DD)

---

## Frontend Components

### Workflow Management Pages

#### WorkflowManagementPage

**File**: `frontend-1/src/pages/settings/WorkflowManagementPage.tsx`

Lists all workflow flows with their status.

```tsx
// Route: /settings/workflows
<Master
  type="workflow_flow"
  view="workflow_flow_view"
  displayName="Workflows"
/>
```

#### WorkflowDetailPage

**File**: `frontend-1/src/pages/settings/WorkflowDetailPage.tsx`

Shows workflow with all states and actions.

```tsx
// Route: /settings/workflows/:flowId
const { flowId } = useParams();
const { data: flow } = useQuery(['flow', flowId], () =>
  workflowManagementAPI.getFlowById(flowId)
);

return (
  <div>
    <WorkflowHeader flow={flow} />
    <WorkflowStatesTable states={flow.states} flowId={flowId} />
  </div>
);
```

### WorkflowStatesTable

**File**: `frontend-1/src/components/workflow/WorkflowStatesTable.tsx`

Displays and manages workflow states.

**Features**:
- Drag-and-drop state reordering
- Edit state properties via modal
- Shows assignment type and skip configuration
- Displays outgoing actions

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Type</TableHead>
      <TableHead>Assignment</TableHead>
      <TableHead>Skip</TableHead>
      <TableHead>Active</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {states.map((state) => (
      <DraggableRow key={state.id} state={state} />
    ))}
  </TableBody>
</Table>
```

### WorkflowStateModal

**File**: `frontend-1/src/components/workflow/WorkflowStateModal.tsx`

Modal for editing state properties.

**Sections**:

1. **General**
   - Name, Description
   - Active toggle

2. **Assignment**
   - Type selector (USER/ROLE/EXPRESSION)
   - Role selector (RoleSelector component)
   - User selector (UserSelector component)
   - Expression input

3. **Skip Configuration**
   - Skip toggle
   - Target state selector (if multiple actions)
   - Warning for states with side effects

4. **Outgoing Actions** (read-only)
   - Lists actions from this state
   - Shows target states

**Important**: Currently **no UI for editing side effects** - they are configured via database/setup scripts.

### WorkflowActions Component

**File**: `frontend-1/src/components/forms/purchase-requisition/WorkflowActions.tsx`

Displays and executes workflow actions on forms.

```tsx
const WorkflowActions = ({ workflowContext, onActionComplete }) => {
  const availableActions = workflowContext.current_state_ref?.source_actions || [];

  const handleAction = async (action) => {
    await workflowAPI.update(workflowContext.id, action.id, {
      comment: formComment
    });
    onActionComplete();
  };

  return (
    <div className="flex gap-2">
      {availableActions.map((action) => (
        <Button key={action.id} onClick={() => handleAction(action)}>
          {action.name}
        </Button>
      ))}
    </div>
  );
};
```

---

## API Endpoints

### Workflow Runtime API

```typescript
// Get workflow instances by model
GET /api/workflow/instances/:modelName

// Get workflow instance details
GET /api/workflow/instances/:id

// Execute workflow action
POST /api/workflow/instances/:instanceId/actions/:actionId
Body: { data?: any, comment?: string }

// Get workflow history
GET /api/workflow/instances/:instanceId/history

// Add comment to workflow
POST /api/workflow/instances/:instanceId/comments
Body: { comment: string }

// Get comments
GET /api/workflow/instances/:instanceId/comments
```

### Workflow Management API

```typescript
// List all workflow flows
GET /api/workflow/flows

// Get flow with states and actions
GET /api/workflow/flows/:flowId

// Update workflow state
PUT /api/workflow/flows/:flowId/states/:stateId
Body: {
  name?: string,
  description?: string,
  is_active?: boolean,
  assigned_for?: string,
  assigned_role_id?: string,
  assigned_user_id?: string,
  assigned_expression?: string,
  skip?: boolean,
  skip_target_state_id?: string
}

// Batch update state sequences
PUT /api/workflow/flows/:flowId/states/batch
Body: { states: [{ id, sequence }] }

// Toggle state active status
PUT /api/workflow/flows/:flowId/states/:stateId/toggle
Body: { is_active: boolean }
```

### Frontend API Client

**File**: `frontend-1/src/api/api.ts:309-591`

```typescript
export const workflowAPI = {
  getAll: (type) => fetchAPI(`/api/workflow/${type}`),
  create: (type, state, data) => fetchAPI(`/api/workflow/${type}/state/${state}`, { method: 'POST', body: JSON.stringify(data) }),
  getById: (type, id, state) => fetchAPI(`/api/workflow/${type}/${id}/state/${state}`),
  update: (instanceId, actionId, { data, comment }) =>
    fetchAPI(`/api/workflow/instances/${instanceId}/actions/${actionId}`, { method: 'POST', body: JSON.stringify({ data, comment }) }),
  createComment: (instanceId, { comment }) =>
    fetchAPI(`/api/workflow/instances/${instanceId}/comments`, { method: 'POST', body: JSON.stringify({ comment }) }),
  getComment: (type, id) => fetchAPI(`/api/workflow/${type}/${id}/comments`),
  getHistory: (type, id) => fetchAPI(`/api/workflow/history/${type}/${id}`),
};

export const workflowManagementAPI = {
  getFlows: () => fetchAPI('/api/workflow/flows'),
  getFlowById: (flowId) => fetchAPI(`/api/workflow/flows/${flowId}`),
  updateState: (flowId, stateId, data) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleStateActive: (flowId, stateId, is_active) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states/${stateId}/toggle`, { method: 'PUT', body: JSON.stringify({ is_active }) }),
  batchUpdateStates: (flowId, states) =>
    fetchAPI(`/api/workflow/flows/${flowId}/states/batch`, { method: 'PUT', body: JSON.stringify({ states }) }),
};
```

---

## Configuration Examples

### Purchase Requisition Workflow

**File**: `backend/prisma/setup-workflows.ts:177-393`

```typescript
// States
const states = [
  { name: 'Draft', is_initial: true, assigned_for: 'USER' },
  { name: 'Manager Review', assigned_for: 'ROLE', assigned_role_id: managerRoleId },
  { name: 'Buyer Review', assigned_for: 'ROLE', assigned_role_id: buyerRoleId },
  { name: 'Delivered', is_final: true }
];

// Actions
const actions = [
  {
    name: 'Submit',
    source_state: 'Draft',
    target_state: 'Manager Review',
    side_effects: {
      effects: [
        { type: 'database', config: { method: 'send_workflow_notification_email' } }
      ]
    }
  },
  {
    name: 'Approve by Manager',
    source_state: 'Manager Review',
    target_state: 'Buyer Review',
    side_effects: {
      effects: [
        { type: 'database', config: { method: 'send_workflow_notification_email' } }
      ]
    }
  },
  {
    name: 'Approve by Buyer',
    source_state: 'Buyer Review',
    target_state: 'Delivered',
    side_effects: {
      effects: [
        { type: 'database', config: { method: 'generate_po_from_pr' } },
        { type: 'database', config: { method: 'send_workflow_notification_email' } }
      ]
    }
  }
];
```

### Invoice Workflow with Rejection Handling

```typescript
const invoiceActions = [
  {
    name: 'Submit',
    source_state: 'Draft',
    target_state: 'Submitted',
    side_effects: {
      effects: [
        { type: 'database', config: { method: 'calculate_invoice_total' } },
        { type: 'database', config: { method: 'send_workflow_notification_email' } }
      ]
    }
  },
  {
    name: 'Approve',
    source_state: 'Submitted',
    target_state: 'Approved',
    side_effects: {
      effects: [
        { type: 'database', config: { method: 'send_workflow_notification_email' } }
      ]
    }
  },
  {
    name: 'Reject',
    source_state: 'Submitted',
    target_state: 'Draft',
    side_effects: {
      effects: [
        { type: 'database', config: { method: 'handle_invoice_reject' } },
        { type: 'database', config: { method: 'send_workflow_notification_email' } }
      ]
    }
  }
];
```

### Sales Order with ERP Sync

```typescript
{
  name: 'Approve PO',
  source_state: 'PO Review',
  target_state: 'PO Approved',
  side_effects: {
    effects: [
      { type: 'database', config: { method: 'sync_po_to_erp' } },
      { type: 'database', config: { method: 'send_workflow_notification_email' } }
    ]
  }
}
```

---

## Future Enhancements

### 1. Conditional Side Effects

Execute effects based on runtime conditions:

```json
{
  "effects": [
    {
      "type": "database",
      "config": { "method": "sync_po_to_erp" },
      "conditions": {
        "field": "amount",
        "operator": "gte",
        "value": 10000
      }
    }
  ]
}
```

### 2. Parallel Side Effect Execution

Currently effects run sequentially. Add option for parallel:

```json
{
  "effects": [...],
  "execution": "parallel"  // or "sequential" (default)
}
```

### 3. Side Effect Retry Configuration

Add retry logic for external integrations:

```json
{
  "effects": [
    {
      "type": "database",
      "config": { "method": "sync_po_to_erp" },
      "retry": {
        "maxAttempts": 3,
        "backoffMs": 1000
      }
    }
  ]
}
```

### 4. Async Side Effects

Execute non-critical effects outside transaction:

```json
{
  "effects": [
    {
      "type": "database",
      "config": { "method": "send_workflow_notification_email" },
      "async": true  // Don't block transition
    }
  ]
}
```

### 5. UI Improvements

- **Visual Workflow Designer**: Drag-drop state/action builder
- **Side Effect Management UI**: Configure effects per action
- **Effect Execution Logs**: View side effect execution history
- **Dry-run Mode**: Test workflow transitions without committing

---

## Debugging Tips

### Permission Denied

1. Check user roles: `SELECT * FROM role_user WHERE user_id = ?`
2. Check state assignment: `SELECT assigned_for, assigned_role_id FROM workflow_state WHERE id = ?`
3. Verify user has role: `SELECT * FROM role WHERE id = ?`

### Workflow Not Progressing

1. Check current state: `SELECT current_state, current_state_id FROM workflow_instance WHERE id = ?`
2. Check available actions: `SELECT * FROM workflow_action WHERE source_state_id = ?`
3. Check assignment: Is user assigned to current state?

### Side Effects Not Executing

1. Check if states were skipped (side effects skip when states skip)
2. Check `executeSideEffects` config in WorkflowEngine
3. Verify method exists in `workflowActionMap`
4. Check backend logs for errors

### Data Not Showing

1. Check org_id matches user's org
2. Verify workflow instance exists
3. Check if document has `wf_instance_id` set

---

**End of Document** - Last updated: 2026-01-04
