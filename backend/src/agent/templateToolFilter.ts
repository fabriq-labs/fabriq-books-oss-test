/**
 * Template `allowed_tools` filter for workbench sessions.
 * Pure helpers — kept out of ToolManager so they can be unit-tested
 * without loading the agent tool graph.
 */

/** Always kept on session tool maps; `allowed_tools` cannot remove these. */
export const CORE_SESSION_TOOLS = ['createPlan', 'completeStep', 'requestClarification'] as const;

/**
 * Read-only lookup kept if the model config already granted it.
 * Posting `prompt_template` instructs the LLM to call `searchRecords`; stripping
 * it causes `AI_NoSuchToolError` and kills the workbench session.
 */
export const TEMPLATE_FILTER_ALWAYS_KEEP = ['searchRecords'] as const;

export function applyTemplateToolFilter(
    tools: Record<string, unknown>,
    allowedTools?: string[],
): Record<string, unknown> {
    if (!allowedTools || allowedTools.length === 0) {
        return tools;
    }
    const permitted = new Set<string>([
        ...CORE_SESSION_TOOLS,
        ...TEMPLATE_FILTER_ALWAYS_KEEP,
        ...allowedTools,
    ]);
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tools)) {
        if (permitted.has(key)) {
            filtered[key] = value;
        }
    }
    return filtered;
}
