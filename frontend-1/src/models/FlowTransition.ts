
export interface FlowTransition {
  id: string;
  flow_id: string;
  from_state: string;
  to_state: string;
  label_name: string;
  created_at: string;
  updated_at: string;
}

export type FlowTransitionFormData = Omit<FlowTransition, 'id' | 'created_at' | 'updated_at'>;
