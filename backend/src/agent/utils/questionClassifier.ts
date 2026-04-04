/**
 * Question Classifier for Analytics vs Transactional Queries
 * 
 * Determines if a user's question requires:
 * - Simple CRUD operations (transactional) → 2 steps
 * - Complex analytics/aggregations → 5-8 steps with schema context
 */

export type QueryType = 'transactional' | 'analytical';

export interface QueryClassification {
  type: QueryType;
  maxSteps: number;
  requiresSchemaContext: boolean;
  suggestedTools: string[];
  reasoning: string;
}

// Patterns that indicate analytical/aggregate questions
const ANALYTICAL_PATTERNS = [
  /how many/i,
  /count/i,
  /total\s+(?:number|amount|value|spend)/i,
  /how\s+much.*(spend|spent|incur|incurred|income|expense)/i,
  /total\s+(?:income|expense|spend|spent|incur|incurred)/i,
  /(spend|spent|incur|incurred|income|expense)\s+by/i,
  /average|avg\b/i,
  /sum(?:mary)?/i,
  /pending.*(approval|review)/i,
  /waiting\s+(for|on)/i,
  /stuck/i,
  /per\s+(day|week|month|year|user|department|team|category|store)/i,
  /trend/i,
  /compare/i,
  /top\s+\d+/i,
  /breakdown/i,
  /distribution/i,
  /who.*raised/i,
  /who.*created/i,
  /assigned\s+to\s+whom/i,
  /overdue/i,
  /aging/i,
  /statistics|stats/i,
  /report/i,
  /summary/i,
  /grouped?\s+by/i,
  /aggregate/i,
  /by\s+(?:category|store|month|week|year|vendor|supplier|department)/i, // "by category", "by store"
  /unreconciled/i,
  /reconcil/i,
  /match.*transaction/i,
  /bank.*statement/i,
  /suggest.*match/i,
];

// Patterns that indicate cross-module queries (need more steps)
const CROSS_MODULE_PATTERNS = [
  /pr.*(?:to|→|->).*po|po.*(?:from|←|<-).*pr/i,  // PR to PO flow
  /requisition.*order/i,
  /invoice.*(?:order|po|purchase)/i,              // Invoice to Order
  /order.*invoice/i,
  /requisition.*invoice/i,                        // Full procure-to-pay
  /trace|track|flow/i,                            // Transaction tracing
  /end.to.end/i,
  /full.*cycle/i,
  /permission.*chain/i,
  /role.*access/i,
  /workflow.*history/i,
];

// Patterns that indicate simple single-record operations
// NOTE: These should be specific enough to NOT match aggregate queries
const TRANSACTIONAL_PATTERNS = [
  /^create\s+(a|an|new)/i,
  /^add\s+(a|an|new)/i,
  /^update\s+(the|my|this)/i,
  /^edit\s+(the|my|this)/i,
  /^delete\s+(the|my|this)/i,
  /^remove\s+(the|my|this)/i,
  /^show\s+(me\s+)?(the|this)\s+\w+\s+(record|entry|item|document|order|invoice|requisition)/i,
  /^get\s+(the|my|this)\s+\w+\s+(record|entry|details)/i,
  /^find\s+(the|my|this)\s+\w+\s+with\s+id/i,
  /^what\s+is\s+(the|my)\s+\w+\s+(number|status)/i,
];

/**
 * Classifies a user question to determine the appropriate handling strategy
 */
export function classifyQuestion(question: string): QueryClassification {
  // Check for cross-module patterns first (highest complexity)
  const isCrossModule = CROSS_MODULE_PATTERNS.some(p => p.test(question));
  
  if (isCrossModule) {
    return {
      type: 'analytical',
      maxSteps: 8,
      requiresSchemaContext: true,
      suggestedTools: ['getAnalyticsContext', 'analyticsQuery'],
      reasoning: 'Cross-module query requiring multi-table joins and multiple steps'
    };
  }
  
  // Check for analytical patterns BEFORE transactional
  // This ensures "show my spending by category" is classified as analytical
  const isAnalytical = ANALYTICAL_PATTERNS.some(p => p.test(question));
  
  if (isAnalytical) {
    return {
      type: 'analytical',
      maxSteps: 8,  // Relaxed to allow multi-step reasoning, fuzzy matching, retries
      requiresSchemaContext: true,
      suggestedTools: ['getAnalyticsContext', 'analyticsQuery'],
      reasoning: 'Aggregate/analytical query requiring schema context'
    };
  }
  
  // Check for explicit transactional patterns
  const isExplicitlyTransactional = TRANSACTIONAL_PATTERNS.some(p => p.test(question));
  
  if (isExplicitlyTransactional) {
    return {
      type: 'transactional',
      maxSteps: 2,
      requiresSchemaContext: false,
      suggestedTools: ['searchRecords', 'createRecord', 'updateRecord'],
      reasoning: 'Single record operation detected'
    };
  }
  
  // Default to transactional for unclassified questions
  return {
    type: 'transactional',
    maxSteps: 2,
    requiresSchemaContext: false,
    suggestedTools: ['searchRecords', 'createRecord', 'updateRecord'],
    reasoning: 'Default classification - appears to be a standard operation'
  };
}

/**
 * Extracts potential model names from a question for context
 */
export function extractModelHints(question: string): string[] {
  const modelPatterns = [
    { pattern: /purchase\s*requisition|pr\b/i, model: 'purchase_requisition' },
    { pattern: /purchase\s*order|po\b/i, model: 'purchase_order' },
    { pattern: /invoice/i, model: 'invoice' },
    { pattern: /sales\s*order|so\b/i, model: 'sales_order' },
    { pattern: /supplier|vendor/i, model: 'supplier' },
    { pattern: /item|product/i, model: 'item_master' },
    { pattern: /workflow/i, model: 'workflow_instance' },
    { pattern: /approval/i, model: 'workflow_instance' },
    { pattern: /user/i, model: 'user' },
    { pattern: /role/i, model: 'role' },
    { pattern: /permission/i, model: 'permission' },
    { pattern: /department/i, model: 'department' },
    { pattern: /reconcil|bank\s*statement|unmatched/i, model: 'posting' },
    { pattern: /payment|receipt/i, model: 'payment_receipt' },
  ];
  
  const hints: string[] = [];
  for (const { pattern, model } of modelPatterns) {
    if (pattern.test(question) && !hints.includes(model)) {
      hints.push(model);
    }
  }
  
  return hints;
}
