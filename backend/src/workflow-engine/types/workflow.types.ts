import { AuthContext } from '../../auth/types';
import { ModelInstance } from './model.types';
import { isDomainWorkflowModel } from '../../domain/workflowModels';

export type WorkflowStatus = 'active' | 'completed' | 'cancelled';

export const is_workflow_model = (modelName: string) => {
  return isDomainWorkflowModel(modelName);
}

export interface WorkflowFlow {
  id: string;
  name: string;
  model_name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  modified_at: Date;
  org_id?: string | null;
}

export interface WorkflowState {
  id: string;
  flow_id: string;
  name: string;
  description?: string | null;
  sequence: number;
  is_initial: boolean;
  is_final: boolean;
  skip: boolean;
  skip_target_state_id?: string | null;
  entry_conditions?: Record<string, any> | null;
  exit_conditions?: Record<string, any> | null;
  assigned_for: string;
  assigned_user_id?: string | null;
  assigned_role_id?: string | null;
  assigned_expression?: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface WorkflowAction {
  id: string;
  name: string;
  description?: string | null;
  source_state_id: string;
  target_state_id: string;
  conditions?: Record<string, any> | null;
  side_effects?: Record<string, any> | null;
  created_at: Date;
  modified_at: Date;
}

export interface WorkflowInstance {
  id: string;
  flow_id: string;
  model_id: string;
  model_name: string;
  org_id: string;
  current_state: string;
  current_state_id?: string;
  assigned_user_id?: string;
  status: string;
  created_at: Date;
  modified_at: Date;
  created_by: string;
}

export interface WorkflowHistory {
  id: string;
  instance_id: string;
  action_id: string;
  from_state: string;
  to_state: string;
  performed_by: string;
  performed_at: Date;
  comments?: string | null;
  metadata?: Record<string, any> | null;
  skipped_states?: string[] | null; // Array of state IDs that were skipped
}

export interface WorkflowTransition {
  action: WorkflowAction;
  fromState: WorkflowState;
  toState: WorkflowState;
  instance: WorkflowInstance;
  history: WorkflowHistory;
  performedBy: string;
  metadata?: Record<string, any>;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors?: string[];
}

export interface WorkflowContext {
  instance: WorkflowInstance;
  currentState: WorkflowState;
  availableActions: WorkflowAction[];
  history: WorkflowHistory[];
  user: {
    id: string;
    roles: string[];
  };
  model?: ModelInstance;
  authContext?: AuthContext;
}

export interface WorkflowEngineConfig {
  validateConditions?: boolean;
  executeSideEffects?: boolean;
  logTransitions?: boolean;
} 