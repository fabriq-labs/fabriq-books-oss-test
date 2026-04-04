# Prisma Database Setup and Seeding

This directory contains the database schema and seed files for the application.

## Database Setup Commands

### Reset and Push Schema
```bash
npx prisma db push --force-reset
```
This command will:
- Reset the database (drop all tables)
- Push the current schema to create all tables
- Useful for fresh database setup

### Run Main Seed
```bash
npx ts-node prisma/seed.ts
```
This seed file creates:
- Super Admin and Admin roles
- Full access views for user, role, view, and permission models
- Initial admin user (email: admin@example.com, password: admin123)

### Run Workflow Seed
```bash
npx ts-node prisma/workflow-seed.ts
```
This seed file creates:
- Finance Team role
- Expense Report Approval workflow with states:
  - Draft
  - Manager Review
  - Finance Review
  - Approved
  - Rejected
- Workflow actions for submitting, approving, and rejecting expense reports

### Sample data for some expense reports
```bash
npx ts-node prisma/expense-workflow-seed.ts
```

## Complete Database Reset and Setup
To completely reset and set up the database with all seed data, run these commands in order:
```bash
npx prisma db push --force-reset
npx ts-node prisma/seed.ts
npx ts-node prisma/workflow-seed.ts
```

## Notes
- Make sure your `.env` file has the correct database connection string before running these commands
- The initial admin credentials are:
  - Email: admin@example.com
  - Password: admin123 