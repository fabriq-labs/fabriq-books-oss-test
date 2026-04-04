# US-CA Demo Data Setup

This directory contains CSV-based setup data for North American (California/US) business scenarios in the Fabriq Base system. The data is designed for demos and testing, featuring realistic US-based companies and users.

## Overview

The US-CA demo data creates a complete IT vendor company setup with:
- **1 Organization**: TechFlow Solutions Inc (IT vendor based in San Francisco, CA)
- **10 Customers**: Fictional US-based companies across major cities/states
- **8 Suppliers**: Component and hardware suppliers for the IT vendor
- **15 Locations**: Company offices, warehouses, and customer delivery locations
- **20 Items**: Mix of IT hardware products and professional services
- **16 Users**: With American names and proper organizational hierarchy
- **30 Role Assignments**: Super Admin, Admin, Finance, Procurement, Operations teams

## Data Context

All data is contextualized for the United States:
- **Currency**: USD (US Dollar)
- **Locations**: Major US cities and tech hubs (San Francisco, New York, Austin, Seattle, etc.)
- **Companies**: Fictional but realistic company names (not real corporations)
- **Phone Numbers**: US format (+1 area codes)
- **Industries**: Information Technology focus
- **Timezone**: America/Los_Angeles (PST)

## Directory Structure

```
setup-US_CA/
├── org.csv              # Multi-tenancy organization
├── organization.csv     # Business organization
├── customers.csv        # Customer master data
├── suppliers.csv        # Supplier master data
├── locations.csv        # Delivery/pickup locations
├── items.csv            # Product/service catalog
├── users.csv            # User accounts with American names
├── role_user.csv        # Role assignments
├── setup-us-ca-demo.ts  # Main setup script
└── README.md           # This documentation
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
cd prisma/setup-US_CA
npx ts-node setup-us-ca-demo.ts
```

## Data Details

### Organization

| Organization | Location | Type | Business |
|-------------|----------|------|----------|
| TechFlow Solutions Inc | San Francisco, CA | Headquarters | IT Vendor (Hardware & Services) |

### Key Customers

| Customer | Industry | City | State |
|----------|----------|------|-------|
| Aether Dynamics Corp | Information Technology | San Francisco | CA |
| Nexus Systems LLC | Information Technology | New York | NY |
| Vertex Enterprises Inc | Information Technology | Austin | TX |
| Orion Technologies Group | Information Technology | Seattle | WA |
| Pinnacle Solutions Corp | Information Technology | Denver | CO |
| Zenith Networks LLC | Information Technology | Boston | MA |
| Apex Systems Group | Information Technology | Miami | FL |
| Cortex Innovations Inc | Information Technology | Chicago | IL |
| Vanguard Technology Partners | Information Technology | Atlanta | GA |
| Spectrum Digital Solutions | Information Technology | Los Angeles | CA |

### Key Suppliers

| Supplier | Industry | Products | Location |
|----------|----------|----------|----------|
| Global Chip Technologies | Electronics | Microprocessors, GPUs | Austin, TX |
| Pacific Display Systems | Electronics | Monitors, Displays | San Jose, CA |
| Metro Storage Solutions | Computer Hardware | SSDs, Hard Drives | Denver, CO |
| Atlantic Cable Networks | Telecommunications | Network Cables, Switches | Atlanta, GA |
| Summit Battery Technologies | Electronics | Power Banks, Batteries | Detroit, MI |
| Ridge Mountain Manufacturing | Manufacturing | Precision Components | Boise, ID |
| Valley Circuit Boards | Electronics | Motherboards, PCBs | Phoenix, AZ |
| Oceanic Optical Systems | Optics | Optical Components | Portland, OR |

### Products & Services

#### Hardware Products
- **UltraBook Pro 15 Laptop**: $2,499 (Business laptop)
- **Velocity Gaming Desktop**: $3,299 (High-end gaming PC)
- **Crystal 4K Monitor**: $699 (32" 4K display)
- **Enterprise Server Rack**: $8,999 (Data center server)
- **CloudSwitch Pro 48-Port**: $1,299 (Network switch)
- **AeroMesh WiFi Router**: $299 (Mesh networking router)
- **PowerCore 20000 Battery**: $79 (Portable power bank)
- **TerraByte External SSD**: $199 (2TB external storage)
- **Titan RTX 4080 Graphics Card**: $1,199 (Gaming GPU)
- **Prime Z790 Motherboard**: $399 (Intel motherboard)

#### Professional Services
- **IT Infrastructure Consulting**: $15,000 (Planning & design)
- **Cloud Migration Services**: $25,000 (AWS/Azure migration)
- **Managed Cybersecurity**: $12,000 (24/7 security monitoring)
- **Data Analytics Solutions**: $30,000 (BI & analytics platform)
- **Custom Software Development**: $75,000 (Full-stack development)
- **System Integration Services**: $45,000 (API integration)
- **Enterprise Network Design**: $18,000 (Network architecture)
- **AI/ML Solutions**: $50,000 (AI/ML development)
- **Cloud Backup Solutions**: $8,000 (Data protection)
- **IoT Platform Development**: $35,000 (IoT solutions)

### User Hierarchy

```
Daniel Lee (Super Admin)
├── David Brown (Admin)
│   ├── Jessica Garcia (Finance)
│   ├── Christopher Martinez (Delivery)
│   └── Olivia Rodriguez (Buyer)
├── Joseph Young (Admin)
│   ├── Ashley King (Finance)
│   └── Andrew Wright (Delivery)
├── John Smith (Manager - Buyer)
│   ├── Sarah Johnson (Finance)
│   ├── Michael Davis (Delivery)
│   └── Emily Wilson (Buyer)
└── Madison Hall (Buyer)
```

### Demo Credentials

All users have the same password: `Metalimits@123`

#### Super Admin Access
- **Email**: `daniel.lee@techflowsolutions.com`
- **Roles**: Super Admin, Employee

#### Admin Access
- **David Brown**: `david.brown@techflowsolutions.com`
- **Joseph Young**: `joseph.young@techflowsolutions.com`

#### Finance Team
- **Sarah Johnson**: `sarah.johnson@techflowsolutions.com`
- **Jessica Garcia**: `jessica.garcia@techflowsolutions.com`
- **Samantha Clark**: `samantha.clark@techflowsolutions.com`
- **Ashley King**: `ashley.king@techflowsolutions.com`

#### Procurement Team (Buyers)
- **John Smith**: `john.smith@techflowsolutions.com`
- **Emily Wilson**: `emily.wilson@techflowsolutions.com`
- **Olivia Rodriguez**: `olivia.rodriguez@techflowsolutions.com`
- **Madison Hall**: `madison.hall@techflowsolutions.com`

#### Operations Team (Delivery)
- **Michael Davis**: `michael.davis@techflowsolutions.com`
- **Christopher Martinez**: `christopher.martinez@techflowsolutions.com`
- **Anthony White**: `anthony.white@techflowsolutions.com`
- **Andrew Wright**: `andrew.wright@techflowsolutions.com`

## Demo Scenarios

### 1. Hardware Procurement Workflow
**User**: Emily Wilson (Buyer role)
**Scenario**: Purchase GPUs and motherboards from Global Chip Technologies
**Flow**: Draft → Manager Review (John Smith) → Buyer Review (Emily) → Delivery (Michael Davis)

### 2. Service Sales Order Processing
**User**: Sarah Johnson (Finance role)
**Scenario**: Sell cloud migration services to Nexus Systems
**Flow**: Create SO → Generate Invoice → Record Payment

### 3. Supplier Invoice Processing
**User**: Jessica Garcia (Finance role)
**Scenario**: Process Pacific Display Systems invoice for monitors
**Flow**: Receive Invoice → Approve → Record Payment

### 4. Multi-Location Operations
**User**: David Brown (Admin role)
**Scenario**: Manage operations across SF HQ, NYC office, and Austin warehouse

## API Testing Examples

### Authentication
```bash
# Login as US demo user
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "emily.wilson@techflowsolutions.com", "password": "Metalimits@123"}'
```

### Create Purchase Requisition
```bash
# POST /api/purchase_requisition/view/purchase_requisition_view
{
  "title": "GPU Procurement for Gaming Division",
  "supplier_id": "supp_global_chip",
  "description": "High-performance GPUs for Velocity Gaming Desktop production",
  "purchase_requisition_items": [
    {
      "item_id": "item_gaming_desktop",
      "quantity": 50,
      "estimated_cost": 164950.00
    }
  ]
}
```

### Create Sales Order
```bash
# POST /api/sales_order/view/sales_order_view
{
  "title": "Cloud Migration Services",
  "customer_id": "cust_nexus_systems",
  "location_id": "loc_nexus_delivery",
  "sales_order_items": [
    {
      "item_id": "item_cloud_migration",
      "quantity": 1,
      "unit_price": 25000.00
    }
  ]
}
```

## Business Rules Validation

### Procurement Rules
- Purchase requisitions require manager approval for high-value items
- IT hardware purchases need buyer approval
- Delivery team handles logistics for component suppliers

### Sales Rules
- Service orders auto-generate invoices
- Customer-specific pricing for enterprise accounts
- Multi-location delivery support for nationwide customers

### Financial Rules
- All transactions in USD currency
- Standard US business tax calculations
- Inter-company transfer validations

## Customization

### Adding New Customers
1. Add entry to `customers.csv` with US city/state
2. Create corresponding location entry in `locations.csv`
3. Run setup script to import

### Adding New Suppliers
1. Add entry to `suppliers.csv` with US location
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

### Planned Additions
1. **Tax Integration**: US sales tax calculations by state
2. **Shipping Integration**: FedEx/UPS API integration
3. **Payment Processing**: Stripe/PayPal integration
4. **CRM Integration**: Salesforce-style customer management
5. **ERP Integration**: QuickBooks/Oracle integration

### Extended Scenarios
1. **State Tax Compliance**: Different tax rates by US state
2. **International Shipping**: Export scenarios to Canada/Mexico
3. **Multi-Currency**: Euro transactions for European customers
4. **Subsidiary Management**: Complex multi-entity operations

## Support

For issues with US-CA demo data setup:
1. Check this README for common solutions
2. Verify CSV data formats
3. Review database logs for constraint violations
4. Ensure all prerequisites are met

---

**🇺🇸 US-CA Demo Data - Ready for North American Business Demonstrations!**
