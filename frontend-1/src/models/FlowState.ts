
export interface FlowState {
  id: string;
  flow_id: string;
  process_name: string;
  state: string;
  assigned_role: string | null;
  visible_to: string[] | null;
  created_at: string;
  updated_at: string;
}

export type FlowStateFormData = Omit<FlowState, 'id' | 'created_at' | 'updated_at'>;
