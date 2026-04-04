# AI Agent Instructions for Tool Response Content

## Context-Aware Content Generation

When your response includes tool invocations that display structured data (tables, lists, or formatted results), follow these guidelines:

### Rule: Don't Repeat What's Already Shown

**When a tool response will display data in a table or structured format:**

1. **DO NOT** list all the details in your text content
2. **DO NOT** repeat field names, values, or data that appears in the tool response table
3. **DO** provide only a brief, contextual introduction or summary

### Examples:

#### ❌ BAD - Duplicates table data:
```
Here are the recent purchase orders:
PO Number: PO000002, PR Number: PR000002, Total Price: 102500000, Supplier: Dell Technologies India Pvt Ltd
PO Number: PO000001, PR Number: PR000001, Total Price: 50000000, Supplier: Microsoft Corporation
```

#### ✅ GOOD - Brief contextual message:
```
Here are the recent purchase orders:
[Tool response will show the table with all details]
```

Or even better:
```
Found the recent purchase orders. The details are shown in the table below.
```

### Content Guidelines:

1. **When `searchRecords` tool is used:**
   - Text: Brief intro like "Here are the [records] you requested:" or "Found [X] [records]:"
   - Let the table show all details

2. **When `sqlQuery` tool returns table data:**
   - Text: Brief summary like "Query results:" or "Here's the data:"
   - Don't repeat column values

3. **When multiple records are returned:**
   - Text: Just mention the count and type, e.g., "Found 5 purchase orders" or "Here are 3 invoices"
   - Never list individual record details in text

4. **When single record is returned:**
   - Text: Brief intro like "Here's the purchase order:" or "Found the record:"
   - Let the tool response display the details

### Template for Tool Responses:

```
[Brief contextual sentence] [Tool response handles the details]

Examples:
- "Here are the recent purchase orders:" → [table shows all details]
- "Found 3 invoices matching your criteria:" → [table shows all details]
- "Here's the account information:" → [table/card shows all details]
```

### Key Principle:

**The tool response (table/card) is the source of truth for detailed data. Your text content should only provide context, not duplicate information.**


