/**
 * Books registrations preserved from the kernel shell.
 * Handlers stay empty: the working books actions and reports are not in this
 * tree. Wire those existing modules here when the books app runs on this kernel.
 * Do not reimplement them.
 */
import { normalizeAnalyticsPostingSql } from "../src/agent/tools/analyticsQuery";

export type DomainSqlTable = {
  name: string;
  tenancy: "private" | "shareable";
};

export type DomainAction = (...args: any[]) => any;

export interface DomainActionBinding {
  fields: string[];
  method: DomainAction;
}

export type ReportHandler = (
  context: unknown,
  reportId: string,
  filters: unknown
) => Promise<unknown>;

export type DomainModelDescriptor = {
  name: string;
  description: string;
  businessContext: string;
  examples: string[];
  synonyms: string[];
};

/**
 * Private tables previously listed as BUSINESS_TABLES in analyticsQuery.ts.
 * workflow_instance and workflow_history were on that list and remain kernel tables.
 * source_system was on METADATA_TABLES and is not a kernel model.
 */
export const DOMAIN_SQL_TABLES: readonly DomainSqlTable[] = [
  "item_master",
  "supplier",
  "customers",
  "invoice",
  "invoice_line_item",
  "purchase_requisition",
  "item",
  "purchase_order",
  "purchase_order_item",
  "sales_order",
  "sales_order_item",
  "delivery_challan",
  "credit_note",
  "quote",
  "account",
  "posting",
  "payment_receipt",
  "employee_master",
  "department",
  "cost_center",
  "location",
  "project_master",
  "budget_period",
  "budget_line",
  "coa",
  "entity",
  "source_system",
  "instrument",
  "trade",
  "holding",
  "expense_report",
  "payment",
  "receipt",
  "invoice_item",
  "receipt_item",
].map((name) => ({ name, tenancy: "private" as const }));

/** Models that have a workflow view in backend/prisma/metadata/views. */
export const DOMAIN_WORKFLOW_MODELS: readonly string[] = [
  "purchase_requisition",
  "purchase_order",
  "invoice",
  "expense_report",
];

export const DEFAULT_GOAL_MODEL = "posting";

/** From AgentService RELATED_MODELS. */
export const RELATED_MODELS: Record<string, readonly string[]> = {
  posting: ["posting", "account"],
  account: ["account", "posting"],
};

export const PROMPT_EXAMPLES = `
Books examples for the kernel prompt. Taken from backend/src/agent/prompt/constants.ts.

Tool-table introductions:
- Bad: "PO Number: PO000002, PR Number: PR000002, Total Price: 102500000..."
- Bad: listing each posting with description, amount, and date.
- Good: "Here are the postings for this week:" or "Found 3 suppliers matching your criteria:"

Legal entity replies use filters.legal_entity_names, for example "expense account for Mumbai Technology Hub Pvt Ltd" or "trial balance for Bangalore Office".

Vendor ranking example: Gusto (Cloud-based HR) $471,703.88 across 648 transactions; UnitedHealthcare (Health care) $49,467.76 across 24 transactions.

Id examples to avoid: loc_mumbai_hq, loc_bangalore_main, loc_delhi_branch, supplier_abc123. Use Mumbai HQ, Bangalore Main, Delhi Branch, ABC Corporation, DEF Industries.

Query-step examples: "checking account" when the real name is "HDFC Current"; "Found 0 postings for March 2024"; "Found 23 unmatched postings for HDFC account".

Analysis step: suggestReconciliationMatches. Save the full tool output under accumulated_context_update.match_results. Do not execute financial actions directly in supervised mode.

System fields a books create must not send: pr_number, po_number, invoice_number, requester_department, requester.
Good create payload: {"data": {"purchase_reason": "office supplies"}}.

Available-tools note: the posting chat prompt may mention searchRecords or createRecord. If searchRecords is not in the allowed list, look up accounts and postings with analyticsQuery.

Analytics tool guidance previously hardcoded in analyticsQuery.ts:
Business tables need org_id: purchase_requisition, purchase_order, invoice, workflow_instance.
Metadata tables: workflow_flow, workflow_state, role, view.
`;

/** Descriptions copied from backend/src/config/model-registry.json, except user. */
export const DOMAIN_MODEL_REGISTRY: Record<string, DomainModelDescriptor> = {
  "supplier": {
    "name": "supplier",
    "description": "Used for managing supplier information and relationships",
    "businessContext": "Procurement and supply chain management",
    "examples": [
      "Add a new supplier",
      "Update supplier contact information",
      "Find suppliers in a specific city",
      "View supplier payment terms"
    ],
    "synonyms": [
      "vendor",
      "provider",
      "supplier company",
      "business partner"
    ]
  },
  "supplier_items": {
    "name": "supplier_items",
    "description": "Used for managing items associated with suppliers",
    "businessContext": "Procurement and inventory management",
    "examples": [
      "Assign items to a supplier",
      "View items from a specific supplier",
      "Update supplier item details"
    ],
    "synonyms": [
      "supplier products",
      "vendor items",
      "supplier catalog"
    ]
  },
  "item_category": {
    "name": "item_category",
    "description": "Used for categorizing and organizing items",
    "businessContext": "Inventory and product management",
    "examples": [
      "Create a new item category",
      "Update category details",
      "Find items in a specific category"
    ],
    "synonyms": [
      "product category",
      "item type",
      "classification"
    ]
  },
  "item_master": {
    "name": "item_master",
    "description": "Used for managing product and item information",
    "businessContext": "Inventory and product management",
    "examples": [
      "Add a new product",
      "Update product details",
      "Find products by category",
      "View product pricing"
    ],
    "synonyms": [
      "product",
      "item",
      "inventory item",
      "stock item"
    ]
  },
  "purchase_requisition": {
    "name": "purchase_requisition",
    "description": "Used for managing purchase requests and approvals. You can add items to a purchase requisition using the 'item' junction model. To add products, first search for them in the 'item_master' model, then add them to a purchase requisition by creating 'item' records that link the purchase requisition and the selected products.",
    "businessContext": "Procurement and purchasing",
    "examples": [
      "Create a new purchase request",
      "Update requisition details",
      "Track requisition status",
      "View my pending requisitions",
      "Add products to a purchase requisition by searching in item_master and linking them via item",
      "Assign multiple items to a purchase requisition using the item model"
    ],
    "synonyms": [
      "purchase request",
      "PR",
      "procurement request"
    ]
  },
  "item": {
    "name": "item",
    "description": "Used for managing individual items in purchase requisitions. This is a junction model that links products from item_master to purchase requisitions. To add a product to a purchase requisition, create an item record with the appropriate purchase requisition and product references.",
    "businessContext": "Procurement and purchasing",
    "examples": [
      "Add items to a purchase requisition",
      "Update item quantities",
      "View item details in a requisition",
      "Link a product from item_master to a purchase requisition by creating an item record"
    ],
    "synonyms": [
      "requisition item",
      "purchase item",
      "line item",
      "junction item"
    ]
  },
  "purchase_order": {
    "name": "purchase_order",
    "description": "Used for managing purchase orders created from approved purchase requisitions",
    "businessContext": "Procurement and purchasing",
    "examples": [
      "Create a purchase order from approved requisition",
      "Track purchase order status",
      "View purchase order details",
      "Update purchase order information",
      "Find purchase orders by supplier",
      "View purchase order history"
    ],
    "synonyms": [
      "PO",
      "purchase order",
      "procurement order",
      "buy order"
    ]
  },
  "purchase_order_item": {
    "name": "purchase_order_item",
    "description": "Used for managing individual items in purchase orders. This links products from item_master to purchase orders with quantities and pricing.",
    "businessContext": "Procurement and purchasing",
    "examples": [
      "Add items to a purchase order",
      "Update item quantities and pricing",
      "View purchase order line items",
      "Track item delivery status"
    ],
    "synonyms": [
      "PO item",
      "purchase order line item",
      "order item"
    ]
  },
  "invoice": {
    "name": "invoice",
    "description": "Used for managing supplier invoices and billing information",
    "businessContext": "Accounts payable and financial management",
    "examples": [
      "Create a new invoice",
      "Update invoice details",
      "Track invoice status",
      "View invoice history",
      "Find invoices by supplier",
      "Process invoice payments",
      "View invoice totals and line items"
    ],
    "synonyms": [
      "bill",
      "supplier invoice",
      "vendor invoice",
      "AP invoice"
    ]
  },
  "invoice_item": {
    "name": "invoice_item",
    "description": "Used for managing individual line items in invoices. This links products or services to invoices with quantities and pricing.",
    "businessContext": "Accounts payable and financial management",
    "examples": [
      "Add line items to an invoice",
      "Update invoice item details",
      "View invoice line items",
      "Match invoice items to purchase orders"
    ],
    "synonyms": [
      "invoice line item",
      "bill item",
      "invoice detail"
    ]
  },
  "payment": {
    "name": "payment",
    "description": "Used for managing payments made to suppliers for invoices",
    "businessContext": "Accounts payable and financial management",
    "examples": [
      "Record a payment for an invoice",
      "Track payment status",
      "View payment history",
      "Find payments by supplier",
      "Update payment information"
    ],
    "synonyms": [
      "supplier payment",
      "vendor payment",
      "AP payment",
      "disbursement"
    ]
  },
  "receipt": {
    "name": "receipt",
    "description": "Used for managing goods receipts and delivery confirmations",
    "businessContext": "Inventory and receiving management",
    "examples": [
      "Create a goods receipt",
      "Confirm delivery of ordered items",
      "Update receipt status",
      "View receipt history",
      "Match receipts to purchase orders"
    ],
    "synonyms": [
      "goods receipt",
      "delivery receipt",
      "receiving document",
      "GRN"
    ]
  },
  "receipt_item": {
    "name": "receipt_item",
    "description": "Used for managing individual items in receipts. This tracks what items were actually received.",
    "businessContext": "Inventory and receiving management",
    "examples": [
      "Add received items to a receipt",
      "Update received quantities",
      "View receipt line items",
      "Track item receipt status"
    ],
    "synonyms": [
      "received item",
      "receipt line item",
      "delivered item"
    ]
  },
  "department": {
    "name": "department",
    "description": "Used for organizing users and business units",
    "businessContext": "Organizational structure",
    "examples": [
      "Create a new department",
      "Update department information",
      "View department users",
      "Find departments by location"
    ],
    "synonyms": [
      "business unit",
      "division",
      "team",
      "organization"
    ]
  },
  "account": {
    "name": "account",
    "description": "Used for managing financial accounts including bank accounts, investment accounts, and general ledger accounts",
    "businessContext": "Financial management and accounting",
    "examples": [
      "Create a new bank account",
      "Update account details",
      "View account balance",
      "Find accounts by type",
      "Set up parent-child account relationships",
      "Track account transactions"
    ],
    "synonyms": [
      "bank account",
      "financial account",
      "ledger account",
      "chart of accounts"
    ]
  },
  "posting": {
    "name": "posting",
    "description": "Used for recording financial transactions and journal entries with debit and credit accounts",
    "businessContext": "Financial accounting and transaction recording",
    "examples": [
      "Record a financial transaction",
      "Create journal entries",
      "Update posting details",
      "View transaction history",
      "Match postings to trades",
      "Categorize transactions"
    ],
    "synonyms": [
      "transaction",
      "journal entry",
      "financial posting",
      "accounting entry"
    ]
  },
  "instrument": {
    "name": "instrument",
    "description": "Used for managing financial instruments like stocks, bonds, mutual funds, ETFs, and other investment vehicles",
    "businessContext": "Investment and portfolio management",
    "examples": [
      "Add a new stock",
      "Update instrument details",
      "Find instruments by type",
      "View instrument information",
      "Track instrument performance",
      "Manage investment universe"
    ],
    "synonyms": [
      "security",
      "investment",
      "financial instrument",
      "asset"
    ]
  },
  "trade": {
    "name": "trade",
    "description": "Used for recording buy, sell, dividend, and other trading transactions for financial instruments",
    "businessContext": "Investment trading and portfolio management",
    "examples": [
      "Record a stock purchase",
      "Log a dividend payment",
      "Update trade details",
      "View trade history",
      "Track trade performance",
      "Process trade settlements"
    ],
    "synonyms": [
      "transaction",
      "trade execution",
      "investment transaction",
      "buy/sell order"
    ]
  },
  "holding": {
    "name": "holding",
    "description": "Used for tracking current investment positions and portfolio holdings with quantities, costs, and market values",
    "businessContext": "Portfolio management and investment tracking",
    "examples": [
      "View current holdings",
      "Update holding quantities",
      "Track portfolio performance",
      "Calculate unrealized gains/losses",
      "Monitor position sizes",
      "Update market values"
    ],
    "synonyms": [
      "position",
      "portfolio holding",
      "investment position",
      "asset holding"
    ]
  },
  "expense_report": {
    "name": "expense_report",
    "description": "Used for managing expense reports and reimbursement requests with workflow integration",
    "businessContext": "Expense management and reimbursement",
    "examples": [
      "Create a new expense report",
      "Update expense details",
      "Submit for approval",
      "Track expense status",
      "View expense history",
      "Process reimbursements"
    ],
    "synonyms": [
      "expense claim",
      "reimbursement request",
      "expense submission",
      "cost report"
    ]
  }
};

/** From backend/src/lib/import/bankStatementImportClient.ts. */
export const DOMAIN_IMPORT_FIELD_KEYS: readonly string[] = [
  "name",
  "description",
  "value_date",
  "posting_date",
  "amount",
  "account_id",
  "credit_account_id",
  "legal_entity_id",
  "notes",
  "status",
  "posting_type",
  "reconciliation_status",
];

/**
 * Agent templates in backend/prisma/seed-agent-templates.sql.
 * The prompt text stays in that file.
 */
export const DOMAIN_AGENT_TEMPLATES: readonly { id: string; name: string; goalModel: string }[] = [
  { id: "atpl_book_transactions", name: "Book Transactions", goalModel: "posting" },
  { id: "atpl_reconcile", name: "Reconcile Transactions", goalModel: "posting" },
  { id: "atpl_spending_analysis", name: "Analyse Spending", goalModel: "posting" },
  { id: "atpl_categorise", name: "Categorise Expenses", goalModel: "posting" },
  { id: "atpl_custom", name: "Custom", goalModel: "" },
];

/** Posting, value_date, and legal_entity SQL rewrites. Implementation stays in analyticsQuery.ts. */
export const normalizeAnalyticsSql = normalizeAnalyticsPostingSql;

export const functionMap: Record<string, DomainActionBinding> = {};
export const workflowActionMap: Record<string, (...args: any[]) => any> = {};
export const reportHandlers: Record<string, ReportHandler> = {};

export function registerDomainBuilders(
  _actionRegistry: { register: (builder: any) => void },
  _reportRegistry: { register: (formatter: any) => void }
) {}
