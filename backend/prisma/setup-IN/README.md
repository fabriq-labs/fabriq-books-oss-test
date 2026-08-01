# Indian Demo Data Setup

This directory contains CSV-based setup data for Indian business scenarios in the Fabriq Base system. The data is designed for demos and testing, featuring realistic Indian companies, suppliers, and user profiles.

## Overview

The Indian demo data creates a complete multi-org setup with:
- **3 Organizations**: Demo Tech Solutions India (HQ + 2 branches)
- **10 Major Customers**: TCS, Infosys, Wipro, Reliance, HDFC, ICICI, Mahindra, Bajaj, Dr. Reddy's, Sun Pharma
- **10 Key Suppliers**: Dell, HP, Lenovo, TVS Motors, Ashok Leyland, Maruti Suzuki, Cipla, Lupin, Torrent Pharma, Apollo Tyres
- **15 Locations**: Across major Indian cities (Mumbai, Bangalore, Delhi, Chennai, Hyderabad, etc.)
- **20 Items**: Mix of IT hardware, automotive products, pharmaceuticals, and services
- **16 Users**: With realistic Indian names and hierarchical reporting structure
- **30 Role Assignments**: Proper role-based access control
- **Reconciliation + AR demo data** (see [DEMO_ROADMAP.md](../../../../docs/positioning/DEMO_ROADMAP.md)):
  - **Payment terms**: Net 15, Net 30 (linked to first 5 customers)
  - **12 Sales invoices**: INV-001 … INV-012 (mix of paid, partially paid, overdue, current)
  - **6 Payment receipts**: 5 applied to invoices, 1 unapplied (advance)
  - **20 Bank postings**: Statement-like lines; subset matchable to payments, 3–5 unmatched for “suggest match” demo

## Data Context

All data is contextualized for India:
- **Currency**: INR (Indian Rupee)
- **Locations**: Major Indian cities and business districts
- **Companies**: Real Indian corporations and suppliers
- **Phone Numbers**: Indian format (+91 prefixes)
- **Industries**: IT, Automotive, Pharmaceuticals, Banking, Manufacturing
- **Timezone**: Asia/Kolkata

## Directory Structure

```
setup-IN/
├── org.csv                  # Multi-tenancy organizations
├── organization.csv         # Business organizations
├── chart-of-accounts.json   # Indian COA template (used for demo org)
├── customers.csv            # Customer master data
├── suppliers.csv            # Supplier master data
├── locations.csv            # Delivery/pickup locations
├── items.csv                # Product/service catalog
├── users.csv                # User accounts with Indian names
├── role_user.csv            # Role assignments
├── setup-indian-demo.ts     # Main setup script (includes AR + reconciliation seed)
└── README.md                # This documentation
```

## Prerequisites

1. **Database Setup**: Ensure PostgreSQL is running and accessible
2. **Metadata Setup**: Run the main metadata setup first:
   ```bash
   npx ts-node prisma/setup-metadata.ts
   ```
3. **Workflow Setup**: Run workflow setup:
   ```bash
   npx ts-node prisma/setup-workflows.ts
   ```
4. **Node Dependencies**: Ensure csv-parser is installed:
   ```bash
   npm install csv-parser
   ```

   **Note**: The setup script uses CommonJS `require()` for csv-parser compatibility with TypeScript.

## Execution

```bash
# From the project root
cd prisma/setup-IN
npx ts-node setup-indian-demo.ts
```

## Data Details

### Organizations

| Organization | Location | Type |
|-------------|----------|------|
| Demo Tech Solutions India | Bangalore | Headquarters |
| Mumbai Tech Hub | Mumbai | Branch Office |
| Bangalore Innovation Center | Bangalore | Branch Office |

### Key Customers

| Customer | Industry | City |
|----------|----------|------|
| Tata Consultancy Services | IT Services | Mumbai |
| Infosys Limited | IT Services | Bangalore |
| Wipro Limited | IT Services | Bangalore |
| Reliance Industries | Energy | Mumbai |
| HDFC Bank | Banking | Mumbai |
| ICICI Bank | Banking | Mumbai |
| Mahindra & Mahindra | Automotive | Mumbai |
| Bajaj Auto | Automotive | Pune |
| Dr. Reddy's Laboratories | Pharmaceuticals | Hyderabad |
| Sun Pharmaceutical | Pharmaceuticals | Vadodara |

### Key Suppliers

| Supplier | Industry | Products |
|----------|----------|----------|
| Dell Technologies | IT Hardware | Laptops, Desktops, Monitors |
| HP India | IT Hardware | Laptops, Printers |
| Lenovo India | IT Hardware | Laptops, Tablets |
| TVS Motor | Automotive | Two-wheelers |
| Ashok Leyland | Automotive | Commercial vehicles |
| Maruti Suzuki | Automotive | Cars |
| Cipla | Pharmaceuticals | Medicines |
| Lupin | Pharmaceuticals | Medicines |
| Torrent Pharma | Pharmaceuticals | Medicines |
| Apollo Tyres | Automotive | Tyres |

### User Hierarchy

```
Sanjay Gupta (Super Admin, Finance Team)
├── Vikram Joshi (Admin)
│   ├── Kavya Nair (Finance)
│   ├── Rohit Kumar (Delivery)
│   └── Meera Rao (Buyer)
├── Karan Bhatia (Admin)
│   ├── Pooja Saxena (Finance)
│   └── Rajesh Yadav (Delivery)
├── Arjun Sharma (Manager - Buyer)
│   ├── Priya Patel (Finance)
│   ├── Rahul Verma (Delivery)
│   └── Ananya Singh (Buyer)
└── Neha Agarwal (Buyer)
    └── Amit Shah (Delivery)
```

### Demo Credentials

All users have the same password: `Metalimits@123`

#### Super Admin + Finance
- **Email**: `sanjay.gupta@demo-india.com`
- **Roles**: Super Admin, Finance Team, Employee

#### Admin Access
- **Vikram Joshi**: `vikram.joshi@demo-india.com`
- **Karan Bhatia**: `karan.bhatia@demo-india.com`

#### Finance Team
- **Sanjay Gupta**: `sanjay.gupta@demo-india.com` (also Super Admin)
- **Priya Patel**: `priya.patel@demo-india.com`
- **Kavya Nair**: `kavya.nair@demo-india.com`
- **Divya Menon**: `divya.menon@demo-india.com`
- **Pooja Saxena**: `pooja.saxena@demo-india.com`

#### Procurement Team (Buyers)
- **Arjun Sharma**: `arjun.sharma@demo-india.com`
- **Ananya Singh**: `ananya.singh@demo-india.com`
- **Meera Rao**: `meera.rao@demo-india.com`
- **Neha Agarwal**: `neha.agarwal@demo-india.com`

#### Operations Team (Delivery)
- **Rahul Verma**: `rahul.verma@demo-india.com`
- **Rohit Kumar**: `rohit.kumar@demo-india.com`
- **Amit Shah**: `amit.shah@demo-india.com`
- **Rajesh Yadav**: `rajesh.yadav@demo-india.com`

## Demo Scenarios

### 1. Purchase Requisition Workflow
**User**: Ananya Singh (Buyer role)
**Scenario**: Create PR for IT equipment from Dell
**Flow**: Draft → Manager Review (Arjun) → Buyer Review (Ananya) → Delivery (Rahul)

### 2. Sales Order Processing
**User**: Priya Patel (Finance role)
**Scenario**: Process sales order from TCS for software services
**Flow**: Create SO → Generate Invoice → Record Payment

### 3. Supplier Invoice Processing
**User**: Kavya Nair (Finance role)
**Scenario**: Process Dell invoice for laptop purchase
**Flow**: Receive Invoice → Approve → Record Payment

### 4. Multi-Location Operations
**User**: Vikram Joshi (Admin role)
**Scenario**: Manage operations across Mumbai and Bangalore locations

## API Testing Examples

### Authentication
```bash
# Login as Indian demo user
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "ananya.singh@demo-india.com", "password": "Metalimits@123"}'
```

### Create Purchase Requisition
```bash
# POST /api/purchase_requisition/view/purchase_requisition_view
{
  "title": "IT Equipment Purchase",
  "supplier_id": "supp_dell_india",
  "description": "Laptops for development team",
  "purchase_requisition_items": [
    {
      "item_id": "item_dell_laptop",
      "quantity": 5,
      "estimated_cost": 425000.00
    }
  ]
}
```

### Create Sales Order
```bash
# POST /api/sales_order/view/sales_order_view
{
  "title": "Software Development Services",
  "customer_id": "cust_tata_consultancy",
  "location_id": "loc_tcs_delivery",
  "sales_order_items": [
    {
      "item_id": "item_it_consulting",
      "quantity": 1,
      "unit_price": 250000.00
    }
  ]
}
```

## Business Rules Validation

### Procurement Rules
- Purchase requisitions require manager approval
- IT equipment purchases need buyer approval
- Delivery team handles logistics coordination

### Sales Rules
- Service orders auto-generate invoices
- Customer-specific pricing and terms
- Multi-location delivery support

### Financial Rules
- All transactions in INR currency
- GST compliance for Indian market
- Inter-company transfer validations

## Customization

### Adding New Customers
1. Add entry to `customers.csv`
2. Create corresponding location entry in `locations.csv`
3. Run setup script to import

### Adding New Suppliers
1. Add entry to `suppliers.csv`
2. Create item entries in `items.csv` linked to supplier
3. Update setup script if needed

### Modifying User Roles
1. Update `role_user.csv` with new assignments
2. Ensure role IDs match existing roles in system

## Troubleshooting

### CSV Format Issues
- Ensure all required fields are present
- Check date formats (ISO 8601: `2024-01-15T10:00:00Z`)
- Verify boolean values (`true`/`false`)
- Check numeric values (no commas in numbers)

### Database Connection Issues
- Verify `DATABASE_URL` environment variable
- Ensure PostgreSQL is running
- Check user permissions for database operations

### Role Assignment Errors
- Ensure roles exist before assigning
- Verify user IDs match created users
- Check role ID formats

### Data Integrity Issues
- Foreign key constraints may fail if referenced records don't exist
- Ensure parent records are imported before child records
- Check for duplicate IDs across CSV files

### CSV Parser Import Issues
- **Error**: "This expression is not callable" with csv-parser
- **Solution**: The script uses `require()` instead of ES6 imports for compatibility
- **Cause**: csv-parser uses CommonJS exports, not ES6 modules
- **Alternative**: If you need ES6 imports, add `"esModuleInterop": true` to tsconfig.json

## Future Enhancements

### Reconciliation + AR Demo (included)
- **Payment terms**: Net 15, Net 30; first 5 customers linked.
- **Invoices**: INV-001 … INV-012 (SALES), mix of balance = 0 and balance &gt; 0, some overdue.
- **Payment receipts**: REC-DEMO-001 … REC-DEMO-007; five applied to invoices, one unapplied (advance) for cash-application demo.
- **FY journal postings**: `posting-demo-*.csv` (~300 lines per legal entity; full double-entry).
- **Opening balances**: `opening-balances/*.csv` — FY2024-25 closing (2025-03-31) for India entities, CY2024 closing (2024-12-31) for US; imported as `OPENING_BALANCE` migration journal on setup.
- **Reconciliation bank lines**: `posting.csv` — 24 one-sided lines on HQ Checking (1102); `DEMO:` descriptions; `post_demo_01`–`05` pre-matched to receipts; `post_demo_21`–`24` for invoice/receipt matching in UI/agent.
- **Reset reconciliation only**: `npx ts-node setup-indian-demo.ts --reset-postings` (does not touch FY journals).
  - Same action is available in the UI: **Super Admin → Demo Data Management** (`/settings/demo-data`).

### Planned Additions
1. **Invoice Templates**: Indian GST-compliant invoice formats
2. **Tax Masters**: GST rates for different Indian states
3. **Banking Integration**: Indian banking APIs
4. **Compliance**: GST filing and Indian regulatory requirements

### Extended Scenarios
1. **Inter-State Transactions**: GST implications for different states
2. **Export/Import**: International trade scenarios
3. **Multi-Currency**: USD transactions for international clients
4. **Subsidiary Management**: Complex multi-entity operations

## Support

For issues with Indian demo data setup:
1. Check this README for common solutions
2. Verify CSV data formats
3. Review database logs for constraint violations
4. Ensure all prerequisites are met

---

**🇮🇳 Indian Demo Data - Ready for Business Process Demonstrations!**
