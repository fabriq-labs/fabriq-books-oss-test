import { Router, Request, Response } from 'express';
import { WorkflowEngine } from '../core/WorkflowEngine';
import prisma from '../../lib/prisma';
import { WorkflowDefinitionService } from '../core/WorkflowDefinitionService';
import { WorkflowPrismaClient } from '../types/prisma.types';
import { PrismaClient } from '@prisma/client';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import { PermissionService } from '../../services/permissions/PermissionService';
import { requirePlatformAdmin } from '../../auth/platformAdmin';
import { isNotFoundError } from '../../tenancy/errors';

function sendWorkflowError(res: Response, error: unknown, label: string) {
  if (isNotFoundError(error)) {
    return res.status(404).json({ error: 'Not found' });
  }
  logger.error(label, { error });
  return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
}

interface AuthRequest extends Request {
  context?: {
    auth?: AuthContext;
  };
}

const router = Router();
const workflowEngine = new WorkflowEngine(prisma);
const workflowDefinitionService = new WorkflowDefinitionService(prisma);

router.use((req: AuthRequest, res, next) => {
  const definitionWrite = req.path.startsWith('/flows') && req.method !== 'GET' && req.method !== 'HEAD';
  if (!definitionWrite) return next();
  return requirePlatformAdmin(req, res, next);
});

// Create a new workflow definition
router.post('/flows', async (req: AuthRequest, res) => {
  try {
    const { name, model_name, description, org_id } = req.body;
    const callerOrg = req.context?.auth?.user?.org_id;
    const flow = await workflowDefinitionService.createWorkflowFlow(
      name,
      model_name,
      description,
      org_id || callerOrg
    );
    res.json(flow);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error creating workflow flow');
  }
});

// Get all workflow definitions
router.get('/flows', async (req: AuthRequest, res) => {
  try {
    const orgId = req.context?.auth?.user?.org_id;
    const flows = await workflowDefinitionService.getWorkflowFlows(orgId);
    res.json(flows);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow flows');
  }
});

// Get workflow by ID
router.get('/flows/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const flow = await workflowDefinitionService.getWorkflowFlowById(flowId);
    const orgId = (req as AuthRequest).context?.auth?.user?.org_id;

    if (!flow || (orgId && flow.org_id !== orgId && flow.org_id !== 'org_system')) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ data: flow });
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow flow');
  }
});

// Add a state to a workflow
router.post('/flows/:flowId/states', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { name, description, is_initial, is_final, entry_conditions, exit_conditions } = req.body;
    const state = await workflowDefinitionService.createWorkflowState(flowId, {
      name,
      description,
      is_initial,
      is_final,
      entry_conditions,
      exit_conditions,
    });
    res.json(state);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error creating workflow state');
  }
});

// Update a workflow state
router.put('/flows/:flowId/states/:stateId', async (req, res) => {
  try {
    const { stateId } = req.params;
    const {
      name,
      description,
      sequence,
      is_initial,
      is_final,
      is_active,
      skip,
      skip_target_state_id,
      entry_conditions,
      exit_conditions,
      assigned_for,
      assigned_role_id,
      assigned_user_id,
      assigned_expression
    } = req.body;

    const state = await workflowDefinitionService.updateWorkflowState(stateId, {
      name,
      description,
      sequence,
      is_initial,
      is_final,
      is_active,
      skip,
      skip_target_state_id,
      entry_conditions,
      exit_conditions,
      assigned_for,
      assigned_role_id,
      assigned_user_id,
      assigned_expression
    });
    res.json(state);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error updating workflow state');
  }
});

// Batch update multiple workflow states (for reordering, bulk updates)
router.put('/flows/:flowId/states', async (req, res) => {
  try {
    const { states } = req.body;

    if (!Array.isArray(states) || states.length === 0) {
      return res.status(400).json({ error: 'states array is required and must not be empty' });
    }

    const updatedStates = await workflowDefinitionService.batchUpdateWorkflowStates(states);
    res.json(updatedStates);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error batch updating workflow states');
  }
});

// Toggle active status of a workflow state
router.patch('/flows/:flowId/states/:stateId/toggle-active', async (req, res) => {
  try {
    const { stateId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean value' });
    }

    const state = await workflowDefinitionService.updateWorkflowState(stateId, {
      is_active
    });
    res.json(state);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error toggling workflow state active status');
  }
});

// Add an action to a workflow
router.post('/flows/:flowId/actions', async (req, res) => {
  try {
    const { name, description, source_state_id, target_state_id, conditions, side_effects } = req.body;
    const action = await workflowDefinitionService.createWorkflowAction({
      name,
      description,
      source_state_id,
      target_state_id,
      conditions,
      side_effects,
    });
    res.json(action);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error creating workflow action');
  }
});

// Update a workflow action
router.put('/flows/:flowId/states/:stateId/actions/:actionId', async (req, res) => {
  try {
    const { actionId } = req.params;
    const { name, description, target_state_id, conditions, side_effects } = req.body;

    const action = await workflowDefinitionService.updateWorkflowAction(actionId, {
      name,
      description,
      target_state_id,
      conditions,
      side_effects,
    });
    res.json(action);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error updating workflow action');
  }
});

// Delete a workflow action
router.delete('/flows/:flowId/states/:stateId/actions/:actionId', async (req, res) => {
  try {
    const { actionId } = req.params;
    await workflowDefinitionService.deleteWorkflowAction(actionId);
    res.json({ success: true });
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error deleting workflow action');
  }
});

// Following are the routes for the workflow instance life cycle

// Start a workflow instance
router.post('/instances', async (req: AuthRequest, res: Response) => {
  try {
    const { flow_id, model_id, metadata } = req.body;
    const user = req.context?.auth?.user;

    if (!flow_id || !model_id) {
      return res.status(400).json({ error: 'flow_id and model_id are required' });
    }
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const instance = await workflowEngine.startWorkflow(flow_id, model_id, req.context?.auth as AuthContext, metadata);
    res.json(instance);
  } catch (error: unknown) {
    console.log('error', error);
    return sendWorkflowError(res, error, 'Error starting workflow instance');
  }
});

// Get workflow instance details
router.get('/instances/:instanceId', async (req: AuthRequest, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.context?.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const context = await workflowEngine.getWorkflowContext(instanceId, req.context?.auth as AuthContext);
    res.json(context);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow context');
  }
});

// Execute a workflow action
router.post('/instances/:instanceId/actions/:actionId', async (req: AuthRequest, res) => {
  try {
    const { instanceId, actionId } = req.params;
    const { metadata } = req.body;
    const userId = req.context?.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const context = await workflowEngine.getWorkflowContext(instanceId, req.context?.auth as AuthContext);
    const action = context.availableActions.find(a => a.id === actionId);

    if (!action) {
      return res.status(400).json({ error: 'Action not available in current state' });
    }

    const transition = await workflowEngine.executeTransition(context, action, req.context?.auth as AuthContext, metadata);
    res.json(transition);
  } catch (error: unknown) {
    console.log('error', error);
    return sendWorkflowError(res, error, 'Error executing workflow action');
  }
});

// Get workflow history
router.get('/instances/:instanceId/history', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const user = (req as AuthRequest).context?.auth?.user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const history = await workflowEngine.getWorkflowHistory(instanceId, user.org_id);
    res.json(history);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow history');
  }
});

// Get available actions for current state
router.get('/instances/:instanceId/actions', async (req: AuthRequest, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.context?.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const actions = await workflowEngine.getAvailableActions(instanceId, req.context?.auth as AuthContext);
    res.json(actions);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching available actions');
  }
});

// Get all workflow instances in a specific state
router.get('/instances/state/:stateId', async (req: AuthRequest, res) => {
  try {
    const { stateId } = req.params;
    const userId = req.context?.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's roles
    const userRoles = await PermissionService.getRoles(userId);
    const userRoleIds = userRoles.map((role: { id: string }) => role.id);

    const orgId = req.context?.auth?.user?.org_id;
    if (!orgId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const instances = await workflowEngine.getWorkflowInstancesByState(stateId, userId, userRoleIds, orgId);
    res.json({ data: instances });
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow instances by state');
  }
});

// Get comments for a workflow instance
router.get('/instances/:instanceId/comments', async (req: AuthRequest, res) => {
  try {
    const { instanceId } = req.params;
    const orgId = req.context?.auth?.user?.org_id;
    if (!orgId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const comments = await workflowEngine.getComments(instanceId, orgId);
    res.json({ data: comments });
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching comments');
  }
});

router.post('/instances/:instanceId/comments', async (req: AuthRequest, res) => {
  try {
    const { instanceId } = req.params;
    const { comment } = req.body;
    console.log('comment', comment);
    const comments = await workflowEngine.addComment(instanceId, comment, req.context?.auth as AuthContext);
    res.json({ data: comments });
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error adding comment');
  }
});

// Get all workflow instances for a specific user and model
router.get('/instances/:modelName/state', async (req: AuthRequest, res) => {
  try {
    const { modelName } = req.params;
    const userId = req.context?.auth?.user?.id;
    const orgId = req.context?.auth?.user?.org_id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's roles
    const userRoles = await PermissionService.getRoles(userId);
    const userRoleIds = userRoles.map((role: { id: string }) => role.id);

    const instances = await workflowEngine.getWorkflowInstancesByModel(modelName, userId, userRoleIds, orgId);
    res.json(instances);
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow instances by state');
  }
});

// Get history for a model instance
router.get('/instances/:modelName/:instanceId/history', async (req: AuthRequest, res) => {
  try {
    const { modelName, instanceId } = req.params;
    const orgId = req.context?.auth?.user?.org_id;
    if (!orgId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const history = await workflowEngine.getHistory(modelName, instanceId, orgId);
    res.json({ data: history });
  } catch (error: unknown) {
    return sendWorkflowError(res, error, 'Error fetching workflow history');
  }
});

export default router; 