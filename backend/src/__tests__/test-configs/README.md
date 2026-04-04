# Test Configuration System

This directory contains configuration files for externalizing test data, allowing the same tests to run against different demo datasets.

## Overview

The test configuration system allows you to run the same test suite against different demo data setups:

- **Indian Demo**: `indian-demo-config.json` - INR currency, Mumbai/Bangalore companies
- **US-CA Demo**: `us-ca-demo-config.json` - USD currency, San Francisco tech companies

## Usage

### Environment Variable Configuration

Set the `TEST_CONFIG` environment variable to choose which configuration to use:

```bash
# Use Indian demo data
TEST_CONFIG=indian-demo npm test

# Use US-CA demo data
TEST_CONFIG=us-ca-demo npm test

# Default: Indian demo data
npm test
```

### Programmatic Configuration

```typescript
import { loadTestConfig, createTestContext, validateTestData } from '../test-configs/test-config-loader';

// Load configuration
const config = loadTestConfig();

// Create test context
const context = createTestContext(config);

// Validate test data exists (in beforeAll)
await validateTestData(config, prisma);
```

## Configuration Files

### Indian Demo Config (`indian-demo-config.json`)
```json
{
  "name": "Indian Demo Data",
  "orgId": "org_test_company",
  "userId": "user_test_123",
  "customerId": "cust_acme_corp",
  "supplierId": "supp_test_vendor",
  "items": {
    "productA": "item_test_product_a",
    "serviceB": "item_test_service_b",
    "productC": "item_test_product_c"
  },
  "locationId": "loc_test_warehouse",
  "currency": "INR",
  "description": "Test configuration for Indian demo data (setup-test-data.ts)"
}
```

### US-CA Demo Config (`us-ca-demo-config.json`)
```json
{
  "name": "US-CA Demo Data",
  "orgId": "org_techflow_us",
  "userId": "user_john_smith",
  "customerId": "cust_aether_corp",
  "supplierId": "supp_global_chip",
  "items": {
    "productA": "item_ultra_laptop",
    "serviceB": "item_it_consulting",
    "productC": "item_4k_monitor"
  },
  "locationId": "loc_sf_headquarters",
  "currency": "USD",
  "description": "Test configuration for US-CA demo data (setup-US_CA)"
}
```

## Adding New Configurations

1. **Create Config File**: Add a new JSON file following the naming pattern: `{config-name}-config.json`

2. **Set Environment Variable**: Use `TEST_CONFIG={config-name}` to select the configuration

3. **Update Tests**: The test configuration loader will automatically use the selected config

## Configuration Structure

Each config file must contain:

- `name`: Display name for the configuration
- `orgId`: Organization ID
- `userId`: Test user ID
- `customerId`: Test customer ID
- `supplierId`: Test supplier ID
- `items`: Object with item IDs (productA, serviceB, productC)
- `locationId`: Test location ID
- `currency`: Currency code (INR, USD, etc.)
- `description`: Description of the configuration

## Integration with Tests

The configuration system integrates seamlessly with existing tests:

1. **Import the loader**: `import { loadTestConfig, createTestContext, validateTestData } from '../test-configs/test-config-loader'`

2. **Load config in beforeAll**:
   ```typescript
   let config: TestConfig;
   let context: any;

   beforeAll(() => {
     config = loadTestConfig();
     context = createTestContext(config);
   });
   ```

3. **Validate data exists**:
   ```typescript
   beforeAll(async () => {
     await validateTestData(config, prisma);
   });
   ```

4. **Use config values**: Replace hardcoded IDs with `config.orgId`, `config.items.productA`, etc.

## Benefits

- **Environment Agnostic**: Same tests run against different datasets
- **Easy Switching**: Change environment variable to switch configurations
- **Data Isolation**: Each configuration uses completely separate test data
- **Extensible**: Easy to add new configurations for different regions/scenarios
- **Validation**: Automatic validation that required test data exists

## Examples

### Running Tests with Different Configs

```bash
# Indian demo data
TEST_CONFIG=indian-demo npm test src/__tests__/sales-invoice/direct-invoice.test.ts

# US-CA demo data
TEST_CONFIG=us-ca-demo npm test src/__tests__/sales-invoice/direct-invoice.test.ts
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Indian Demo Tests
  run: TEST_CONFIG=indian-demo npm test

- name: Run US-CA Demo Tests
  run: TEST_CONFIG=us-ca-demo npm test
```

---

**🎯 This system enables running identical tests against different regional datasets, ensuring comprehensive coverage across various business contexts.**
