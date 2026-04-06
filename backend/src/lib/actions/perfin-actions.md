# Perfin Actions - Closing Balance Creation

## Overview

The Perfin Actions module provides functionality to create closing balance postings for financial accounts. This is essential for maintaining accurate financial records and ensuring proper year-end closing procedures.

## Key Functions

### 1. `createClosingBalancePostings(financialYear, orgId, createdBy)`

Creates closing balance postings for **all accounts** with non-zero balances for a given financial year.

**Parameters:**
- `financialYear` (number): The financial year (e.g., 2024 for FY 2024-25)
- `orgId` (string): Organization ID
- `createdBy` (string): User ID who is creating the postings

**Returns:** Array of created/updated posting records

**Process:**
1. Calculates financial year date range (Apr 1 to Mar 31)
2. Gets trial balance for the financial year
3. Filters accounts with non-zero total balances
4. Creates or updates closing balance postings in a transaction
5. Returns all processed postings

### 2. `createClosingBalancePostingForAccount(financialYear, orgId, accountId, createdBy)`

Creates closing balance posting for a **specific account**.

**Parameters:**
- `financialYear` (number): The financial year
- `orgId` (string): Organization ID
- `accountId` (string): Specific account ID
- `createdBy` (string): User ID who is creating the posting

**Returns:** Created/updated posting record or null if no balance

**Process:**
1. Calculates financial year date range
2. Gets trial balance for the specific account
3. Creates or updates closing balance posting
4. Returns the posting record

### 3. `createClosingBalancePostingForAccountInternal(account, endDate, financialYear, orgId, createdBy, tx)`

Internal helper function that handles the actual creation/update logic.

**Key Features:**
- **Duplicate Prevention**: Checks for existing closing balance postings
- **Update vs Create**: Updates existing postings or creates new ones
- **Proper Audit Trail**: Sets `modified_by` and `modified_at` for updates
- **Transaction Support**: Works within database transactions

## Closing Balance Logic

### Identification of Existing Postings

The system identifies existing closing balance postings using:
- **Name**: `Closing Balance - ${account.account_name}`
- **Notes**: `Closing balance for FY ${financialYear}-${(financialYear + 1).toString().slice(-2)}`
- **Account**: Either `account_id` or `credit_account_id` matches
- **Organization**: Same `org_id`

### Debit/Credit Logic

- **Positive Balance** → **Debit Posting** (asset/expense accounts)
- **Negative Balance** → **Credit Posting** (liability/income accounts)
- **Zero Balance** → **No Posting** (skipped)

### Posting Data Structure

```typescript
{
  account_id: isDebit ? account.account_id : undefined,
  credit_account_id: !isDebit ? account.account_id : undefined,
  name: `Closing Balance - ${account.account_name}`,
  account_name: account.account_name,
  amount: Math.abs(account.total_balance),
  posting_date: new Date(endDate),
  value_date: new Date(endDate),
  posting_type: postingType,
  notes: `Closing balance for FY ${financialYear}-${(financialYear + 1).toString().slice(-2)}`,
  description: `Closing balance posting for ${account.account_name} (${account.classification}) - ${postingType} ${amount}`,
  org_id: orgId,
  modified_by: createdBy,
  assigned_to: createdBy
}
```

## Testing with test-closing-balance.ts

### Setup

1. **Navigate to the project root:**
   ```bash
   cd /path/to/fabriq-ws-setup/backend
   ```

2. **Update test parameters** in `test-closing-balance.ts`:
   ```typescript
   const financialYear = 2024; // FY 2024-25
   const orgId = '1';
   const accountId = 'acco_5d412f37-abda-4c52-968a-48caa0229cbd';
   const createdBy = '6a6a1f15-3ead-45f8-9da3-53e7157a9bd0';
   ```

### Running Tests

**Run all tests:**
```bash
npx ts-node test-closing-balance.ts
```

**Available Test Functions:**

#### 1. `testClosingBalanceForAllAccounts()`
- Tests creating closing balance postings for **all accounts**
- Shows detailed output of created postings
- Displays first 5 postings with details

#### 2. `testClosingBalance()` (Single Account)
- Tests creating closing balance posting for **one specific account**
- Useful for testing individual account logic

#### 3. `testTrialBalanceWithOpeningBalance()`
- Tests the trial balance query with opening balance
- Shows account balances and opening balance calculations

### Test Output Example

```
=== Test 2: Create Closing Balance Postings (All Accounts) ===
Creating closing balance postings for ALL accounts for FY 2024-25...
Organization ID: 1
Created By: 6a6a1f15-3ead-45f8-9da3-53e7157a9bd0
✅ Success! Created 15 closing balance postings:
1. Account: Cash Account
   Amount: 50000.00
   Type: debit
   Notes: Closing balance for FY 2024-25
---
2. Account: Accounts Payable
   Amount: 25000.00
   Type: credit
   Notes: Closing balance for FY 2024-25
---
... and 13 more postings
```

## Usage Examples

### Create Closing Balance for All Accounts

```typescript
import { createClosingBalancePostings } from './src/lib/actions/perfin';

const result = await createClosingBalancePostings(
  2024, // FY 2024-25
  '1', // orgId
  'user-id-here' // createdBy
);

console.log(`Created ${result.length} closing balance postings`);
```

### Create Closing Balance for Single Account

```typescript
import { createClosingBalancePostingForAccount } from './src/lib/actions/perfin';

const result = await createClosingBalancePostingForAccount(
  2024, // FY 2024-25
  '1', // orgId
  'account-id-here', // accountId
  'user-id-here' // createdBy
);

if (result) {
  console.log('Created posting:', result);
} else {
  console.log('No posting created (zero balance)');
}
```

## Error Handling

The functions include comprehensive error handling with structured logging:

- **Validation Errors**: Invalid parameters or missing data
- **Database Errors**: Transaction failures or constraint violations
- **Business Logic Errors**: No accounts found or zero balances

All errors are logged with relevant context and metadata for debugging.

## Logging

The module uses structured logging with different levels:

- **INFO**: Successful operations and important events
- **DEBUG**: Detailed debugging information
- **WARN**: Non-critical issues (e.g., no data found)
- **ERROR**: Errors with full context and stack traces

## Best Practices

1. **Run Tests First**: Always test with `test-closing-balance.ts` before production use
2. **Check Parameters**: Ensure correct financial year, org ID, and user ID
3. **Monitor Logs**: Watch for warnings about zero balances or missing data
4. **Transaction Safety**: Functions use database transactions for data integrity
5. **Idempotent Operations**: Safe to run multiple times (updates existing postings)

## Troubleshooting

### Common Issues

1. **All Numbers Zero**: Check if closing balance postings already exist and are being excluded
2. **Double Counting**: Ensure trial balance query excludes current year's closing balance postings
3. **Missing Accounts**: Verify account hierarchy and organization setup
4. **Permission Errors**: Check user permissions and organization access

### Debug Steps

1. Run `testTrialBalanceWithOpeningBalance()` to check data
2. Check logs for detailed error information
3. Verify account IDs and financial year ranges
4. Test with single account first before bulk operations

## Integration Notes

- **Trial Balance Dependency**: Requires `getTrialBalance` function from reports module
- **Database Schema**: Uses `posting` table with specific field requirements
- **Workflow Integration**: Can be integrated with workflow engines for approval processes
- **Audit Trail**: Maintains proper audit fields for compliance
