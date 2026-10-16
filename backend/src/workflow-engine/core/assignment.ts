const ALLOWED_ASSIGNMENT = new Set(['USER', 'ROLE', 'EXPRESSION']);

/**
 * Returns a denial reason when the caller may not act on this state.
 * Unknown, empty, and ROLE with no role id are denied.
 */
export function assignmentDenial(input: {
  assigned_for: string | null | undefined;
  assigned_role_id?: string | null;
  assigned_user_id?: string | null;
  assigned_expression?: string | null;
  userId: string;
  userRoleIds: string[];
  createdBy?: string | null;
}): string | null {
  const assignedFor = input.assigned_for?.trim() ?? '';
  if (!ALLOWED_ASSIGNMENT.has(assignedFor)) {
    return `Assignment ${assignedFor || '(empty)'} is not allowed`;
  }
  if (assignedFor === 'ROLE') {
    if (!input.assigned_role_id || !input.userRoleIds.includes(input.assigned_role_id)) {
      return `User ${input.userId} does not have the required role`;
    }
  }
  if (assignedFor === 'USER') {
    if (input.assigned_user_id !== input.userId && input.createdBy !== input.userId) {
      return `User ${input.userId} is not authorized to perform this action`;
    }
  }
  return null;
}
