# Agent Service Tests

## Overview

This test suite validates the Agent Service architecture, including:
- Model Registry access control
- Tool Manager tool selection
- Message processing (text and files)
- Agent Service request handling
- System prompt generation
- Full request flow with tool execution

## Prerequisites

1. **Database Setup**: Run the test data setup script first:
   ```bash
   npx ts-node prisma/setup-test-data.ts
   ```

2. **Environment Configuration**: Ensure `.env.test` is configured with:
   - `DATABASE_URL`: PostgreSQL connection string
   - `LLM_MODEL`: (Optional) Gemini model name
   - `LLM_PROVIDER`: (Optional) Provider name (default: `vertex`)

3. **LLM Configuration** (Optional): 
   - Tests will skip LLM-dependent tests if API keys are not configured
   - Configure Google Cloud credentials for full test coverage

## Test Structure

### Test Files

- `agent-service.test.ts`: Main test suite
- `agent-service-test-fixtures.ts`: Test data fixtures and helper functions

### Test Categories

#### 1. Model Registry Tests
- ✅ Get accessible models for user with permissions
- ✅ Return empty array for user with no permissions

#### 2. Tool Manager Tests
- ✅ Get default tools for default model
- ✅ Get full tools for purchase_requisition model

#### 3. Message Processor Tests
- ✅ Process simple text messages
- ✅ Process messages with file attachments (base64 → Uint8Array)

#### 4. Agent Service - Non-Streaming Tests
- ✅ Handle simple search request
- ✅ Handle request with conversation history

#### 5. Agent Service - Prepare Request Setup Tests
- ✅ Prepare request setup correctly
- ✅ Throw error when no accessible models

#### 6. Agent Service - System Prompt Generation Tests
- ✅ Generate system prompt for default model
- ✅ Generate system prompt for purchase_requisition model

#### 7. Integration Tests
- ✅ Handle complete request flow with tool execution
- ✅ Handle search request and return structured data

#### 8. Error Handling Tests
- ✅ Handle invalid model name gracefully
- ✅ Handle empty message gracefully

## Running Tests

### Run All Agent Service Tests

```bash
npm test -- agent-service
```

### Run Specific Test Suite

```bash
npm test -- agent-service.test.ts
```

### Run Tests in Watch Mode

```bash
npm test -- --watch agent-service
```

### Run with Coverage

```bash
npm test -- --coverage agent-service
```

## Test Data

### Seed Data Required

Tests use seed data from `prisma/setup-test-data.ts`:

- **Organization**: `org_test_company`
- **User**: `user_test_123`
- **Item**: `item_test_product_a`
- **Location**: `loc_test_warehouse`

### Test Context

Tests use `createTestContext()` to create authenticated contexts with permissions:

```typescript
const context = createTestContext('user_test_123', 'org_test_company');
```

### Permissions

Test context includes:
- `purchase_requisition`: write access
- `item_master`: read access
- `supplier`: read access
- `location`: read access
- `organization`: read access
- `invoice`: write access

## Test Details

### Model Registry Tests

Validates that the ModelRegistry correctly filters models based on user permissions.

**Example:**
```typescript
const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(
  context.permissions
);
expect(accessibleModels.length).toBeGreaterThan(0);
```

### Tool Manager Tests

Validates that ToolManager provides the correct tool set for each model context.

**Example:**
```typescript
const tools = ToolManager.getInstance().getToolsForModel('default', context);
expect(tools.searchRecords).toBeDefined();
expect(tools.createRecord).toBeUndefined(); // Not available for default
```

### Message Processor Tests

Validates that messages are correctly processed, especially file attachments (base64 → Uint8Array).

**Example:**
```typescript
const processedMessages = processMessages(rawMessages);
expect(processedMessages[0].content[1].data).toBeInstanceOf(Uint8Array);
```

### Agent Service Request Tests

Validates end-to-end request handling with real LLM integration (if configured).

**Example:**
```typescript
const response = await agentService.handleRequest(
  'Show me my purchase requisitions',
  context,
  [],
  { modelName: 'purchase_requisition' }
);
expect(response.content).toBeDefined();
```

## Notes

### LLM Configuration

Some tests require LLM (Gemini) configuration:

1. **Skip Behavior**: Tests gracefully skip if LLM is not configured
2. **Full Coverage**: Configure Google Cloud credentials for full test coverage
3. **Timeout**: Tests have 60-second timeout for LLM operations

### Test Isolation

- Tests verify seed data exists but don't create it
- Tests don't clean up data (preserves seed data)
- Each test runs independently

### Error Handling

Tests validate both success and error cases:
- Missing permissions
- Invalid model names
- Empty messages
- No accessible models

## Troubleshooting

### "Setup required!" Error

**Solution**: Run the test data setup script:
```bash
npx ts-node prisma/setup-test-data.ts
```

### "LLM not configured" Warnings

**Solution**: Configure Google Cloud credentials or skip LLM-dependent tests

### Test Timeouts

**Solution**: Increase timeout in test file:
```typescript
jest.setTimeout(120000); // 2 minutes
```

### Permission Errors

**Solution**: Verify test context has correct permissions:
```typescript
const context = createTestContext('user_test_123', 'org_test_company');
// Check context.permissions
```

## Future Enhancements

- [ ] Add streaming request tests
- [ ] Add file extraction tests with mock files
- [ ] Add prompt manager tests (local vs dynamic)
- [ ] Add tool execution result validation
- [ ] Add performance benchmarks

