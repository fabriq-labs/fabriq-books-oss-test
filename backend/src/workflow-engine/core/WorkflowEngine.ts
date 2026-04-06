import { Prisma } from '@prisma/client';
import { WorkflowPrismaClient } from '../types/prisma.types';
import {
  WorkflowAction,
  WorkflowContext,
  WorkflowEngineConfig,
  WorkflowInstance,
  WorkflowState,
  WorkflowTransition,
  WorkflowValidationResult,
  WorkflowHistory,
} from '../types/workflow.types';
import { PermissionService } from '../../services/permissions/PermissionService';
import { ExpressionEvaluator } from './ExpressionEvaluator';
import logger from '../../utils/logger';
import { AuthContext } from '../../auth/types';
import { ModelService } from '../../services/core/ModelService';
import { SideEffectExecutor } from './SideEffectExecutor';
export class WorkflowEngine {
  private prisma: WorkflowPrismaClient;
  private config: WorkflowEngineConfig;
  private expressionEvaluator: ExpressionEvaluator;
  private sideEffectExecutor: SideEffectExecutor;

  constructor(prisma: WorkflowPrismaClient, config: WorkflowEngineConfig = {}) {
    this.prisma = prisma;
    this.config = {
      validateConditions: true,
      executeSideEffects: true,
      logTransitions: true,
      ...config,
    };
    this.expressionEvaluator = new ExpressionEvaluator(prisma);
    this.sideEffectExecutor = new SideEffectExecutor(prisma);
  }

  async getWorkflowContextForUI(instanceId: string): Promise<any> {
    const instance = await this.prisma.workflow_instance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        flow_id: true,
        model_id: true,
        current_state_id: true,
        assigned_user_id: true,
        status: true,
        created_by: true,
        modified_by: true,
        created_at: true,
        modified_at: true,
        flow: {
          select: {
            id: true,
            model_name: true,
            name: true
          }
        },
        current_state_ref: {
          select: {
            id: true,
            name: true,
            assigned_for: true,
            assigned_user_id: true,
            assigned_role_id: true,
            assigned_expression: true,
            source_actions: {
              select: {
                id: true,
                name: true,
                target_state_id: true,
                target_state: {
                  select: {
                    id: true,
                    name: true,
                  }
                }
              }
            }
          }
        },
        history: {
          select: {
            id: true,
            performed_by: true,
            performed_at: true,
            from_state: true,
            to_state: true,
            action: {
              select: {
                id: true,
                name: true,
                target_state_id: true,
                target_state: {
                  select: {
                    id: true,
                    name: true,
                  }
                }
              }
            },
            performed_by_user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        },
        comments: {
          select: {
            id: true,
            comment: true,
            history_id: true,
            created_by: true,
            created_at: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
      }
    });
    return instance;
  }

  async getWorkflowContext(instanceId: string, authContext: AuthContext): Promise<WorkflowContext> {
    const instance = await this.prisma.workflow_instance.findUnique({
      where: { id: instanceId },
      include: {
        flow: true,
        history: true,
        comments: true,
      },
    });

    if (!instance) {
      throw new Error(`Workflow instance ${instanceId} not found`);
    }

    const currentState = await this.prisma.workflow_state.findFirst({
      where: { flow_id: instance.flow_id, name: instance.current_state },
    });

    if (!currentState) {
      throw new Error(`Current state ${instance.current_state} not found`);
    }

    const availableActions = await this.prisma.workflow_action.findMany({
      where: { source_state_id: currentState.id },
    });


    // Get user roles from PermissionService
    const roles = await PermissionService.getRoles(authContext.user.id);

    return {
      authContext: authContext,
      instance: {
        ...instance,
        model_name: instance.flow.model_name,
        modified_at: instance.modified_at
      } as WorkflowInstance,
      currentState: {
        ...(currentState as any),  // cast to workaround prisma as it is not properly generated
        entry_conditions: currentState.entry_conditions as Record<string, any> | null,
        exit_conditions: currentState.exit_conditions as Record<string, any> | null,
        modified_at: currentState.modified_at
      } as WorkflowState,
      availableActions: availableActions.map((action: any) => ({
        ...action,
        conditions: action.conditions as Record<string, any> | null,
        side_effects: action.side_effects as Record<string, any> | null,
        modified_at: action.modified_at
      })) as WorkflowAction[],
      history: instance.history.map((history: any) => ({
        ...history,
        metadata: history.metadata as Record<string, any> | null
      })) as WorkflowHistory[],
      user: {
        id: authContext.user.id,
        roles: roles.map((role: { id: string }) => role.id),
      },
    };
  }

  async validateTransition(
    context: WorkflowContext,
    action: WorkflowAction,
    metadata?: Record<string, any>
  ): Promise<WorkflowValidationResult> {
    const errors: string[] = [];

    // Check if action is available in current state
    if (!context.availableActions.some((a) => a.id === action.id)) {
      errors.push(`Action ${action.name} is not available in current state`);
    }

    // Check authorization based on assigned_for
    const state = context.currentState;
    switch (state.assigned_for) {
      case 'USER':
        // If the action is assigned to a user, check if the user is the assigned user or the creator of the instance
        if (state.assigned_user_id !== context.user.id && context.instance.created_by !== context.user.id) {
          errors.push(`User ${context.user.id} is not authorized to perform this action`);
        }
        break;

      case 'ROLE':
        if (state.assigned_role_id && !context.user.roles.includes(state.assigned_role_id)) {
          errors.push(`User ${context.user.id} does not have required role`);
        }
        break;

      case 'EXPRESSION':
        if (state.assigned_expression) {
          const authorizedUserId = await this.expressionEvaluator.evaluateExpression(
            state.assigned_expression,
            {
              modelType: context.instance.model_name,
              modelId: context.instance.model_id,
              orgId: context.instance.org_id
            }
          );
          if (authorizedUserId !== context.user.id) {
            errors.push(`User ${context.user.id} is not authorized by expression`);
          }
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Recursively skip states that have skip=true until reaching a non-skipped state
   * @param stateId The state to check
   * @param skippedStates Array to track skipped state IDs
   * @returns The final non-skipped state ID, or null if we hit a final state or error
   */
  private async resolveSkipChain(
    stateId: string,
    skippedStates: string[],
    visitedStates: Set<string> = new Set()
  ): Promise<{ finalStateId: string; skippedStateIds: string[] } | null> {
    // Prevent infinite loops
    if (visitedStates.has(stateId)) {
      throw new Error(`Circular skip chain detected: state ${stateId} is being skipped in a loop`);
    }
    visitedStates.add(stateId);

    const state = await this.prisma.workflow_state.findUnique({
      where: { id: stateId },
      include: {
        source_actions: {
          include: {
            target_state: true
          }
        }
      }
    });

    if (!state) {
      throw new Error(`State ${stateId} not found`);
    }

    // If state is not skipped, return it
    if (!(state as any).skip) {
      return {
        finalStateId: stateId,
        skippedStateIds: skippedStates
      };
    }

    // State is skipped, add to skipped list
    skippedStates.push(stateId);

    // Determine next state to skip to
    let nextStateId: string | null = null;

    if ((state as any).skip_target_state_id) {
      // User specified target state
      nextStateId = (state as any).skip_target_state_id;
    } else {
      // Auto-determine from actions
      const actions = state.source_actions || [];
      
      if (actions.length === 0) {
        throw new Error(`State ${state.name} (${stateId}) is marked to skip but has no outgoing actions`);
      }
      
      if (actions.length === 1) {
        // Single action, use its target
        nextStateId = actions[0].target_state_id;
      } else {
        // Multiple actions, but no skip_target_state_id specified
        throw new Error(
          `State ${state.name} (${stateId}) is marked to skip and has multiple actions. ` +
          `Please specify skip_target_state_id to indicate which state to skip to.`
        );
      }
    }

    if (!nextStateId) {
      throw new Error(`Could not determine next state to skip to for state ${stateId}`);
    }

    // Recursively continue skipping
    return this.resolveSkipChain(nextStateId, skippedStates, visitedStates);
  }

  private async evaluateAssignedUser(
    state: WorkflowState,
    modelType: string,
    modelId: string,
    orgId: string,
    startedBy?: any
  ): Promise<string | null> {
    let assignedUserId: string | null = null;

    if (state.assigned_for === 'USER') {
      if (state.assigned_user_id) {
        assignedUserId = state.assigned_user_id;
      } else if (startedBy) {
        assignedUserId = startedBy.id;
      } else {
        assignedUserId = null;
      }
    } else if (state.assigned_for === 'EXPRESSION' && state.assigned_expression) {
      try {
        const evaluatedUserId = await this.expressionEvaluator.evaluateExpression(
          state.assigned_expression,
          {
            modelType,
            modelId,
            orgId
          }
        );

        // Ensure the evaluated result is a valid user ID
        if (typeof evaluatedUserId === 'string') {
          assignedUserId = evaluatedUserId;
        } else {
          logger.error('Invalid user ID returned from expression', {
            modelType: modelType,
            modelId: modelId,
            orgId: orgId,
            expression: state.assigned_expression,
            evaluatedUserId: evaluatedUserId,
            stateId: state.id
          });
          throw new Error('Expression did not return a valid user ID');
        }
      } catch (error) {
        logger.error('Error evaluating expression for state assignment', {
          error,
          expression: state.assigned_expression,
          stateId: state.id
        });
        throw new Error('Failed to evaluate state assignment expression');
      }
    }

    return assignedUserId;
  }

  async executeTransition(
    context: WorkflowContext,
    action: WorkflowAction,
    authContext: AuthContext,
    metadata?: Record<string, any>
  ): Promise<WorkflowTransition> {
    // Validate the transition
    const validation = await this.validateTransition(context, action, metadata);
    if (!validation.isValid) {
      throw new Error(`Invalid transition: ${validation.errors?.join(', ')}`);
    }

    // Get target state
    const targetState = await this.prisma.workflow_state.findUnique({
      where: { id: action.target_state_id },
    });

    if (!targetState) {
      throw new Error(`Target state ${action.target_state_id} not found`);
    }

    // Check if target state should be skipped and resolve the skip chain
    const skippedStates: string[] = [];
    let finalStateId = action.target_state_id;
    
    if ((targetState as any).skip) {
      const skipResult = await this.resolveSkipChain(action.target_state_id, skippedStates);
      if (!skipResult) {
        throw new Error(`Failed to resolve skip chain for state ${action.target_state_id}`);
      }
      finalStateId = skipResult.finalStateId;
    }

    // Get the final state (after skipping)
    const finalState = await this.prisma.workflow_state.findUnique({
      where: { id: finalStateId },
    });

    if (!finalState) {
      throw new Error(`Final state ${finalStateId} not found after skip chain resolution`);
    }

    // Cast the final state to WorkflowState type
    const workflowState: WorkflowState = {
      ...(finalState as any),
      entry_conditions: finalState.entry_conditions as Record<string, any> | null,
      exit_conditions: finalState.exit_conditions as Record<string, any> | null,
      skip: (finalState as any).skip,
      skip_target_state_id: (finalState as any).skip_target_state_id,
      modified_at: finalState.modified_at
    };

    // Resolve assigned user if needed (for the final state, not the skipped one)
    const assignedUserId = await this.evaluateAssignedUser(
      workflowState,
      context.instance.model_name,
      context.instance.model_id,
      context.instance.org_id || ''
    );

    // Execute side effects inside the transaction (moved below)

    // Wrap database operations in a transaction
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create history record (note: to_state is the final state after skipping, not the immediate target)
      const history = await tx.workflow_history.create({
        data: {
          instance: {
            connect: { id: context.instance.id }
          },
          action: {
            connect: { id: action.id }
          },
          from_state: context.currentState.name,
          to_state: finalState.name,
          performed_by_name: authContext.user.name,
          performed_by_email: authContext.user.email,
          org_id: authContext.user.org_id,
          metadata,
          skipped_states: skippedStates.length > 0 ? skippedStates : null,
          from_state_ref: {
            connect: { id: context.currentState.id }
          },
          to_state_ref: {
            connect: { id: finalStateId }
          },
          performed_by_user: {
            connect: { id: authContext.user.id }
          }
        } as any,
      });

      if (metadata?.comment) {
        await this.addComment(context.instance.id, metadata.comment, authContext, history.id, tx as any);
      }

      // Update instance state and assigned user (use final state after skipping)
      const updatedInstance = await tx.workflow_instance.update({
        where: { id: context.instance.id },
        data: {
          current_state: finalState.name,
          current_state_ref: {
            connect: { id: finalStateId }
          },
          assigned_user_id: assignedUserId,
          status: finalState.is_final ? 'completed' : 'active',
          modified_at: new Date(),
          modified_by: authContext.user.id
        },
      });

      context.instance = {
        ...updatedInstance,
        model_name: context.instance.model_name,
        modified_at: updatedInstance.modified_at
      } as WorkflowInstance;

      // Only execute side effects if we didn't skip any states
      // (Side effects are skipped when states are skipped)
      if (skippedStates.length === 0) {
        logger.info('Executing side effects', {
          effectsCount: Array.isArray(action.side_effects) ? action.side_effects.length : 0,
          instanceId: context.instance.id,
          model: context.instance.model_name,
          userId: authContext.user.id
        });
        // Execute side effects at the end within the same transaction so failures rollback everything
        if (this.config.executeSideEffects && action.side_effects) {
          await this.sideEffectExecutor.execute(
            action.side_effects as any[],
            context,
            authContext,
            tx
          );
        }
      } else {
        logger.info('Skipping side effects because states were skipped', {
          skippedStates,
          instanceId: context.instance.id,
          model: context.instance.model_name
        });
      }

      return {
        history,
        updatedInstance
      };
    });

    return {
      action,
      fromState: {
        ...context.currentState,
        entry_conditions: context.currentState.entry_conditions as Record<string, any> | null,
        exit_conditions: context.currentState.exit_conditions as Record<string, any> | null,
        modified_at: context.currentState.modified_at
      } as WorkflowState,
      toState: workflowState,
      instance: {
        ...result.updatedInstance,
        model_name: context.instance.model_name,
        modified_at: result.updatedInstance.modified_at
      } as WorkflowInstance,
      history: {
        ...result.history,
        metadata: result.history.metadata as Record<string, any> | null,
        skipped_states: skippedStates.length > 0 ? skippedStates : null
      } as WorkflowHistory,
      performedBy: authContext.user.id,
      metadata
    };
  }

  /**
   * Creates a workflow instance in the initial state, but does not perform the first transition.
   * Looks up the flow by modelName (there is only one flow per model).
   * @param modelName
   * @param modelId
   * @param startedBy
   * @returns WorkflowInstance
   */
  public async createWorkflowInstance(
    modelName: string,
    modelId: string,
    startedBy: any,
    tx?: any
  ): Promise<WorkflowInstance> {
    // Lookup the flow by modelName
    const flow = await (tx || this.prisma).workflow_flow.findFirst({
      where: { model_name: modelName },
      select: {
        id: true,
        model_name: true,
        org_id: true,
        states: {
          where: { is_initial: true },
          select: {
            id: true,
            name: true,
            description: true,
            is_initial: true,
            is_final: true,
            entry_conditions: true,
            exit_conditions: true,
            assigned_for: true,
            assigned_user_id: true,
            assigned_role_id: true,
            assigned_expression: true
          }
        }
      }
    });

    if (!flow) {
      throw new Error(`Workflow flow for model ${modelName} not found`);
    }

    // Check if model already has a workflow instance
    const prismaClient = tx || this.prisma;
    const existingModel = await (prismaClient as any)[flow.model_name].findUnique({
      where: { id: modelId },
      select: { wf_instance_id: true }
    });

    if (existingModel?.wf_instance_id) {
      throw new Error(`Model ${modelId} already has an associated workflow instance`);
    }

    const initialState = flow.states[0];
    if (!initialState) {
      throw new Error(`No initial state found for workflow for model ${modelName}`);
    }

    // Evaluate assigned user for the initial state
    let assignedUserId = await this.evaluateAssignedUser(
      initialState as any as WorkflowState,
      flow.model_name,
      modelId,
      startedBy.org_id
    );

    if (!assignedUserId) {
      assignedUserId = startedBy.id;
    }

    // Create workflow instance
    const instance = await (tx || this.prisma).workflow_instance.create({
      data: {
        flow_id: flow.id,
        model_id: modelId,
        current_state: initialState.name,
        current_state_id: initialState.id,
        assigned_user_id: assignedUserId,
        status: 'active',
        created_by: startedBy.id,
        modified_by: startedBy.id,
        org_id: startedBy.org_id
      },
    });

    // Update the model with the workflow instance ID
    await (tx || this.prisma)[flow.model_name].update({
      where: { id: modelId },
      data: {
        wf_instance_id: instance.id
      }
    });

    return {
      ...instance,
      model_name: flow.model_name,
      modified_at: instance.modified_at
    } as WorkflowInstance;
  }

  /**
   * Performs the first transition for a workflow instance, creating the history record and updating the state.
   * @param instanceId
   * @param performedBy
   * @param metadata
   * @returns WorkflowTransition
   */
  public async makeFirstTransition(
    instanceId: string,
    performedBy: any,
    metadata?: Record<string, any>
  ): Promise<WorkflowTransition> {
    // Get the instance and its flow
    const instance = await this.prisma.workflow_instance.findUnique({
      where: { id: instanceId },
      include: {
        flow: {
          select: {
            id: true,
            model_name: true,
            org_id: true,
            states: true
          }
        },
        current_state_ref: true
      }
    });
    if (!instance) {
      throw new Error(`Workflow instance ${instanceId} not found`);
    }
    const initialState = instance.current_state_ref;
    if (!initialState) {
      throw new Error(`Initial state not found for instance ${instanceId}`);
    }
    // Get the first action from the initial state
    const actions = await this.prisma.workflow_action.findMany({
      where: { source_state_id: initialState.id },
      take: 1,
    });
    const firstAction = actions[0];
    if (!firstAction) {
      throw new Error(`No action found for initial state ${initialState.id}`);
    }
    // Get the target state for the first action
    const firstState = await this.prisma.workflow_state.findUnique({
      where: { id: firstAction.target_state_id },
    });
    if (!firstState) {
      throw new Error(`Target state ${firstAction.target_state_id} not found`);
    }
    // Evaluate assigned user for the first state
    const assignedUserId = await this.evaluateAssignedUser(
      firstState as any as WorkflowState,
      instance.flow.model_name,
      instance.model_id,
      instance.org_id || ''
    );
    // Transaction: update instance and create history
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update instance state and assigned user
      const updatedInstance = await tx.workflow_instance.update({
        where: { id: instance.id },
        data: {
          current_state: firstState.name,
          current_state_id: firstState.id,
          assigned_user_id: assignedUserId,
          status: firstState.is_final ? 'completed' : 'active',
          modified_at: new Date(),
          modified_by: performedBy.id
        },
      });
      // Create initial history record showing transition from initial state to first state
      const history = await tx.workflow_history.create({
        data: {
          instance: {
            connect: { id: instance.id }
          },
          action: {
            connect: { id: firstAction.id }
          },
          from_state: initialState.name,
          to_state: firstState.name,
          org_id: performedBy.org_id,
          metadata,
          from_state_ref: {
            connect: { id: initialState.id }
          },
          to_state_ref: {
            connect: { id: firstState.id }
          },
          performed_by_user: {
            connect: { id: performedBy.id }
          }
        },
      });
      return {
        updatedInstance,
        history
      };
    });
    return {
      action: {
        ...firstAction,
        conditions: firstAction.conditions as Record<string, any> | null,
        side_effects: firstAction.side_effects as Record<string, any> | null,
        modified_at: firstAction.modified_at
      } as WorkflowAction,
      fromState: initialState as any as WorkflowState,
      toState: firstState as any as WorkflowState,
      instance: {
        ...result.updatedInstance,
        model_name: instance.flow.model_name,
        modified_at: result.updatedInstance.modified_at
      } as WorkflowInstance,
      history: {
        ...result.history,
        metadata: result.history.metadata as Record<string, any> | null
      } as WorkflowHistory,
      performedBy: performedBy.id,
      metadata
    };
  }

  /**
   * Backward compatible: creates a workflow instance and performs the first transition.
   * @param flowId
   * @param modelId
   * @param startedBy
   * @param metadata
   * @returns WorkflowInstance
   */
  public async startWorkflow(
    flowId: string,
    modelId: string,
    startedBy: any,
    metadata?: Record<string, any>,
    authContext?: AuthContext
  ): Promise<WorkflowInstance> {


    // Create the instance
    const instance = await this.createWorkflowInstance(flowId, modelId, startedBy, authContext);
    // Perform the first transition
    await this.makeFirstTransition(instance.id, startedBy, metadata);
    // Return the updated instance (after first transition)
    const updatedInstance = await this.prisma.workflow_instance.findUnique({
      where: { id: instance.id },
    });
    return {
      ...updatedInstance,
      model_name: instance.model_name,
      modified_at: updatedInstance?.modified_at
    } as WorkflowInstance;
  }

  async getAvailableActions(instanceId: string, authContext: AuthContext): Promise<WorkflowAction[]> {
    const context = await this.getWorkflowContext(instanceId, authContext);
    return context.availableActions;
  }

  async getWorkflowHistory(instanceId: string): Promise<WorkflowHistory[]> {
    const history = await this.prisma.workflow_history.findMany({
      where: { instance_id: instanceId },
      orderBy: { performed_at: 'asc' },
    });
    return history.map((h: any) => ({
      ...h,
      metadata: h.metadata as Record<string, any> | null
    })) as WorkflowHistory[];
  }

  async getWorkflowInstancesByState(stateId: string, userId: string, userRoleIds: string[]): Promise<any[]> {
    try {
      const state = await this.prisma.workflow_state.findUnique({
        where: { id: stateId },
        include: { assigned_role: true }
      });

      if (!state) {
        throw new Error('Workflow state not found');
      }

      let where: any = {
        current_state_id: stateId,
        status: 'active'
      };

      // Add access conditions based on assignment type
      switch (state.assigned_for) {
        case 'USER':
          where.assigned_user_id = userId;
          break;

        case 'ROLE':
          if (!state.assigned_role_id || !userRoleIds.includes(state.assigned_role_id)) {
            throw new Error('User does not have the required role for this state');
          }
          break;

        case 'EXPRESSION':
          where.assigned_user_id = userId;
          break;
      }

      const instances = await this.prisma.workflow_instance.findMany({
        where,
        include: {
          flow: true,
          current_state_ref: true
        }
      });

      return instances.map((instance: any) => ({
        ...instance,
        modified_at: instance.modified_at,
        flow: instance.flow ? {
          ...instance.flow,
          modified_at: instance.flow.modified_at
        } : null,
        current_state_ref: instance.current_state_ref ? {
          ...instance.current_state_ref,
          modified_at: instance.current_state_ref.modified_at
        } : null
      }));
    } catch (error) {
      logger.error('Error fetching workflow instances by state', { error, stateId });
      throw error;
    }
  }


  private async getSelectFromView(
    modelName: string,
    viewName?: string,
    options?: { select?: any }
  ): Promise<{ select?: any; dataGraph?: any }> {
    // 1. Fetch the view
    const view = await PermissionService.getView(viewName ?? null, modelName);
    const dataGraph = view?.data_graph as { select?: any } | null;

    // 2. Prefer user-provided select
    let select = options?.select;

    // 3. Parse from dataGraph if not provided
    if (!select && dataGraph) {
      const { LegacyDataGraphParser } = await import('../../utils/LegacyDataGraphParser');
      select = dataGraph.select || LegacyDataGraphParser.parseToSelect(dataGraph);
    }

    // console.log('-----****----dataGraph', dataGraph);

    return { select, dataGraph };
  }

  // TODO: This is a temporary solution to get the workflow instances by model.
  // It should be replaced with a more efficient query. Get the view using permission service and send only the columns in datagraph.
  async getWorkflowInstancesByModel(modelName: string, userId: string, userRoleIds: string[], orgId?: string): Promise<any> {

    const { select, dataGraph } = await this.getSelectFromView(
      modelName,
      'workflow',
    );
    const assignedToList = await this.prisma.workflow_instance.findMany({
      select: select,
      where: {
        flow: {
          model_name: modelName
        },
        status: 'active',
        assigned_user_id: userId,
        org_id: orgId,
        // current_state is not equal to 'Draft'
        NOT: {
          current_state: 'Draft'
        }
      }
    })
    const roleBasedList = await this.prisma.workflow_instance.findMany({
      select: select,
      where: {
        status: 'active',
        flow: {
          model_name: modelName,
        },
        org_id: orgId,
        current_state_ref: {
          assigned_for: 'ROLE',
          assigned_role_id: { in: userRoleIds },
        },
      },
    })
    const createdByList = await this.prisma.workflow_instance.findMany({
      select: select,
      where: {
        status: { in: ['active', 'completed'] },
        created_by: userId,
        flow: {
          model_name: modelName,
        },
        org_id: orgId,
      },
    });
    return { createdByList, assignedToList, roleBasedList };
  }

  async getComments(instanceId: string): Promise<any[]> {
    const comments = await this.prisma.comment.findMany({
      where: { wf_instance_id: instanceId },
    });
    return comments;
  }

  async addComment(instanceId: string, comment: string, authContext: AuthContext, historyId?: string, tx?: any): Promise<any> {
    try {
      const newComment = await (tx || this.prisma).comment.create({
        data: {
          comment: comment,
          org_id: authContext.user.org_id,
          user: {
            connect: { id: authContext.user.id }
          },
          wf_instance: {
            connect: { id: instanceId }
          },
          ...(historyId && {
            history_id: historyId
          })
        }
      });
      return newComment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  async getHistory(modelName: string, instanceId: string): Promise<any[]> {
    const history = await this.prisma.workflow_history.findMany({
      where: { instance_id: instanceId },
    });
    return history;
  }
} 
