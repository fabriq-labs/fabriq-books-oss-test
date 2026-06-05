/**
 * Hardcoded posting prompt + test-only DynamicPromptManager injection.
 * Keep aligned with prisma/metadata/prompt-templates/view_d8b6c832-*_fabriq.txt
 */

import { DynamicPromptManager } from '../prompt/DynamicPromptManager';
import { ModelRegistry } from '../../services/registry/ModelRegistry';
import { TOOL_RESPONSE_HANDLING_GUIDELINE } from '../prompt/constants';
import { applyDatePlaceholders, computeDatePlaceholders } from '../prompt/datePlaceholders';

export const HARDCODED_POSTING_PROMPT = `## POSTING MAIN VIEW — REQUIREMENTS

| Topic | Rule |
|-------|------|
| Legal entity | Today/recent/last 7 days: omit legal_entity_id. Period pulls, amount filters (gt/lt/eq), debit/credit, transfers: legal_entity_id eq header when set below. |
| Today | searchRecords or: created_at OR value_date, each gte/lte {{todayStart}}/{{todayEnd}} |
| Recent | last 7 days: value_date gte {{last7DaysStart}}, lte {{currentDate}} |
| This week | value_date gte {{weekStart}}, lte {{currentDate}} |
| Last week | value_date gte {{lastWeekStart}}, lt {{weekStart}} (prior Mon–Sun — NOT this week) |
| This month | value_date gte {{monthStart}}, lt {{nextMonthStart}} (full calendar month) |
| Last month | value_date gte {{lastMonthStart}}, lt {{monthStart}} (ISO timestamps) |
| Reply | Use tool recordCount/summary; if recordCount > 0 list rows — never say no postings |
| legal_entity on today | Do not add — null entity rows (e.g. Test Chat AI) are excluded by legal_entity_id eq |

## POSTING SCHEMA

- posting: value_date, created_at, posting_date, amount, description, account_id, credit_account_id, legal_entity_id, posting_type
- account: name, code, classification

Current time: {{currentDate}}
Today: {{todayStart}} … {{todayEnd}} | Recent 7d: {{last7DaysStart}} … {{currentDate}} | This week: {{weekStart}} … {{currentDate}} | Last week: {{lastWeekStart}} … < {{weekStart}} | Month: {{monthStart}} … < {{nextMonthStart}} | Last month: {{lastMonthStart}} … {{lastMonthEnd}}

## LEGAL ENTITY

{{#if context.modelContext.legalEntityId}}
Header: {{context.modelContext.legalEntityName}} ({{context.modelContext.legalEntityId}}). Debit/credit: (1) account search name + legal_entity_id, (2) ONE posting search account_id + legal_entity_id. Period pulls and amount filters (gt/lt/eq): add legal_entity_id eq header id on posting search.
{{/if}}

- Debit/credit: two steps account then posting; ONE posting search
- User names entity in chat → legal_entity_id eq optional
- "all entities" → account_id in [all ids], ONE search

## LIST / SEARCH — searchRecords

1. modelName: posting
2. TODAY: or filter — created_at OR value_date with {{todayStart}}/{{todayEnd}}. No legal_entity_id unless user asked.
3. RECENT LIST (list recent postings): base filters only, pageSize 25, NO value_date — not last-7-days unless user said last 7 days
3b. THIS WEEK: gte {{weekStart}}, lte {{currentDate}}
3c. THIS MONTH: gte {{monthStart}}, lt {{nextMonthStart}}
3d. LAST MONTH: gte {{lastMonthStart}}, lt {{monthStart}}
4. Named day: value_date gte/lte full ISO timestamps for that calendar day
5. Reply from tool totalCount/returnedCount/truncated — if truncated, state full total (e.g. 325), not only rows in data
6. amount+yesterday: legal_entity_id eq header (mandatory) unless "all entities"; amount lt + {{yesterdayStart}}/{{yesterdayEnd}}; 0 rows = none for that entity only; all entities = omit legal_entity_id
7. Base filters: posting_type neq DUPLICATE, description ncontains Closing
8. or/and: value is array of nested conditions, e.g. { field: "or", operator: "or", value: [{ created_at: { gte, lte } }, { value_date: { gte, lte } }] }
9. Debit Account → account_id: account lookup org-wide; ONE posting search; header entity → eq that entity's acco_ id only
10. Credit Account → credit_account_id: same
10b. Moved money from A to B: credit_account_id=A (from), account_id=B (to); 2 account lookups + 1 posting search
10c. Between A and B yesterday: value_date {{yesterdayStart}}/{{yesterdayEnd}} ONLY (never created_at); legal_entity_id eq header; two direction searches; 0 rows = $0 for that entity — do not widen
11. FORBIDDEN: multiple posting searchRecords for same debit/credit question (one per legal entity)
12. Operators: eq, neq, gt, gte, lt, lte, icontains, ncontains, or, and, in

Never createRecord for list/filter. Never analyticsQuery for simple today/recent/amount/day filters.

## AGGREGATIONS — getAnalyticsContext + analyticsQuery

Top N, sums, Q3, breakdowns. SQL: org_id, posting_type <> DUPLICATE, description NOT ILIKE '%Closing%'.
This month on p.value_date: >= {{monthStart}} AND < {{nextMonthStart}} (full calendar month — NEVER {{currentDate}} or last7DaysStart).
Total debited to [account] this month: resolve account_id, SUM(amount), value_date month bounds, legal_entity_id eq header legalEntityId (not org_id).

{{#if context.modelContext.selectedAccountId}}
Selected account: {{context.modelContext.selectedAccountName}} ({{context.modelContext.selectedAccountId}}).
{{/if}}

## CREATE — createRecord only when user provides posting field values

{{#if context.modelContext.legalEntityId}}
Header entity for create: {{context.modelContext.legalEntityName}} ({{context.modelContext.legalEntityId}}) — include legal_entity_id in createRecord data when user creates a posting.
{{/if}}

Available models:
{{accessibleModels}}
`;

export function resolveHardcodedPostingPrompt(
    template: string,
    orgId: string,
    modelContext?: Record<string, unknown>,
    permissions?: Record<string, unknown>
): string {
    let prompt = applyDatePlaceholders(template, computeDatePlaceholders(new Date()))
        .replace(/\{org_id\}/g, orgId)
        .replace(/\{\{orgId\}\}/g, orgId);

    if (modelContext) {
        for (const [key, value] of Object.entries(modelContext)) {
            if (value != null) {
                prompt = prompt.replace(new RegExp(`\\{\\{context\\.modelContext\\.${key}\\}\\}`, 'g'), String(value));
            }
        }
    }

    if (modelContext?.selectedAccountId) {
        prompt = prompt.replace(/\{\{#if context\.modelContext\.selectedAccountId\}\}(.*?)\{\{\/if\}\}/gs, '$1');
    } else {
        prompt = prompt.replace(/\{\{#if context\.modelContext\.selectedAccountId\}\}.*?\{\{\/if\}\}/gs, '');
    }

    if (modelContext?.legalEntityId) {
        prompt = prompt.replace(/\{\{#if context\.modelContext\.legalEntityId\}\}(.*?)\{\{\/if\}\}/gs, '$1');
    } else {
        prompt = prompt.replace(/\{\{#if context\.modelContext\.legalEntityId\}\}.*?\{\{\/if\}\}/gs, '');
    }

    if (permissions && prompt.includes('{{accessibleModels}}')) {
        const models = ModelRegistry.getInstance().getAccessibleModels(
            permissions as Record<string, Record<string, string>>
        );
        const lines = models.map((m) => `- ${m.name}: ${m.description || 'no description'}`).join('\n');
        prompt = prompt.replace(/\{\{accessibleModels\}\}/g, lines || '- posting\n- account');
    }

    if (!prompt.includes('TOOL RESPONSE HANDLING')) {
        prompt += TOOL_RESPONSE_HANDLING_GUIDELINE;
    }

    return prompt;
}

type GenerateFn = DynamicPromptManager['generateDynamicPromptWithMetadata'];
let originalGenerateDynamicPrompt: GenerateFn | null = null;

export function installHardcodedPostingPromptPatch(): void {
    if (originalGenerateDynamicPrompt) return;
    originalGenerateDynamicPrompt = DynamicPromptManager.prototype.generateDynamicPromptWithMetadata;
    DynamicPromptManager.prototype.generateDynamicPromptWithMetadata = async function (
        this: DynamicPromptManager,
        permissions?: Record<string, any>
    ) {
        const mgr = this as unknown as {
            modelName: string;
            org_id: string;
            context?: { modelContext?: Record<string, unknown>; viewName?: string };
        };
        if (mgr.modelName === 'posting') {
            const prompt = resolveHardcodedPostingPrompt(
                HARDCODED_POSTING_PROMPT,
                mgr.org_id,
                mgr.context?.modelContext,
                permissions
            );
            return {
                prompt,
                metadata: {
                    templateIds: ['hardcoded-posting-sample-questions'],
                    versions: [1],
                    promptTypes: ['default', 'analytics'],
                    viewId: 'hardcoded',
                    viewName: mgr.context?.viewName || 'posting_view',
                    modelName: 'posting',
                },
            };
        }
        return originalGenerateDynamicPrompt!.call(this, permissions);
    };
}

export function uninstallHardcodedPostingPromptPatch(): void {
    if (originalGenerateDynamicPrompt) {
        DynamicPromptManager.prototype.generateDynamicPromptWithMetadata = originalGenerateDynamicPrompt;
        originalGenerateDynamicPrompt = null;
    }
}
