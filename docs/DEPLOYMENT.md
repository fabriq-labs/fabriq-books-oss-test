# Fabriq Base - Deployment & Setup Guide

**When to read**: Setting up a new instance, deploying to production, loading demo data
**Related docs**: [ARCHITECTURE.md](./ARCHITECTURE.md), [AUTHENTICATION.md](./AUTHENTICATION.md), [UBUNTU_DOCKER_COMPOSE_SETUP.md](./UBUNTU_DOCKER_COMPOSE_SETUP.md) (pre-built image + Docker Compose on Ubuntu)

**Last Updated**: 2026-01-02
**Purpose**: Complete guide for deploying and bootstrapping a new Fabriq instance

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Overview](#setup-overview)
3. [Database Setup Script](#database-setup-script)
4. [Metadata Setup](#metadata-setup)
5. [Workflow Setup](#workflow-setup)
6. [Demo Data](#demo-data)
7. [Command Reference](#command-reference)
8. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required Software

- **Node.js**: v18+ (v20+ recommended)
- **PostgreSQL**: v14+ (v15+ recommended)
- **npm** or **yarn**: Latest version
- **Git**: For cloning repositories

### Environment Setup

**Backend (.env)**:
```bash
# Database connection
DATABASE_URL="postgresql://user:password@localhost:5432/fabriq_db"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"

# AI Features (Optional)
GOOGLE_CLOUD_PROJECT_ID="your-gcp-project-id"
GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64="base64-encoded-service-account-key"

# Server configuration
PORT=4000
NODE_ENV=development
```

**Frontend (.env)**:
```bash
# API endpoint
VITE_API_URL=http://localhost:4000

# External auth (if using)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## 🎯 Setup Overview

The Fabriq deployment process consists of **5 main steps**:

```
Step 0.5: Validate Prisma Schema
    ↓
Step 1: Reset Database Schema (DDL)
    ↓
Step 1.5: Load Database Functions
    ↓
Step 1.6: Setup Fabriq Source System
    ↓
Step 2: Setup Metadata (Roles, Views, Permissions)
    ↓
Step 3: Setup Workflows (States, Actions, Transitions)
    ↓
Step 4: Load Demo Data (Optional)
    ↓
Step 5: Run Tests (Optional)
```

### Quick Start

```bash
# Clone repository
git clone https://github.com/fabriq-labs/fabriq-base.git
cd fabriq-base

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run complete setup
node setup-db.js
# OR with options:
node setup-db.js --demo-data=indian-demo --skip-tests
```

---

## 🗄️ Database Setup Script

**File**: `setup-db.js`

This is the **master orchestration script** that runs all setup steps in the correct order.

### Command Line Options

```bash
# Full setup with interactive prompts
node setup-db.js

# Skip tests
node setup-db.js --skip-tests

# Non-interactive with specific demo data
node setup-db.js --demo-data=indian-demo --skip-tests

# Only setup demo data (no DDL changes)
node setup-db.js --demo-data-only --demo-data=us-ca-demo
```

### Available Options

| Option | Values | Description |
|--------|--------|-------------|
| `--demo-data` | `indian-demo`, `us-ca-demo`, `perfin-demo`, `both`, `skip` | Select which demo data to load |
| `--skip-tests` | - | Skip running tests after setup |
| `--demo-data-only` | - | Only load demo data (no schema changes) |

### What Each Step Does

#### Step 0.5: Validate Prisma Schema
```bash
Command: npx prisma validate
```
- Validates all `.prisma` files for syntax errors
- Checks for relationship consistency
- Verifies unique constraints and indexes
- **Fails fast** if schema has issues

#### Step 1: Reset Database Schema
```bash
Command: npx prisma db push --force-reset --accept-data-loss
```
- ⚠️ **DESTRUCTIVE**: Drops all existing tables and data
- Recreates all tables from Prisma schema
- Applies all constraints and indexes
- Generates primary keys and foreign keys

**Files Used**:
- `prisma/schema/data.prisma` - Business models
- `prisma/schema/metadata.prisma` - Framework models
- `prisma/schema/zeiv.prisma` - Additional models

#### Step 1.25: Generate Prisma Client
```bash
Command: npx prisma generate
```
- Generates TypeScript client from schema
- Creates type-safe query methods
- Ensures code is in sync with database

#### Step 1.5: Load Database Functions
```bash
Command: psql "${DATABASE_URL}" -f "prisma/functions.sql"
```
- Loads custom PostgreSQL functions
- Includes utility functions for metadata
- Sets up database triggers

**File**: `prisma/functions.sql`

Example functions:
- `gen_random_uuid()` - Generate UUIDs
- Custom aggregation functions
- Helper functions for workflow engine

#### Step 1.6: Setup Fabriq Source System
```bash
Command: psql "${DATABASE_URL}" -f "prisma/setup-fabriq-source-system.sql"
```
- Sets up source system metadata
- Configures integration points
- Initializes system constants

**File**: `prisma/setup-fabriq-source-system.sql`

#### Step 2: Setup Metadata
```bash
Command: npx ts-node prisma/setup-metadata.ts
```
See [Metadata Setup](#metadata-setup) section below.

#### Step 3: Setup Workflows
```bash
Command: npx ts-node prisma/setup-workflows.ts
```
See [Workflow Setup](#workflow-setup) section below.

#### Step 4: Load Demo Data
```bash
# Indian Demo Data
Command: cd prisma/setup-IN && npx ts-node setup-indian-demo.ts

# US-CA Demo Data
Command: cd prisma/setup-US_CA && npx ts-node setup-us-ca-demo.ts

# Personal Finance Demo Data
Command: cd prisma/setup-PERFIN && npx ts-node setup-perfin-demo.ts
```
See [Demo Data](#demo-data) section below.

#### Step 5: Run Tests
```bash
Command: npm test -- src/__tests__
```
- Validates setup is correct
- Tests CRUD operations
- Tests permission system
- Tests workflow transitions

---

## 👥 Metadata Setup

**File**: `prisma/setup-metadata.ts`

This script sets up the **authorization framework** that controls access to all data in the system.

### What Gets Created

#### 1. Roles
**Source**: `prisma/metadata-tables.sql`

Standard roles created:
- **Super Admin** - Full system access
- **Administrator** - Organization admin
- **Manager** - Department manager
- **Finance Team** - Finance operations
- **Buyer** - Procurement operations
- **Delivery** - Delivery operations
- **User** - Basic user access

```sql
INSERT INTO role (id, name, description) VALUES
  ('role-super-admin', 'Super Admin', 'System administrator with full access'),
  ('role-admin', 'Administrator', 'Organization administrator'),
  ('role-manager', 'Manager', 'Department manager'),
  ('role-finance', 'Finance Team', 'Finance and accounting team'),
  ('role-buyer', 'Buyer', 'Procurement and purchasing team'),
  ('role-delivery', 'Delivery', 'Delivery and logistics team'),
  ('role-user', 'User', 'Basic user access');
```

#### 2. Views
**Source**: `prisma/metadata/views/*.json`

Views are imported from JSON files and define:
- Which fields are visible
- Which fields are editable
- Which relations to include
- How data is displayed (list vs detail)

**Example View** (`supplier_view.json`):
```json
{
  "id": "supplier_view",
  "name": "supplier_view",
  "model_name": "supplier",
  "description": "Default view for supplier master data",
  "data_graph": {
    "select": {
      "id": true,
      "supplier_name": true,
      "email": true,
      "phone": true,
      "payment_terms": {
        "select": {
          "id": true,
          "payment_terms": true
        }
      }
    }
  }
}
```

**View Structure**:
- `id` - Unique identifier
- `name` - View name (used in URLs)
- `model_name` - Which Prisma model this view is for
- `data_graph` - JSON structure defining which fields to select

#### 3. Permissions
**Source**: `prisma/metadata-tables.sql`

Permissions are field-level access controls:
- `field_name` - Field or `*` for wildcard
- `access` - `read`, `write`, or `none`

**Example**:
```sql
-- Grant read access to all fields
INSERT INTO permission (view_id, field_name, access)
VALUES ('supplier_view', '*', 'read');

-- Grant write access to specific fields
INSERT INTO permission (view_id, field_name, access) VALUES
  ('supplier_view', 'supplier_name', 'write'),
  ('supplier_view', 'email', 'write'),
  ('supplier_view', 'phone', 'write');
```

#### 4. Role-View Assignments
**Source**: `prisma/metadata-tables.sql`

Links roles to views:

```sql
-- Assign supplier_view to Finance Team role
INSERT INTO role_view (role_id, view_id)
VALUES ('role-finance', 'supplier_view');

-- Assign supplier_view to Buyer role
INSERT INTO role_view (role_id, view_id)
VALUES ('role-buyer', 'supplier_view');
```

#### 5. Prompt Templates
**Source**: `prisma/metadata/views/prompt_templates.json`

AI agent system prompts for each model:

```json
{
  "model_name": "supplier",
  "template_name": "supplier_context",
  "content": "You are helping manage supplier master data. Suppliers are vendors from whom we purchase goods and services..."
}
```

#### 6. Initial Admin User
**Created in code**:

```typescript
{
  email: 'admin@example.com',
  password: 'admin123',  // Bcrypt hashed
  name: 'System Admin',
  external_id: 'admin-1',
  auth_provider: 'local',
  roles: ['Super Admin']
}
```

### Metadata Setup Summary

After running `setup-metadata.ts`, you have:
- ✅ 7+ roles with different access levels
- ✅ 50+ views (one per model)
- ✅ 500+ field-level permissions
- ✅ 100+ role-view assignments
- ✅ 20+ prompt templates for AI agent
- ✅ 1 admin user (admin@example.com / admin123)

---

## 🔄 Workflow Setup

**File**: `prisma/setup-workflows.ts`

This script creates **state machine workflows** for approval processes.

### Workflows Created

#### 1. Purchase Requisition Workflow

**Flow**: Draft → Buyer Review → Delivery Review → Approved/Rejected

**States**:
- **Draft** (initial, assigned to creator)
- **Buyer Review** (assigned to Buyer role)
- **Delivery Review** (assigned to Delivery role)
- **Approved** (final)
- **Rejected** (final)

**Actions**:
- Submit: Draft → Buyer Review
- Approve by Buyer: Buyer Review → Delivery Review
- Reject by Buyer: Buyer Review → Rejected
- Approve by Delivery: Delivery Review → Approved
- Reject by Delivery: Delivery Review → Rejected

**Code Structure**:
```typescript
const prFlow = await prisma.workflow_flow.create({
  data: {
    name: 'Purchase Requisition Approval',
    model_name: 'purchase_requisition',
    description: 'Workflow for purchase requisition approval process',
    is_active: true,
  }
});

const draftState = await prisma.workflow_state.create({
  data: {
    flow_id: prFlow.id,
    name: 'Draft',
    description: 'Initial state for new purchase requisitions',
    is_initial: true,
    is_final: false,
    assigned_for: 'USER',  // Assigned to creator
  }
});

await prisma.workflow_action.create({
  data: {
    name: 'Submit',
    description: 'Submit purchase requisition for approval',
    source_state_id: draftState.id,
    target_state_id: buyerReviewState.id,
    conditions: { conditions: [] },
    side_effects: {
      effects: [
        { type: 'set_field', field: 'submitted_at', value: 'now()' }
      ]
    }
  }
});
```

#### 2. Expense Report Workflow

**Flow**: Draft → Manager Review → Finance Review → Approved/Rejected

**States**:
- **Draft** (initial, assigned to creator)
- **Manager Review** (assigned via EXPRESSION: `created_by.manager`)
- **Finance Review** (assigned to Finance Team role)
- **Approved** (final)
- **Rejected** (final)

**Actions**:
- Submit: Draft → Manager Review
- Approve by Manager: Manager Review → Finance Review
- Reject by Manager: Manager Review → Rejected
- Approve by Finance: Finance Review → Approved
- Reject by Finance: Finance Review → Rejected

**Side Effects Example**:
```typescript
side_effects: {
  effects: [
    { type: 'set_field', field: 'manager_approved', value: true },
    { type: 'set_field', field: 'manager_approved_at', value: 'now()' }
  ]
}
```

### Assignment Types

1. **USER** - Assigned to specific user (usually creator)
   ```typescript
   assigned_for: 'USER',
   assigned_user_id: 'user-id'
   ```

2. **ROLE** - Assigned to any user with the role
   ```typescript
   assigned_for: 'ROLE',
   assigned_role_id: 'role-finance'
   ```

3. **EXPRESSION** - Dynamically assigned via expression
   ```typescript
   assigned_for: 'EXPRESSION',
   assigned_expression: 'created_by.manager'
   ```

### Workflow Setup Summary

After running `setup-workflows.ts`, you have:
- ✅ 2+ workflow flows (PR, Expense Report)
- ✅ 10+ workflow states
- ✅ 10+ workflow actions (transitions)
- ✅ Conditions and side effects configured
- ✅ Role-based and expression-based assignment

---

## 📦 Demo Data

The system provides **three demo data sets** for different use cases:

### 1. Indian Demo Data 🇮🇳

**File**: `prisma/setup-IN/setup-indian-demo.ts`

**What's Created**:
- **Organization**: Wayne Enterprises India Pvt Ltd (Mumbai)
- **Currency**: INR (₹)
- **Locations**: Mumbai office, Bangalore warehouse
- **Users**:
  - Bruce Wayne (CEO) - bruce.wayne@wayneenterprises.in
  - Lucius Fox (CTO) - lucius.fox@wayneenterprises.in
  - Alfred Pennyworth (Finance Manager) - alfred.pennyworth@wayneenterprises.in
- **Departments**: Engineering, Finance, Operations
- **Suppliers**: Indian vendors with GST numbers
- **Items**: Tech equipment, office supplies
- **Purchase Requisitions**: Sample PRs in different workflow states
- **Invoices**: Sample invoices with Indian tax structure

**Business Context**: Tech company in India with procurement operations

**Credentials**:
```
bruce.wayne@wayneenterprises.in / password
lucius.fox@wayneenterprises.in / password
alfred.pennyworth@wayneenterprises.in / password
```

**Resetting only demo postings (reconciliation demo)**  
To drop and recreate just the 24 bank postings (and remove any payment receipts created by confirming matches) without touching the rest of the Indian demo data:

```bash
cd backend
npx ts-node prisma/setup-IN/setup-indian-demo.ts --reset-postings
```

Use this after running reconciliations/confirmations in the UI when you want the posting list back to the initial demo state. See [RECONCILIATION_TOOL.md](./agent/RECONCILIATION_TOOL.md#seed-data--demo-indian-demo) for details.

### 2. US-CA Demo Data 🇺🇸

**File**: `prisma/setup-US_CA/setup-us-ca-demo.ts`

**What's Created**:
- **Organization**: Stark Industries (San Francisco)
- **Currency**: USD ($)
- **Locations**: San Francisco HQ, Palo Alto R&D
- **Users**:
  - Tony Stark (CEO) - tony.stark@starkindustries.com
  - Pepper Potts (COO) - pepper.potts@starkindustries.com
  - Happy Hogan (Procurement Manager) - happy.hogan@starkindustries.com
- **Departments**: Engineering, Sales, Finance
- **Suppliers**: US vendors with EIN numbers
- **Items**: Tech components, software licenses
- **Purchase Requisitions**: Sample PRs for tech procurement
- **Invoices**: Sample invoices with US tax structure

**Business Context**: Tech startup in California with procurement and sales

**Credentials**:
```
tony.stark@starkindustries.com / password
pepper.potts@starkindustries.com / password
happy.hogan@starkindustries.com / password
```

### 3. Personal Finance Demo Data 💰

**File**: `prisma/setup-PERFIN/setup-perfin-demo.ts`

**What's Created**:
- **Organization**: Personal Finance Management
- **Currency**: USD ($)
- **Accounts**: Checking, Savings, Credit Cards, Investment accounts
- **Categories**: Income, Expenses, Transfers
- **Transactions**: Sample personal transactions
- **Budget**: Monthly budget allocation

**Business Context**: Personal finance tracking and budgeting

**Credentials**:
```
admin@example.com / admin123
```

### Demo Data Selection

**Interactive Mode**:
```bash
node setup-db.js

# Prompts:
Choose demo data to load:
1. Indian Demo Data (₹ INR, Mumbai/Bangalore companies)
2. US-CA Demo Data ($ USD, San Francisco tech companies)
3. Personal Finance Demo Data ($ USD, Personal finance management)
4. Both Indian and US-CA Demo Data
0. Skip demo data (setup complete)

Enter your choice (1, 2, 3, 4, or 0):
```

**Non-Interactive Mode**:
```bash
# Load Indian demo
node setup-db.js --demo-data=indian-demo

# Load US-CA demo
node setup-db.js --demo-data=us-ca-demo

# Load Personal Finance demo
node setup-db.js --demo-data=perfin-demo

# Load both Indian and US-CA
node setup-db.js --demo-data=both

# Skip demo data
node setup-db.js --demo-data=skip
```

### Demo Data Only Mode

To **refresh demo data** without changing schema:

```bash
node setup-db.js --demo-data-only --demo-data=indian-demo
```

This mode:
- ✅ Skips schema reset (safe for production)
- ✅ Skips metadata setup
- ✅ Skips workflow setup
- ✅ Only inserts/updates demo data
- ✅ Safe to run on existing database

---

## 📖 Command Reference

### Complete Setup Commands

```bash
# Full setup with all steps + Indian demo data
node setup-db.js --demo-data=indian-demo

# Full setup without tests
node setup-db.js --demo-data=us-ca-demo --skip-tests

# Full setup with both demos
node setup-db.js --demo-data=both --skip-tests

# Setup without demo data
node setup-db.js --demo-data=skip
```

### Partial Setup Commands

```bash
# Only metadata (after schema exists)
npx ts-node prisma/setup-metadata.ts

# Only workflows (after metadata exists)
npx ts-node prisma/setup-workflows.ts

# Only demo data (non-destructive)
node setup-db.js --demo-data-only --demo-data=indian-demo
```

### Development Commands

```bash
# Validate schema without changes
npx prisma validate

# Generate Prisma client
npx prisma generate

# View database in Prisma Studio
npx prisma studio

# Apply migrations (production)
npx prisma migrate deploy

# Create new migration
npx prisma migrate dev --name add_new_feature

# Run tests
npm test

# Run specific test file
npm test -- src/__tests__/model.test.ts
```

### Database Commands

```bash
# Connect to database
psql "${DATABASE_URL}"

# Execute SQL file
psql "${DATABASE_URL}" -f prisma/some-file.sql

# Dump database
pg_dump "${DATABASE_URL}" > backup.sql

# Restore database
psql "${DATABASE_URL}" < backup.sql

# Check database size
psql "${DATABASE_URL}" -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Symptom**:
```
Error: Can't reach database server at localhost:5432
```

**Solutions**:
```bash
# Check PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql@15

# Start PostgreSQL (Ubuntu)
sudo systemctl start postgresql

# Verify DATABASE_URL
echo $DATABASE_URL
```

#### 2. Schema Validation Failed

**Symptom**:
```
❌ Schema validation failed!
Error: Invalid relation field
```

**Solutions**:
```bash
# Review error messages carefully
npx prisma validate

# Common issues:
# - Missing @relation attributes
# - Circular dependencies
# - Invalid field types
# - Typos in model/field names

# Fix schema and retry
npx prisma validate
```

#### 3. Permission Denied

**Symptom**:
```
Error: permission denied for table role
```

**Solutions**:
```bash
# Check database user has correct permissions
psql "${DATABASE_URL}" -c "SELECT current_user;"

# Grant necessary permissions
psql "${DATABASE_URL}" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO your_user;"
psql "${DATABASE_URL}" -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_user;"
```

#### 4. Demo Data Conflicts

**Symptom**:
```
Error: Unique constraint violation on email
```

**Solutions**:
```bash
# Option 1: Reset entire database
node setup-db.js --demo-data=indian-demo

# Option 2: Clear demo data manually
psql "${DATABASE_URL}" -c "DELETE FROM user WHERE email LIKE '%wayneenterprises%';"

# Option 3: Use demo-data-only mode (safer)
node setup-db.js --demo-data-only --demo-data=indian-demo
```

#### 5. Prisma Client Out of Sync

**Symptom**:
```
Error: The table 'main.new_model' does not exist in the current database.
```

**Solutions**:
```bash
# Regenerate Prisma client
npx prisma generate

# If that doesn't work, reset
rm -rf node_modules/.prisma
npx prisma generate
```

#### 6. Workflow Not Working

**Symptom**:
```
Error: No workflow flow found for model purchase_requisition
```

**Solutions**:
```bash
# Check if workflow exists
psql "${DATABASE_URL}" -c "SELECT * FROM workflow_flow WHERE model_name = 'purchase_requisition';"

# Re-run workflow setup
npx ts-node prisma/setup-workflows.ts

# Verify workflow states
psql "${DATABASE_URL}" -c "SELECT wf.name, ws.name as state FROM workflow_flow wf JOIN workflow_state ws ON wf.id = ws.flow_id WHERE wf.model_name = 'purchase_requisition';"
```

#### 7. Tests Failing

**Symptom**:
```
⚠️  Some tests failed
```

**Solutions**:
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- src/__tests__/permission.test.ts

# Check database state
npx prisma studio

# Reset and retry
node setup-db.js --demo-data=skip
npm test
```

### Debug Checklist

When setup fails, check in order:

1. ✅ PostgreSQL is running
2. ✅ DATABASE_URL is correct
3. ✅ Database user has permissions
4. ✅ Node.js version is 18+
5. ✅ Dependencies are installed (`npm install`)
6. ✅ .env file exists and is loaded
7. ✅ Prisma schema is valid (`npx prisma validate`)
8. ✅ No port conflicts (4000, 3000)

### Getting Help

If issues persist:

1. Check logs: Review console output carefully
2. Check database: Use `npx prisma studio` to inspect data
3. Check schema: Review `.prisma` files for errors
4. Search issues: Check GitHub issues for similar problems
5. Ask for help: Create a new issue with full error logs

---

## 🎯 Production Deployment

### Pre-Deployment Checklist

- [ ] Change default admin password
- [ ] Remove demo data (`--demo-data=skip`)
- [ ] Set strong JWT_SECRET
- [ ] Configure production DATABASE_URL
- [ ] Enable SSL for database connection
- [ ] Set NODE_ENV=production
- [ ] Configure backup strategy
- [ ] Set up monitoring and logging
- [ ] Review and customize roles/permissions
- [ ] Test workflow transitions
- [ ] Configure CORS properly
- [ ] Set up reverse proxy (nginx)

### Production Setup

```bash
# Set environment
export NODE_ENV=production
export DATABASE_URL="postgresql://user:pass@prod-db:5432/fabriq_prod?sslmode=require"
export JWT_SECRET="$(openssl rand -base64 32)"

# Run setup without demo data
node setup-db.js --demo-data=skip --skip-tests

# Change admin password immediately
# (via admin UI or direct database update)

# Start application
npm start
```

### Production Database Best Practices

1. **Use migrations instead of db push**:
   ```bash
   npx prisma migrate deploy
   ```

2. **Regular backups**:
   ```bash
   pg_dump "${DATABASE_URL}" | gzip > backup-$(date +%Y%m%d).sql.gz
   ```

3. **Monitor connection pooling**:
   ```typescript
   // In prisma client config
   datasource db {
     url = env("DATABASE_URL")
     pool_size = 10
   }
   ```

4. **Use read replicas for reporting**

5. **Enable query logging for performance tuning**

---

## 🔐 Security Considerations

### Default Credentials

**⚠️ IMPORTANT**: Change these immediately after setup!

```
Email: admin@example.com
Password: admin123
```

### Security Hardening

1. **Change admin password**:
   ```sql
   UPDATE user
   SET password = '$2a$10$new_bcrypt_hash'
   WHERE email = 'admin@example.com';
   ```

2. **Rotate JWT secret**:
   ```bash
   # Generate new secret
   openssl rand -base64 32

   # Update .env
   JWT_SECRET="new-secret-here"
   ```

3. **Enable HTTPS** (production):
   - Use reverse proxy (nginx)
   - Configure SSL certificates
   - Force HTTPS redirects

4. **Database security**:
   - Use SSL connections
   - Restrict network access
   - Use strong passwords
   - Regular security updates

5. **Review permissions**:
   - Audit role-view assignments
   - Review wildcard permissions
   - Implement least privilege principle

---

## 📊 Post-Setup Verification

After running setup, verify:

### 1. Database Tables

```sql
-- Check table count (should be 50+)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public';

-- Check key tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user', 'role', 'view', 'permission', 'workflow_flow')
ORDER BY table_name;
```

### 2. Metadata Counts

```sql
-- Check roles
SELECT COUNT(*) as role_count FROM role;

-- Check views
SELECT COUNT(*) as view_count FROM view;

-- Check permissions
SELECT COUNT(*) as permission_count FROM permission;

-- Check workflows
SELECT COUNT(*) as workflow_count FROM workflow_flow;
```

### 3. Test Login

```bash
# Test admin login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin123"}'

# Should return:
# { "user": {...}, "token": "eyJhbG..." }
```

### 4. Test API Access

```bash
# Get token from login above
TOKEN="your-jwt-token-here"

# Test getting roles
curl http://localhost:4000/api/role \
  -H "Authorization: Bearer $TOKEN"

# Should return list of roles
```

### 5. Test Frontend

```bash
# Start frontend (in zeiv-v2 directory)
npm run dev

# Open browser
# http://localhost:5173

# Login with admin credentials
# Navigate through master data pages
```

---

## 🔄 Updating Metadata

### Adding a New Role

```sql
-- Insert new role
INSERT INTO role (id, name, description, is_active)
VALUES ('role-custom', 'Custom Role', 'Description here', true);

-- Assign views to role
INSERT INTO role_view (role_id, view_id)
SELECT 'role-custom', id FROM view
WHERE model_name IN ('supplier', 'invoice');
```

### Adding a New View

```sql
-- Insert new view
INSERT INTO view (id, name, model_name, description, data_graph) VALUES (
  'custom_supplier_view',
  'custom_supplier_view',
  'supplier',
  'Custom supplier view with limited fields',
  '{"select": {"id": true, "supplier_name": true, "email": true}}'
);

-- Add permissions
INSERT INTO permission (view_id, field_name, access) VALUES
  ('custom_supplier_view', 'supplier_name', 'write'),
  ('custom_supplier_view', 'email', 'read');

-- Assign to role
INSERT INTO role_view (role_id, view_id)
VALUES ('role-custom', 'custom_supplier_view');
```

### Modifying Workflow

```typescript
// Add new workflow state
const newState = await prisma.workflow_state.create({
  data: {
    flow_id: 'existing-flow-id',
    name: 'New State',
    description: 'New approval state',
    is_initial: false,
    is_final: false,
    assigned_for: 'ROLE',
    assigned_role_id: 'role-id'
  }
});

// Add new workflow action
await prisma.workflow_action.create({
  data: {
    name: 'New Action',
    description: 'Transition to new state',
    source_state_id: 'source-state-id',
    target_state_id: newState.id
  }
});
```

---

## 📝 Summary

The Fabriq deployment process is designed to be:

✅ **Automated** - Single command to set up everything
✅ **Flexible** - Choose which demo data to load
✅ **Safe** - Validates before making changes
✅ **Repeatable** - Can run multiple times
✅ **Testable** - Includes automated tests
✅ **Production-Ready** - Supports production deployments

### Typical Deployment Timeline

- **Local Development**: 5 minutes
- **Staging Environment**: 10 minutes
- **Production Environment**: 15 minutes (with security review)

### What You Get Out of the Box

After running `node setup-db.js`:

- ✅ Complete database schema (50+ tables)
- ✅ RBAC system with 7+ roles
- ✅ 50+ views with field-level permissions
- ✅ 2+ approval workflows
- ✅ Admin user account
- ✅ Optional demo data with realistic scenarios
- ✅ Tested and validated system
- ✅ Ready for login and usage

---

**End of Deployment Guide**

For architecture details, see [CLAUDE.md](./CLAUDE.md)
For API reference, see [API_REFERENCE.md](./API_REFERENCE.md) (if created)
For workflow details, see [WORKFLOWS.md](./WORKFLOWS.md) (if created)
