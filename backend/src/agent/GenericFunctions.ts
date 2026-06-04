import { z } from 'zod';
import { FunctionDefinition } from './models/ModelProvider';
import { generateModelDataSchema } from './schema/SchemaGenerator';
import logger from '../utils/logger';

const recordSchema = z.record(z.any()).refine(
  (val) => true, // Always passes validation
  { message: "This is a record of string keys to any values" }
);

/**
 * Helper function to log the structure of a Zod schema showing explicit field definitions
 * @param schema - The Zod schema to log
 * @param schemaName - Name to use in the log message
 */
function logSchemaStructure(schema: z.ZodTypeAny, schemaName: string): void {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const fieldDefinitions: Record<string, string> = {};
    Object.keys(shape).forEach((fieldName) => {
      const field = shape[fieldName];
      let typeDesc = 'unknown';
      if (field instanceof z.ZodString) {
        typeDesc = 'z.string()';
      } else if (field instanceof z.ZodNumber) {
        typeDesc = 'z.number()';
      } else if (field instanceof z.ZodBoolean) {
        typeDesc = 'z.boolean()';
      } else if (field instanceof z.ZodOptional) {
        const innerType = field._def.innerType;
        if (innerType instanceof z.ZodString) {
          typeDesc = 'z.string().optional()';
        } else if (innerType instanceof z.ZodNumber) {
          typeDesc = 'z.number().optional()';
        } else if (innerType instanceof z.ZodBoolean) {
          typeDesc = 'z.boolean().optional()';
        }
      }
      fieldDefinitions[fieldName] = typeDesc;
    });
    logger.info(`${schemaName} data schema structure:`, {
      fields: fieldDefinitions,
      totalFields: Object.keys(fieldDefinitions).length
    });
  }
}

// Zod schemas for each function

/**
 * Returns a dynamic schema for creating records
 * When modelName is provided in toolContext, generates schema directly from model registry
 * @param toolContext Optional context containing modelName to make schema more specific
 */
export function getCreateRecordSchema(toolContext?: { modelName?: string }) {
  // If modelName is provided in context, make it optional (default to context modelName)
  const modelNameSchema = toolContext?.modelName
    ? z.string().optional().default(toolContext.modelName).describe(`Name of the model to create record in (defaults to ${toolContext.modelName})`)
    : z.string().describe('Name of the model to create record in');
  logger.debug('getCreateRecordSchema', { toolContext });

  // Generate the data schema directly from model registry when modelName is in context
  let dataSchema: z.ZodTypeAny;
  if (toolContext?.modelName) {
    // Use the schema directly from the model registry
    dataSchema = generateModelDataSchema(toolContext.modelName, { allFieldsOptional: false });
  } else {
    // Fallback when modelName is not in context (will be validated at runtime)
    dataSchema = z.record(z.any()).describe('Data object with fields to create. Field types and requirements vary by model. System fields (id, created_at, modified_at, etc.) are automatically handled.');
  }

  return z.object({
    modelName: modelNameSchema,
    data: dataSchema
  });
}

/** Scalar filter value, or nested object/array for or/and logical filters. */
export const searchFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()).describe('Account ids for in operator, e.g. ["acco_…", "acco_…"]'),
  z.record(z.any()).describe('Nested condition for or/and, e.g. { "created_at": { "gte": "...", "lte": "..." } }'),
  z
    .array(z.record(z.any()))
    .describe('Array of branches for or/and, e.g. [{ "created_at": { "gte": "...", "lte": "..." } }]'),
]);

export const searchFilterSchema = z.object({
  field: z.string().describe('Field name, or "or" / "and" for logical groups'),
  operator: z
    .string()
    .describe(
      'Operator: eq, neq, gt, gte, lt, lte, icontains, ncontains, or, and. For or/and, value is an array of nested field conditions.'
    ),
  value: searchFilterValueSchema,
});

export const searchRecordsSchema = z.object({
  modelName: z.string().describe('Name of the model to search in'),
  search: z
    .union([
      z.array(searchFilterSchema),
      z
        .record(z.any())
        .describe('Legacy object format — prefer array format'),
    ])
    .optional(),
  page: z.number().int().min(1).describe('Page number (starts from 1)').optional(),
  pageSize: z.number().int().min(1).describe('Number of records per page').optional(),
});

/**
 * Returns a dynamic schema for updating records
 * When modelName is provided in toolContext, generates schema directly from model registry
 * All fields in data are optional for partial updates
 */
export function getUpdateRecordSchema(toolContext?: { modelName?: string }) {
  // If modelName is provided in context, make it optional (default to context modelName)
  const modelNameSchema = toolContext?.modelName
    ? z.string().optional().default(toolContext.modelName).describe(`Name of the model (defaults to ${toolContext.modelName})`)
    : z.string().describe('Name of the model');

  // Generate the data schema directly from model registry when modelName is in context
  let dataSchema: z.ZodTypeAny;
  if (toolContext?.modelName) {
    // Use the schema directly from the model registry with all fields optional for partial updates
    dataSchema = generateModelDataSchema(toolContext.modelName, { allFieldsOptional: true });
    // Log the schema structure to show explicit field definitions
    logSchemaStructure(dataSchema, 'getUpdateRecordSchema');
  } else {
    // Fallback when modelName is not in context (will be validated at runtime)
    dataSchema = z.record(z.any()).describe('Data object with fields to update. All fields are optional for partial updates. Field types vary by model. System fields (id, created_at, modified_at, etc.) are automatically handled.');
  }
  return z.object({
    modelName: modelNameSchema,
    id: z.string().describe('ID of the record to update'),
    data: dataSchema
  });
}

export const identifyModelSchema = z.object({
  userIntent: z.string().describe("User's request or query"),
  availableModels: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        examples: z.array(z.string()),
      })
    )
    .describe('List of models the user has access to'),
});

export const updateChildRelationSchema = z.object({
  modelName: z.string().describe('Name of the parent model'),
  id: z.string().describe('ID of the parent record'),
  relation: z.string().describe('Name of the relation field'),
  childId: z.string().describe('ID of the child record to update'),
  data: z.object({ dummy_field: z.string().optional() }).passthrough().describe('Data to update the child record with')
});

export const addChildrenToParentSchema = z.object({
  modelName: z.string().describe('Name of the parent model'),
  id: z.string().describe('ID of the parent record'),
  relation: z.string().describe('Name of the relation field'),
  childIds: z.array(z.string()).describe('IDs of the child records to add')
});

export const createChildItemSchema = z.object({
  parentModelName: z.string().describe('Name of the parent model (e.g., purchase_requisition)'),
  parentId: z.string().describe('ID of the parent record'),
  childModelName: z.string().describe('Name of the child model to create (e.g., item)'),
  data: z.object({
    product_id: z.string().optional().describe('ID of the product in item master (e.g., prod_1234567890)'),
    item_name: z.string().optional().describe('Name of the item to create'),
    item_description: z.string().optional().describe('Description of the item to create'),
    item_code: z.string().optional().describe('Code of the item to create'),
    rate: z.number().optional().describe('Rate of the item to create'),
    quantity: z.number().optional().describe('Quantity of the item to create'),
    need_by_date: z.string().optional().describe('Need-by date of the item to create (ISO 8601 format, e.g., "2026-01-01")')
  }).passthrough().describe('Data to create the child record with')
});

export const deleteRelationSchema = z.object({
  modelName: z.string().describe('Name of the parent model'),
  id: z.string().describe('ID of the parent record'),
  relation: z.string().describe('Name of the relation field'),
  childId: z.string().describe('ID of the child record to remove from the relation')
});

export const updateChildItemSchema = z.object({
  itemNumber: z.string().describe('Unique item number to identify the child item to update'),
  parentModelName: z.string().describe('Name of the parent model (e.g., purchase_requisition)'),
  parentId: z.string().describe('ID of the parent record to verify the item belongs to'),
  childModelName: z.string().describe('Name of the child model to update (e.g., item)'),
  data: z.object({
    product_id: z.string().optional().describe('ID of the product in item master (e.g., prod_1234567890)'),
    item_name: z.string().optional().describe('Name of the item to create'),
    item_description: z.string().optional().describe('Description of the item to create'),
    item_code: z.string().optional().describe('Code of the item to create'),
    rate: z.number().optional().describe('Rate of the item to create'),
    quantity: z.number().optional().describe('Quantity of the item to create'),
    need_by_date: z.string().optional().describe('Need-by date of the item to create (ISO 8601 format, e.g., "2026-01-01")')
  }).passthrough().describe('Data to update the child record with')
});

export const advancedSqlQuerySchema = z.object({
  query: z.string().describe('A valid SQL query (PostgreSQL syntax, Prisma-compatible schema)'),
  description: z.string().describe('A short explanation of what the query does'),
  uiHint: z.string().optional().describe('UI display hint for the result: "table", "chart", "metrics", "card", or other UI component type')
});

// ERP Connector schema for unified ERP operations
// Note: Methods are dynamically registered via handler files in src/agent/handlers/erp/
// To add a new method, create a handler file and it will be automatically available
let availableMethodsCache: string[] | null = null;
function getAvailableMethods(): string[] {
  if (availableMethodsCache === null) {
    try {
      // Dynamically import to avoid circular dependencies
      const { getAllMethodNames } = require('./handlers/erp/registry');
      availableMethodsCache = getAllMethodNames();
    } catch (error) {
      // Fallback to known methods if registry not available
      availableMethodsCache = ['getPurchaseOrder', 'getExpenseAccounts', 'getSystemType'];
    }
  }
  return availableMethodsCache!;
}

export const erpConnectorSchema = z.object({
  method: z.string().describe(
    `The ERP connector method to call. Available methods: ${getAvailableMethods().join(', ')}. ` +
    `To add new methods, create handler files in src/agent/handlers/erp/ - no code changes needed.`
  ),
  params: z.any().optional().describe(
    'Method-specific parameters. ' +
    'For getPurchaseOrder: { externalId: string } (or omit if context.recordId is available for purchase_order). ' +
    'For getExpenseAccounts and getSystemType: no parameters needed. ' +
    'See handler files for specific parameter requirements.'
  )
});

// Invoice extraction schema matching InvoiceExtractor.getExpectedSchema()
export const extractInvoiceFromFileSchema = z.object({
  invoice: z.object({
    invoice_number: z.string().nullish(),
    invoice_date: z.string().nullish(), // date as ISO string
    invoice_version: z.number().nullish(),
    invoice_status: z.string().nullish(),
    invoice_type: z.string().nullish(),
    supplier_name: z.string().nullish(),
    attach: z.string().nullish(),
    supplier_remarks: z.string().nullish(),
    shipping_terms: z.string().nullish(),
    shipping_method: z.string().nullish(),
    payment_terms: z.string().nullish(),
    remit_to: z.string().nullish(),
    bill_to: z.string().nullish(),
    deliver_to: z.string().nullish(),
    requester_name: z.string().nullish(),
    requester_email: z.string().nullish(),
    ap_comment: z.string().nullish(),
    po_number: z.string().nullish(),
    coa: z.string().nullish(),
    additional_tax: z.number().nullish(),
    shipping_cost: z.number().nullish(),
    tax_on_shipping: z.number().nullish(),
    handling_cost: z.number().nullish(),
    tax_on_handling: z.number().nullish(),
    misc_cost: z.number().nullish(),
    tax_on_misc: z.number().nullish(),
    invoice_net_total: z.number().nullish(),
    shipping_handling_misc_total: z.number().nullish(),
    invoice_total: z.number().nullish(),
    balance_amount: z.number().nullish(),
    terms_and_conditions: z.string().nullish()
  }).passthrough(),
  line_items: z.array(z.object({
    item_name: z.string().nullish(),
    item_number: z.string().nullish(),
    item_description: z.string().nullish(),
    item_type: z.string().nullish(),
    rate: z.number().nullish(),
    ordered_quantity: z.number().nullish(),
    ordered_amount: z.number().nullish(),
    invoice_qty: z.number().nullish(),
    line_total: z.number().nullish(),
    invoiced_amount: z.number().nullish(),
    tax_type: z.string().nullish(),
    tax_rate: z.number().nullish(),
    tax_rate_intra: z.number().nullish(),
    line_tax_amount: z.number().nullish(),
    po_number: z.string().nullish(),
    need_by_date: z.string().nullish() // date as ISO string
  }).passthrough()),
  context: z.object({
    currency: z.string().nullish(),
    language: z.string().nullish(),
    documentType: z.string().nullish(),
    pageCount: z.number().nullish(),
    extractedAt: z.string().nullish() // date as ISO string
  }).passthrough().optional()
});

export const GENERIC_FUNCTIONS: FunctionDefinition[] = [
  {
    name: "createRecord",
    description: "Create a new record in the specified model. The data object is a JSON object with the fields to create the record with. Required fields must be provided. System fields (id, created_at, modified_at, etc.) are automatically handled.",
    parameters: getCreateRecordSchema(),
  },
  {
    name: "searchRecords",
    description: "Search records in the specified model with filtering and pagination. Perfect for finding records by date ranges (last week, this month, etc.) or user-specific queries (created by me, assigned to me, etc.)",
    parameters: searchRecordsSchema,
  },
  {
    name: "updateRecord",
    description: "Update an existing record in the specified model. The data object is a JSON object with the fields to update the record with. All fields are optional for partial updates. System fields (id, created_at, modified_at, etc.) are automatically handled.",
    parameters: getUpdateRecordSchema(),
  },
  {
    name: "searchItems",
    description: "Search for items/products in the item_master model. Use for finding office supplies, equipment, materials, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchSuppliers",
    description: "Search for suppliers/vendors in the supplier model. Use for finding vendors by name, location, industry, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchDepartments",
    description: "Search for departments in the department model. Use for finding departments by name, business unit, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchCostCenters",
    description: "Search for cost centers in the cost_center model. Use for finding cost centers by name, department, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchLocations",
    description: "Search for delivery locations in the location model. Use for finding locations by name, address, city, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchProjects",
    description: "Search for projects in the project_master model. Use for finding projects by name, code, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchBudgetPeriods",
    description: "Search for budget periods in the budget_period model. Use for finding budget periods by period name, date range, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchBudgetLines",
    description: "Search for budget lines in the budget_line model. Use for finding budget lines by name, budget period, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchCOA",
    description: "Search for chart of accounts in the coa model. Use for finding account codes, descriptions, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchEntities",
    description: "Search for legal entities in the entity model. Use for finding entities by name, legal name, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchEmployees",
    description: "Search for employees in the employee_master model. Use for finding employees by name, department, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "searchUsers",
    description: "Search for users in the user_master model. Use for finding users by name, username, etc. for purchase requisitions.",
    parameters: searchRecordsSchema,
  },
  {
    name: "identifyModel",
    description: "Identify which model to use based on user intent",
    parameters: identifyModelSchema,
  },
  {
    name: "updateChildRelation",
    description: "Update a child record through a parent relation. Provide the parent model, parent ID, relation name, child ID, and data to update.",
    parameters: updateChildRelationSchema,
  },
  {
    name: "addChildrenToParent",
    description: "Add one or more child records to a parent via a relation. Provide the parent model, parent ID, relation name, and child IDs.",
    parameters: addChildrenToParentSchema,
  },
  {
    name: "createChildItem",
    description: "Create a new empty child item for a parent record (e.g., add an empty item row to a purchase requisition). Provide the parent model, parent ID, and child model name. This tool automatically sets the parent reference and creates an empty child record.",
    parameters: createChildItemSchema,
  },
  {
    name: "deleteRelation",
    description: "Remove a child record from a parent relation. Provide the parent model, parent ID, relation name, and child ID.",
    parameters: deleteRelationSchema,
  },
  {
    name: "updateChildItem",
    description: "Update a child item in a purchase requisition. First, identify the child item by its unique item_number in the specified child model and verify it belongs to the specified parent. The tool automatically checks if the item has a product assigned. If no product is assigned and no product is provided, it will ask you to provide a product ID or name first. Only after a product is assigned can you update quantity and need-by date. This tool enforces the workflow: product must be set before quantity/date updates.",
    parameters: updateChildItemSchema,
  },
  {
    name: "advancedSqlQuery",
    description: "Execute advanced SQL queries for complex operations that cannot be handled by standard search tools. Use for joins, grouping, aggregation, or complex filters. ALWAYS validate schema and table names using accessible models before building queries.",
    parameters: advancedSqlQuerySchema,
  },
  {
    name: "erpConnector",
    description: `Unified ERP connector tool for querying ERP system data. 

Available methods: ${getAvailableMethods().join(', ')}

Common usage:
- Get purchase order details: Use method "getPurchaseOrder"
  * When context.recordId is available (on purchase order details page): Call with method "getPurchaseOrder" and no params - the tool will automatically fetch the purchase order and use its source_record_id
  * When context.recordId is NOT available: Call with method "getPurchaseOrder" and params { externalId: "po-id" }
- Get expense accounts: Use method "getExpenseAccounts" with no params
- Get ERP system type: Use method "getSystemType" with no params

Examples:
- "What's the status of this purchase order?" (when on PO details page) -> method: "getPurchaseOrder", no params needed
- "What's the status of purchase order PO123?" (when not on PO page) -> method: "getPurchaseOrder", params: { externalId: "PO123" }
- "Get all expense accounts from Zoho" -> method: "getExpenseAccounts"
- "What ERP system is connected?" -> method: "getSystemType"

Note: New methods can be added by creating handler files in src/agent/handlers/erp/ - no code changes needed in the main tool.`,
    parameters: erpConnectorSchema,
  },
  {
    name: "extractInvoiceFromFile",
    description: `MANDATORY: When a file (PDF, image, scanned document, text, etc.) is uploaded with invoice content, you MUST:
1. Read and analyze the entire document
2. Extract all invoice data according to the schema below
3. Call this tool with the extracted data

This tool is ONLY for extracting invoice data from uploaded files. Use it immediately when you receive a file attachment.

Extract the following invoice header information:
- Invoice number
- Invoice date (as ISO string)
- Invoice version (if available)
- Invoice status (if mentioned)
- Invoice type (e.g., purchase, sales, credit note)
- Supplier/vendor name
- Supplier address and contact details
- Shipping terms and method
- Payment terms
- Remit to address
- Bill to address
- Deliver to address
- Requester name and email
- Purchase order number (if referenced)
- Chart of accounts code
- Additional tax amount
- Shipping cost
- Tax on shipping
- Handling cost
- Tax on handling
- Miscellaneous cost
- Tax on miscellaneous
- Invoice net total
- Shipping/handling/misc total
- Invoice total amount
- Balance amount
- Terms and conditions

Extract the following line item information for each item:
- Item name
- Item number
- Item description
- Item type
- Rate/unit price
- Ordered quantity
- Ordered amount
- Invoice quantity
- Line total
- Invoiced amount
- Tax type
- Tax rate
- Tax rate intra (if applicable)
- Line tax amount
- Purchase order number (if referenced)
- Need by date (as ISO string)

Also extract any attachments or references mentioned in the invoice.

IMPORTANT: Extract ONLY what actually appears in the document. Do not guess or invent data. Use null/empty or omit fields that are not present. Dates should be ISO format strings. Numbers should be numbers. Return structured data matching the schema: invoice object, line_items array, and optional context object.`,
    parameters: extractInvoiceFromFileSchema,
  }
]; 