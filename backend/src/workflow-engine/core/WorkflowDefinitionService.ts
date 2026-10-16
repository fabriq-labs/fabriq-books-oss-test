import { WorkflowPrismaClient } from '../types/prisma.types';
import { WorkflowFlow, WorkflowState, WorkflowAction } from '../types/workflow.types';
import logger from '../../utils/logger';
import { ORG_SYSTEM } from '../../tenancy/orgScope';

export class WorkflowDefinitionService {
  private prisma: WorkflowPrismaClient;

  constructor(prisma: WorkflowPrismaClient) {
    this.prisma = prisma;
  }

  private mapState(state: any): WorkflowState {
    return {
      ...state,
      modified_at: state.modified_at
    };
  }

  private mapFlow(flow: any): WorkflowFlow {
    return {
      ...flow,
      modified_at: flow.modified_at,
      states: flow.states?.map(this.mapState.bind(this)) || []
    };
  }

  private mapAction(action: any): WorkflowAction {
    return {
      ...action,
      modified_at: action.modified_at
    };
  }

  async createWorkflowFlow(name: string, model_name: string, description?: string, orgId?: string): Promise<WorkflowFlow> {
    try {
      if (!name || !model_name) {
        throw new Error('Name and model_name are required');
      }

      const flow = await this.prisma.workflow_flow.create({
        data: {
          name,
          model_name,
          description,
          org_id: orgId,
        },
      });

      return this.mapFlow(flow);
    } catch (error) {
      logger.error('Error creating workflow flow', { error });
      throw error;
    }
  }

  async getWorkflowFlows(orgId?: string): Promise<WorkflowFlow[]> {
    try {
      const flows = await this.prisma.workflow_flow.findMany({
        where: orgId ? { OR: [{ org_id: orgId }, { org_id: ORG_SYSTEM }] } : undefined,
        include: {
          states: {
            orderBy: [{ sequence: 'asc' }, { created_at: 'asc' }],
          },
        },
      });

      return flows.map(this.mapFlow.bind(this));
    } catch (error) {
      logger.error('Error fetching workflow flows', { error });
      throw error;
    }
  }

  async createWorkflowState(
    flowId: string,
    data: {
      name: string;
      description?: string;
      sequence?: number;
      is_initial?: boolean;
      is_final?: boolean;
      skip?: boolean;
      skip_target_state_id?: string | null;
      entry_conditions?: Record<string, any>;
      exit_conditions?: Record<string, any>;
      assigned_for?: string;
      assigned_role_id?: string;
      assigned_user_id?: string;
      assigned_expression?: string;
    }
  ): Promise<WorkflowState> {
    try {
      if (!data.name) {
        throw new Error('Name is required');
      }

      // Validate: Cannot skip initial or final states
      if (data.skip && (data.is_initial || data.is_final)) {
        throw new Error('Cannot skip initial or final states');
      }

      const state = await this.prisma.workflow_state.create({
        data: {
          flow_id: flowId,
          ...data,
        },
      });

      return this.mapState(state);
    } catch (error) {
      logger.error('Error creating workflow state', { error });
      throw error;
    }
  }

  async updateWorkflowState(
    stateId: string,
    data: {
      name?: string;
      description?: string;
      sequence?: number;
      is_initial?: boolean;
      is_final?: boolean;
      is_active?: boolean;
      skip?: boolean;
      skip_target_state_id?: string | null;
      entry_conditions?: Record<string, any>;
      exit_conditions?: Record<string, any>;
      assigned_for?: string;
      assigned_role_id?: string;
      assigned_user_id?: string;
      assigned_expression?: string;
    }
  ): Promise<WorkflowState> {
    try {
      // Get current state to check if it's initial or final
      const currentState = await this.prisma.workflow_state.findUnique({
        where: { id: stateId },
      });

      if (!currentState) {
        throw new Error(`State ${stateId} not found`);
      }

      // Validate: Cannot skip initial or final states
      const isInitial = data.is_initial !== undefined ? data.is_initial : currentState.is_initial;
      const isFinal = data.is_final !== undefined ? data.is_final : currentState.is_final;
      const shouldSkip = data.skip !== undefined ? data.skip : currentState.skip;

      if (shouldSkip && (isInitial || isFinal)) {
        throw new Error('Cannot skip initial or final states');
      }

      // Validate: If skip is true and multiple actions exist, skip_target_state_id must be provided
      if (shouldSkip && !data.skip_target_state_id && !currentState.skip_target_state_id) {
        const actions = await this.prisma.workflow_action.findMany({
          where: { source_state_id: stateId },
        });

        if (actions.length > 1) {
          throw new Error(
            `State has ${actions.length} outgoing actions. ` +
            `Please specify skip_target_state_id to indicate which state to skip to.`
          );
        }
      }

      const state = await this.prisma.workflow_state.update({
        where: { id: stateId },
        data,
      });

      return this.mapState(state);
    } catch (error) {
      logger.error('Error updating workflow state', { error });
      throw error;
    }
  }

  async createWorkflowAction(data: {
    name: string;
    description?: string;
    source_state_id: string;
    target_state_id: string;
    conditions?: Record<string, any>;
    side_effects?: Record<string, any>;
  }): Promise<WorkflowAction> {
    try {
      if (!data.name || !data.source_state_id || !data.target_state_id) {
        throw new Error('Name, source_state_id, and target_state_id are required');
      }

      const action = await this.prisma.workflow_action.create({
        data,
      });

      return this.mapAction(action);
    } catch (error) {
      logger.error('Error creating workflow action', { error });
      throw error;
    }
  }

  async updateWorkflowAction(
    actionId: string,
    data: {
      name?: string;
      description?: string;
      target_state_id?: string;
      conditions?: Record<string, any>;
      side_effects?: Record<string, any>;
    }
  ): Promise<WorkflowAction> {
    try {
      const action = await this.prisma.workflow_action.update({
        where: { id: actionId },
        data,
      });

      return this.mapAction(action);
    } catch (error) {
      logger.error('Error updating workflow action', { error });
      throw error;
    }
  }

  async deleteWorkflowAction(actionId: string): Promise<void> {
    try {
      await this.prisma.workflow_action.delete({
        where: { id: actionId },
      });
    } catch (error) {
      logger.error('Error deleting workflow action', { error });
      throw error;
    }
  }

  async getWorkflowFlowById(flowId: string): Promise<WorkflowFlow | null> {
    try {
      const flow = await this.prisma.workflow_flow.findUnique({
        where: {
          id: flowId,
        },
        include: {
          states: {
            orderBy: [{ sequence: 'asc' }, { created_at: 'asc' }],
            include: {
              source_actions: {
                include: {
                  target_state: true,
                },
              },
              assigned_role: true,
              assigned_user: true,
            },
          },
        },
      });

      if (!flow) {
        return null;
      }

      return this.mapFlow(flow);
    } catch (error) {
      logger.error('Error fetching workflow flow by ID', { error, flowId });
      throw error;
    }
  }

  /**
   * Batch update multiple workflow states in a single transaction.
   * Useful for reordering states (updating sequence) or bulk updates.
   */
  async batchUpdateWorkflowStates(
    updates: Array<{
      id: string;
      sequence?: number;
      name?: string;
      description?: string;
      is_initial?: boolean;
      is_final?: boolean;
      is_active?: boolean;
      skip?: boolean;
      skip_target_state_id?: string | null;
      entry_conditions?: Record<string, any>;
      exit_conditions?: Record<string, any>;
      assigned_for?: string;
      assigned_role_id?: string | null;
      assigned_user_id?: string | null;
      assigned_expression?: string | null;
    }>
  ): Promise<WorkflowState[]> {
    try {
      if (!updates || updates.length === 0) {
        throw new Error('At least one state update is required');
      }

      // Validate all updates first
      for (const update of updates) {
        if (!update.id) {
          throw new Error('Each update must include a state id');
        }

        // If skip is being set, validate it's not initial/final
        if (update.skip !== undefined && update.skip) {
          const currentState = await this.prisma.workflow_state.findUnique({
            where: { id: update.id },
          });

          if (!currentState) {
            throw new Error(`State ${update.id} not found`);
          }

          const isInitial = update.is_initial !== undefined ? update.is_initial : currentState.is_initial;
          const isFinal = update.is_final !== undefined ? update.is_final : currentState.is_final;

          if (isInitial || isFinal) {
            throw new Error(`Cannot skip initial or final state (${currentState.name})`);
          }
        }
      }

      // Perform all updates in a transaction
      const results = await this.prisma.$transaction(
        updates.map(update => {
          const { id, ...data } = update;
          return this.prisma.workflow_state.update({
            where: { id },
            data,
          });
        })
      );

      return results.map(this.mapState.bind(this));
    } catch (error) {
      logger.error('Error batch updating workflow states', { error });
      throw error;
    }
  }
} 