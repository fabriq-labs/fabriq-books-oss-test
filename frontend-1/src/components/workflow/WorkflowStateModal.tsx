import React, { useState, useEffect } from "react";
import { workflowManagementAPI } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, ArrowRight, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RoleSelector from "./RoleSelector";
import UserSelector from "./UserSelector";

interface WorkflowState {
  id: string;
  name: string;
  description?: string;
  sequence: number;
  is_initial: boolean;
  is_final: boolean;
  is_active: boolean;
  skip: boolean;
  skip_target_state_id?: string | null;
  assigned_for: string;
  assigned_role_id?: string;
  assigned_user_id?: string;
  assigned_expression?: string;
  source_actions?: WorkflowAction[];
  assigned_role?: {
    id: string;
    name: string;
  };
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  };
}

interface SideEffect {
  type: string;
  config: {
    method?: string;
    [key: string]: unknown;
  };
  enabled?: boolean;
}

interface SideEffectsConfig {
  effects?: SideEffect[];
}

interface WorkflowAction {
  id: string;
  name: string;
  description?: string;
  target_state_id: string;
  target_state: WorkflowState;
  side_effects?: SideEffectsConfig;
}

interface WorkflowStateModalProps {
  open: boolean;
  onClose: () => void;
  state: WorkflowState | null;
  allStates: WorkflowState[];
  flowId: string;
  onSaved: () => void;
}

const WorkflowStateModal: React.FC<WorkflowStateModalProps> = ({
  open,
  onClose,
  state,
  allStates,
  flowId,
  onSaved,
}) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [updatingEffects, setUpdatingEffects] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    assigned_for: 'USER',
    assigned_role_id: '',
    assigned_user_id: '',
    assigned_expression: '',
    skip: false,
    skip_target_state_id: '',
  });

  // Reset form when state changes
  useEffect(() => {
    if (state) {
      setFormData({
        name: state.name || '',
        description: state.description || '',
        is_active: state.is_active,
        assigned_for: state.assigned_for || 'USER',
        assigned_role_id: state.assigned_role_id || '',
        assigned_user_id: state.assigned_user_id || '',
        assigned_expression: state.assigned_expression || '',
        skip: state.skip || false,
        skip_target_state_id: state.skip_target_state_id || '',
      });
    }
  }, [state]);

  if (!state) return null;

  const hasSideEffects = state.source_actions?.some(action => {
    return action.side_effects && Object.keys(action.side_effects).length > 0;
  }) || false;

  const getAvailableTargetStates = (): WorkflowState[] => {
    if (!state.source_actions || state.source_actions.length === 0) return [];
    
    const targetStateIds = new Set<string>();
    state.source_actions.forEach(action => {
      if (action.target_state_id) {
        targetStateIds.add(action.target_state_id);
      }
    });

    return allStates.filter(s => targetStateIds.has(s.id));
  };

  const availableTargets = getAvailableTargetStates();
  const actionCount = state.source_actions?.length || 0;
  const needsTargetSelection = actionCount > 1;
  const canSkip = !state.is_initial && !state.is_final;

  const isValidForm = () => {
    if (!formData.assigned_for) return false;
    if (formData.assigned_for === 'ROLE' && !formData.assigned_role_id) return false;
    if (formData.assigned_for === 'USER' && !formData.assigned_user_id) return false;
    if (formData.assigned_for === 'EXPRESSION' && !formData.assigned_expression.trim()) return false;

    // Skip validation
    if (formData.skip && needsTargetSelection && !formData.skip_target_state_id) {
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!isValidForm()) return;

    setIsSaving(true);
    try {
      const updateData = {
        name: formData.name,
        description: formData.description || null,
        is_active: formData.is_active,
        assigned_for: formData.assigned_for,
        assigned_role_id: formData.assigned_for === 'ROLE' ? formData.assigned_role_id : null,
        assigned_user_id: formData.assigned_for === 'USER' ? formData.assigned_user_id : null,
        assigned_expression: formData.assigned_for === 'EXPRESSION' ? formData.assigned_expression : null,
        skip: formData.skip,
        skip_target_state_id: formData.skip ? (formData.skip_target_state_id || null) : null,
      };

      await workflowManagementAPI.updateState(flowId, state.id, updateData);

      toast({
        title: "Success",
        description: "State updated successfully",
      });

      onSaved();
      onClose();
    } catch (error: any) {
      console.error("Error updating state:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update state",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActionExpanded = (actionId: string) => {
    setExpandedActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
  };

  const handleSideEffectToggle = async (action: WorkflowAction, effectIndex: number, newEnabled: boolean) => {
    if (!state) return;

    const effectKey = `${action.id}-${effectIndex}`;
    setUpdatingEffects(prev => new Set(prev).add(effectKey));

    try {
      const currentEffects = action.side_effects?.effects || [];
      const updatedEffects = currentEffects.map((effect, idx) => {
        if (idx === effectIndex) {
          return { ...effect, enabled: newEnabled };
        }
        return effect;
      });

      const updatedSideEffects = {
        ...action.side_effects,
        effects: updatedEffects,
      };

      await workflowManagementAPI.updateAction(flowId, state.id, action.id, {
        side_effects: updatedSideEffects,
      });

      toast({
        title: "Success",
        description: `Side effect ${newEnabled ? 'enabled' : 'disabled'}`,
      });

      // Refresh the parent to get updated data
      onSaved();
    } catch (error: any) {
      console.error("Error updating side effect:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update side effect",
        variant: "destructive",
      });
    } finally {
      setUpdatingEffects(prev => {
        const newSet = new Set(prev);
        newSet.delete(effectKey);
        return newSet;
      });
    }
  };

  const getMethodDisplayName = (method: string): string => {
    // Convert method names to human-readable format
    return method
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit State: {state.name}
            {state.is_initial && <Badge variant="default" className="text-xs">Initial</Badge>}
            {state.is_final && <Badge variant="secondary" className="text-xs">Final</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* General Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">General</h3>
            
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="State name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>
          </div>

          {/* Assignment Section */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Assignment</h3>
            
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select
                  value={formData.assigned_for}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    assigned_for: value,
                    assigned_role_id: value === 'ROLE' ? prev.assigned_role_id : '',
                    assigned_user_id: value === 'USER' ? prev.assigned_user_id : '',
                    assigned_expression: value === 'EXPRESSION' ? prev.assigned_expression : '',
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ROLE">Role</SelectItem>
                    <SelectItem value="EXPRESSION">Expression</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.assigned_for === 'ROLE' && (
                <div className="space-y-2">
                  <Label>Role</Label>
                  <RoleSelector
                    value={formData.assigned_role_id || undefined}
                    selectedRole={state.assigned_role}
                    onChange={(value) => setFormData(prev => ({ ...prev, assigned_role_id: value }))}
                    placeholder="Select role..."
                  />
                </div>
              )}

              {formData.assigned_for === 'USER' && (
                <div className="space-y-2">
                  <Label>User</Label>
                  <UserSelector
                    value={formData.assigned_user_id || undefined}
                    selectedUser={state.assigned_user}
                    onChange={(value) => setFormData(prev => ({ ...prev, assigned_user_id: value }))}
                    placeholder="Select user..."
                  />
                </div>
              )}

              {formData.assigned_for === 'EXPRESSION' && (
                <div className="space-y-2">
                  <Label>Expression</Label>
                  <Input
                    value={formData.assigned_expression}
                    onChange={(e) => setFormData(prev => ({ ...prev, assigned_expression: e.target.value }))}
                    placeholder="e.g., created_by.manager"
                  />
                  <p className="text-xs text-gray-500">
                    Expression to evaluate the assigned user (e.g., created_by.manager)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Skip Configuration Section */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Skip Configuration</h3>
            
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="skip">Skip this state</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Automatically skip to the next state when workflow enters this state
                  </p>
                </div>
                <Switch
                  id="skip"
                  checked={formData.skip}
                  onCheckedChange={(checked) => {
                    const newSkipTarget = checked && actionCount === 1 && availableTargets.length === 1
                      ? availableTargets[0].id
                      : formData.skip_target_state_id;
                    setFormData(prev => ({
                      ...prev,
                      skip: checked,
                      skip_target_state_id: newSkipTarget
                    }));
                  }}
                  disabled={!canSkip}
                />
              </div>

              {!canSkip && (
                <p className="text-xs text-amber-600">
                  Initial and final states cannot be skipped
                </p>
              )}

              {formData.skip && needsTargetSelection && (
                <div className="space-y-2">
                  <Label>Target State</Label>
                  <Select
                    value={formData.skip_target_state_id || undefined}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, skip_target_state_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target state to skip to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTargets.map((targetState) => (
                        <SelectItem key={targetState.id} value={targetState.id}>
                          {targetState.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    This state has multiple outgoing actions. Select which state to skip to.
                  </p>
                </div>
              )}

              {formData.skip && actionCount === 1 && availableTargets.length === 1 && (
                <p className="text-xs text-gray-500">
                  Will skip to: <strong>{availableTargets[0].name}</strong>
                </p>
              )}

              {formData.skip && hasSideEffects && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <strong>Warning:</strong> Actions from this state have side effects configured.
                    Side effects will be skipped when this state is skipped.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Outgoing Actions Section */}
          {state.source_actions && state.source_actions.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Outgoing Actions ({state.source_actions.length})
              </h3>

              <div className="space-y-3">
                {state.source_actions.map((action) => {
                  const effects = action.side_effects?.effects || [];
                  const hasEffects = effects.length > 0;
                  const isExpanded = expandedActions.has(action.id);

                  return (
                    <div
                      key={action.id}
                      className="bg-gray-50 rounded-md border overflow-hidden"
                    >
                      {/* Action Header */}
                      <div
                        className={`flex items-center justify-between p-3 ${hasEffects ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                        onClick={() => hasEffects && toggleActionExpanded(action.id)}
                      >
                        <div className="flex items-center gap-2">
                          {hasEffects && (
                            <div className="text-gray-400">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {action.name}
                              {hasEffects && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  <Zap className="h-3 w-3 mr-1" />
                                  {effects.length} effect{effects.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            {action.description && (
                              <div className="text-xs text-gray-500">{action.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <ArrowRight className="h-4 w-4" />
                          {action.target_state?.name || 'Unknown'}
                        </div>
                      </div>

                      {/* Side Effects (Expandable) */}
                      {hasEffects && isExpanded && (
                        <div className="border-t bg-white p-3 space-y-2">
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                            Side Effects
                          </div>
                          {effects.map((effect, effectIndex) => {
                            const effectKey = `${action.id}-${effectIndex}`;
                            const isUpdating = updatingEffects.has(effectKey);
                            // Default to enabled=true if not specified (backward compatibility)
                            const isEnabled = effect.enabled !== false;

                            return (
                              <div
                                key={effectIndex}
                                className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                              >
                                <div className="flex items-center gap-2">
                                  <Zap className={`h-4 w-4 ${isEnabled ? 'text-amber-500' : 'text-gray-300'}`} />
                                  <div>
                                    <div className="text-sm font-medium">
                                      {effect.config?.method ? getMethodDisplayName(effect.config.method) : 'Unknown Method'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Type: {effect.type}
                                      {effect.config?.method && ` | Method: ${effect.config.method}`}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                                  <Switch
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => handleSideEffectToggle(action, effectIndex, checked)}
                                    disabled={isUpdating}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !isValidForm()}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowStateModal;

