# NRI Personal Finance Demo Data

This setup script creates a personal finance tenant for Rajesh Kumar (NRI) with assets in two countries (Canada and India).

## Overview

| Component | Count | Details |
|-----------|-------|---------|
| **Tenant (org)** | 1 | Rajesh Kumar (NRI) |
| **Organizations** | 2 | Canada & India legal entities |
| **Users** | 1 | Super Admin access |
| **Chart of Accounts** | ~90 | Personal finance accounts |

## Data Structure

### Tenant
- **ID**: `org_rajesh`
- **Name**: Rajesh Kumar
- **Slug**: `rajesh-personal`
- **Timezone**: America/Toronto
- **Base Currency**: CAD

### Organizations (Legal Entities)

| Organization | Location | Currency | Purpose |
|--------------|----------|----------|---------|
| Rajesh (Canada) | Toronto, Ontario | CAD | Canadian assets & income |
| Rajesh (India) | Chennai, Tamil Nadu | INR | Indian assets & income |

### User

| Name | Email | Role |
|------|-------|------|
| Rajesh Kumar | rajesh.kumar@metalimits.com | Super Admin |

**Password**: `Metalimits@123`

## Chart of Accounts

Each legal entity has its own country-specific chart of accounts:

### Rajesh (Canada) - `chart-of-accounts-canada.json`

| Category | Key Accounts |
|----------|--------------|
| **Assets** | Checking/Savings, Stocks & ETFs, GICs, RRSP, TFSA, RESP, LIRA |
| **Liabilities** | Credit Card, Mortgage, Car Loan, Line of Credit |
| **Income** | Salary, Dividends, Interest, Capital Gains, Rental |
| **Expenses** | Housing, Transportation, Healthcare, Travel to India |

### Rajesh (India) - `chart-of-accounts-india.json`

| Category | Key Accounts |
|----------|--------------|
| **Assets** | Savings/NRE/NRO Accounts, Stocks, Mutual Funds, FDs, PPF, EPF, NPS |
| **Liabilities** | Credit Card, Home Loan, Gold Loan, Loan Against FD |
| **Income** | Salary, Dividends, FD Interest, STCG/LTCG, LIC Maturity |
| **Expenses** | Housing, Society Maintenance, Domestic Help, Travel to Canada |

### Account Code Structure (same for both)

| Code Range | Category |
|------------|----------|
| 1000-1699 | Assets |
| 2000-2399 | Liabilities |
| 3000-3003 | Equity |
| 4000-4499 | Income |
| 5000-5999 | Expenses |

## Running the Setup

### Option 1: Full Database Reset + NRI Data

```bash
cd backend
node setup-db.js --demo-data=skip --skip-tests
cd prisma/setup-NRI
npx ts-node setup-nri-demo.ts
```

### Option 2: Add to Existing Database (Demo Data Only)

```bash
cd backend
node setup-db.js --demo-data-only --demo-data=skip
cd prisma/setup-NRI
npx ts-node setup-nri-demo.ts
```

### Option 3: Run Setup Script Directly

```bash
cd backend/prisma/setup-NRI
npx ts-node setup-nri-demo.ts
```

## Usage

After setup, login with:
- **Email**: rajesh.kumar@metalimits.com
- **Password**: Metalimits@123

You can then:
1. View/edit chart of accounts
2. Record transactions
3. Track assets across Canada and India
4. Generate financial reports

## Files

| File | Description |
|------|-------------|
| `org.csv` | Tenant record |
| `organization.csv` | Legal entities (Canada & India) |
| `users.csv` | User account |
| `role_user.csv` | Role assignments (Super Admin) |
| `chart-of-accounts-canada.json` | Canada-specific accounts (RRSP, TFSA, GICs, etc.) |
| `chart-of-accounts-india.json` | India-specific accounts (PPF, EPF, NPS, FDs, etc.) |
| `setup-nri-demo.ts` | Setup script |
