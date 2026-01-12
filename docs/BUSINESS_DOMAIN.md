# Business Domain Context - Fabriq Financial Suite

**When to read**: Understanding business rules, module relationships, feature planning
**Related docs**: [ARCHITECTURE.md](./ARCHITECTURE.md), [WORKFLOWS.md](./WORKFLOWS.md)

---

## System Overview

Fabriq Financial Suite is a comprehensive financial management application built on a metadata-driven framework designed for small businesses and individuals. The system provides integrated modules for procurement, sales, accounting, and investment tracking through a unified platform.

## Core Architecture Principles

### Metadata-Driven Framework
- **Automatic API Generation**: REST APIs are automatically generated for all business models
- **View-Based Access Control**: All data access is controlled through configurable views with field-level permissions
- **Workflow Engine**: State-based approval processes for transactional models
- **Role-Based Security**: Granular permissions system with role-based access control
- **Real-Time Metadata**: Database state is queried in real-time for accurate system understanding

### Key Framework Components
- **Model Registry**: Business metadata for AI agent understanding
- **Workflow System**: Configurable approval processes with state management
- **Permission System**: Field-level access control with role assignments
- **Organization Management**: Multi-tenant support with organization-level data isolation

## Business Domain Modules

### 1. Procurement Module
**Purpose**: Manage the complete purchase-to-pay process for business operations

#### Core Models
- **`supplier`**: Vendor management with contact details, payment terms, shipping preferences
- **`purchase_requisition`**: Internal purchase requests with approval workflows
- **`purchase_order`**: Official purchase orders sent to suppliers
- **`purchase_order_item`**: Line items within purchase orders
- **`invoice`**: Supplier invoices for goods/services received
- **`invoice_line_item`**: Detailed line items within invoices

#### Business Process Flow
```
Purchase Requisition → Purchase Order → Invoice → Payment Processing
```

#### Key Features
- Multi-level approval workflows for purchase requisitions
- Supplier relationship management
- Item catalog integration
- Budget control and project allocation
- Invoice matching and three-way matching
- Payment terms and shipping management

### 2. Sales Module (Order Management)
**Purpose**: Manage the complete order-to-cash process for customer sales - essentially a mirror application of the procurement module

#### Core Concept: Mirror Application
The Sales Module is designed as a **mirror application** of the procurement module, where:
- **Procurement** = Money going out (purchases from suppliers)
- **Sales** = Money coming in (sales to customers)
- **Same Patterns**: Uses identical data models, workflows, and UI patterns
- **Reusable Components**: Most existing components can be adapted
- **Consistent Architecture**: Same database patterns, API structures, and business logic

#### Core Models

##### Customer Management
- **`customers`**: Customer master data (mirrors supplier structure)
  - Customer contact details, addresses, payment terms
  - Credit limits and payment preferences
  - Industry classification and business details
  - Integration with location master for delivery addresses

##### Sales Order Management
- **`sales_order`**: Customer orders with fulfillment tracking
  - Order numbering (SO-YYYY-NNNNN format)
  - Customer selection and delivery location
  - Order status workflow management
  - Project and department allocation
- **`sales_order_item`**: Line items within sales orders
  - Item selection from item_master catalog
  - Quantity, pricing, and delivery tracking
  - Partial delivery and invoicing status

##### Invoice Management
- **`invoice`**: Sales invoices (extends existing invoice model)
  - Invoice type field ('PURCHASE' or 'SALES')
  - Customer reference for sales invoices
  - Auto-generation from sales orders
  - Manual invoice creation capability
- **`invoice_line_item`**: Detailed line items (extends existing model)
  - Sales order item reference
  - Tax calculation and totals

##### Payment Management
- **`payment_receipt`**: Customer payment tracking
  - Multiple payment methods (cash, check, bank transfer, digital wallets)
  - Payment type classification (FULL, PARTIAL, ADVANCE)
  - Invoice allocation and outstanding balance tracking
  - Bank reconciliation support

##### Delivery Management
- **`delivery_challan`**: Delivery documentation and tracking
  - Auto-generation from sales orders
  - Delivery scheduling and status tracking
  - Driver and vehicle information
  - Partial delivery support
- **`delivery_challan_item`**: Items within delivery challans
  - Quantity tracking (ordered vs delivered)
  - Delivery status per item
  - Backorder management for undelivered quantities

#### Business Process Flows

##### Primary Sales Flow
```
Sales Order Creation → Sales Review → Customer Approval → Order Confirmation → 
Production/Preparation → Delivery Scheduling → Shipment → Delivery → Completion
```

##### Invoice Generation Flow
```
Sales Order Confirmation → Invoice Auto-Generation → Invoice Review → 
Invoice Sending → Payment Tracking → Payment Receipt Recording
```

##### Delivery Management Flow
```
Order Confirmation → Delivery Planning → Challan Generation → 
Delivery Execution → Status Updates → Completion Tracking
```

#### Key Features

##### Sales Order Management
- **Order Entry**: Create sales orders with customer details, items, quantities, and pricing
- **Customer Selection**: Link orders to existing customer records
- **Delivery Location Selection**: Select delivery location from location master
- **Item Management**: Select items from existing item_master catalog
- **Pricing Support**: Multiple pricing tiers (list price, customer-specific, volume discounts)
- **Order Validation**: Ensure sufficient inventory/availability before confirmation
- **Order Modification**: Add, modify, or remove items from pending orders
- **Order Cancellation**: Cancel orders with proper authorization

##### Status Management
- **Sales Order Status Workflow**: Draft → Sales Review → Customer Approval → Confirmed → In Production → Ready for Shipment → Shipped → Delivered → Completed
- **Status Transitions**: Enforce business rules for status changes
- **Role-Based Updates**: Different roles can update specific statuses
- **Automated Updates**: Update status based on delivery challan and invoice generation

##### Invoice Management
- **Auto-generation**: Generate invoices from confirmed sales orders
- **Manual Creation**: Create standalone invoices for services or adjustments
- **Batch Processing**: Generate multiple invoices simultaneously
- **Invoice Templates**: Support multiple invoice formats and layouts
- **Tax Management**: Apply appropriate tax rates based on customer location
- **Discount Application**: Apply order-level and line-item discounts
- **Payment Terms**: Set payment due dates based on customer terms

##### Payment Receipt Management
- **Multiple Payment Methods**: Cash, check, bank transfer, credit card, digital wallets
- **Partial Payments**: Record partial payments against specific invoices
- **Full Payments**: Record full payments against specific invoices
- **Advance Payments**: Handle advance payments against future invoices
- **Payment Validation**: Ensure payment amount doesn't exceed invoice total
- **Bank Reconciliation**: Match payments with bank statements
- **Outstanding Tracking**: Track outstanding amounts by customer and invoice

##### Delivery Management
- **Auto-generation**: Generate delivery challans from sales orders
- **Manual Creation**: Create standalone delivery challans
- **Batch Generation**: Generate multiple challans for consolidated shipments
- **Partial Deliveries**: Create multiple challans for same order with different delivery dates
- **Split Deliveries**: Split single order across multiple delivery challans
- **Delivery Scheduling**: Schedule deliveries with customer preferences
- **Route Optimization**: Optimize delivery routes for efficiency
- **Delivery Tracking**: Track delivery status in real-time
- **Proof of Delivery**: Capture delivery confirmation and signatures

##### Inventory Integration
- **Stock Allocation**: Reserve inventory for confirmed orders
- **Stock Updates**: Update inventory levels upon shipment
- **Backorder Management**: Handle items not currently in stock
- **Inventory Alerts**: Notify when stock levels fall below thresholds
- **Partial Stock Allocation**: Reserve partial quantities when full stock unavailable

#### Advanced Features

##### Partial Operations Support
- **Partial Payment Workflow**:
  1. Payment Entry → Payment Validation → Payment Type Determination → Balance Tracking → Follow-up Actions
  2. Payment type automatically determined: FULL (amount = invoice total), PARTIAL (amount < invoice total), ADVANCE (no invoice reference)
  3. Multiple payments can be made against same invoice until fully paid

- **Partial Delivery Workflow**:
  1. Delivery Planning → Quantity Validation → Status Updates → Backorder Creation → Follow-up Deliveries
  2. Partial deliveries must not exceed ordered quantities
  3. Multiple delivery challans can be created for same order
  4. Backorders are created for undelivered quantities

##### Address Management
- **Customer Address Display**: System displays customer's primary address
- **Delivery Location Selection**: User selects delivery location from location master
- **Address Validation**: System validates delivery location belongs to customer's organization
- **Multiple Delivery Locations**: Different delivery locations for different orders from same customer

#### Role-Based Access Control

##### Sales Team Roles
- **Sales Representative**: Create and edit sales orders, manage customer relationships
- **Sales Manager**: Approve sales orders, access sales reports, manage team performance
- **Sales Director**: Full sales access, strategic reporting, customer relationship management

##### Finance Team Roles
- **Accounts Receivable**: Process customer payments, manage invoicing
- **Finance Manager**: Access both purchase and sales financial data, approve payments
- **CFO**: Full financial oversight, access to all financial reports

##### Operations Team Roles
- **Warehouse Manager**: Manage delivery challans, track shipments, update delivery status
- **Operations Manager**: Oversee fulfillment process, manage delivery schedules
- **Logistics Coordinator**: Schedule deliveries, manage shipping methods and terms

#### Business Rules

##### Address Rules
- Customer address comes from customer master record
- Delivery address must be selected from existing location master
- Delivery location must belong to same organization as customer
- Multiple delivery locations can be used for different orders from same customer

##### Payment Rules
- Each payment receipt must reference exactly one invoice (or null for advance payments)
- Payment amount cannot exceed invoice total
- Payment type automatically determined based on amount and invoice reference
- Multiple payments can be made against same invoice until fully paid
- Advance payments can be applied to future invoices when created

##### Delivery Rules
- Partial deliveries must not exceed ordered quantities
- Multiple delivery challans can be created for same order
- Delivery status updates automatically based on quantities
- Backorders are created for undelivered quantities

##### Workflow Rules
- Sales orders follow different approval process than purchase orders
- Customer approval may be required based on order value or customer type
- Sales team has different status update permissions than purchase team
- Separate reporting and analytics for sales vs purchase operations

### 3. Accounting & Ledger Module
**Purpose**: Core financial record keeping and double-entry bookkeeping

#### Core Models
- **`account`**: Chart of accounts with hierarchical structure
- **`posting`**: Journal entries with debit/credit accounts
- **`category`**: Transaction categorization for reporting
- **`category_group`**: Grouped categories for financial reporting

#### Key Features
- Double-entry bookkeeping system
- Chart of accounts management
- Transaction categorization
- Financial reporting foundation
- Integration with procurement and sales modules

### 4. Investment Tracking Module (Future Scope)
**Purpose**: Track investment portfolios and trading activities

#### Core Models
- **`instrument`**: Financial instruments (stocks, bonds, mutual funds, ETFs)
- **`trade`**: Buy/sell transactions with brokerage and tax details
- **`holding`**: Current portfolio positions with market values
- **`income_type`** & **`income_source`**: Investment income categorization

#### Key Features
- Portfolio position tracking
- Trade execution recording
- Market value calculations
- P&L tracking (realized and unrealized)
- Investment income categorization

## Shared Infrastructure Models

### Master Data Models
- **`item_master`**: Product/service catalog used by both procurement and sales
- **`currency_master`**: Multi-currency support
- **`tax_master`**: Tax rate management
- **`payment_terms`**: Payment terms for suppliers and customers
- **`shipping_method`** & **`shipping_terms`**: Logistics management
- **`location`**: Address management for deliveries and billing

### Organizational Models
- **`organization`**: Company/entity management
- **`department`**: Organizational structure
- **`business_unit`**: Business unit hierarchy
- **`cost_center`**: Cost allocation centers
- **`project_master`**: Project-based accounting
- **`budget_period`** & **`budget_line`**: Budget management

### User Management Models
- **`user`**: System users with authentication
- **`role`**: User roles and permissions
- **`view`**: Data access views with field-level permissions
- **`permission`**: Granular access control
- **`employee_master`**: Employee information and hierarchy

## Workflow System

### Workflow Components
- **`workflow_flow`**: Workflow definitions for different models
- **`workflow_state`**: States within workflows (Draft, Review, Approved, etc.)
- **`workflow_action`**: Transitions between states
- **`workflow_instance`**: Active workflow instances
- **`workflow_history`**: Audit trail of workflow transitions

### Common Workflow Patterns
1. **Simple Approval**: Draft → Manager Review → Approved/Rejected
2. **Multi-Level Approval**: Draft → Manager → Finance → Approved/Rejected
3. **Department-Based**: Draft → Department Head → Finance → Approved/Rejected
4. **Expression-Based Assignment**: Dynamic assignment based on business rules

## Data Relationships

### Cross-Module Integration
- **Procurement → Accounting**: Purchase orders create accounts payable entries
- **Sales → Accounting**: Sales orders create accounts receivable entries
- **Investment → Accounting**: Trades create journal entries for portfolio changes
- **All Modules → Reporting**: Unified reporting across all business functions

### Key Relationships
- Items are shared between procurement and sales modules
- Customers and suppliers use similar data structures
- All transactions flow through the posting system for accounting
- Workflows provide consistent approval processes across modules

## Business Rules & Constraints

### Procurement Rules
- Purchase requisitions require approval before becoming purchase orders
- Purchase orders must reference valid suppliers and items
- Invoices must match purchase orders for three-way matching
- Budget controls prevent overspending

### Sales Rules
- **Order Management**: Sales orders require customer approval (configurable based on order value or customer type)
- **Delivery Management**: Delivery challans cannot exceed ordered quantities; partial deliveries supported with backorder creation
- **Payment Management**: Partial payments are tracked against specific invoices with automatic type determination (FULL/PARTIAL/ADVANCE)
- **Credit Management**: Customer credit limits are enforced during order creation
- **Address Management**: Delivery locations must belong to customer's organization; multiple delivery locations supported
- **Inventory Management**: Stock allocation reserves inventory for confirmed orders; partial stock allocation supported
- **Status Management**: Order status transitions follow defined workflow with role-based permissions
- **Invoice Management**: Invoices can be auto-generated from sales orders or created manually; supports both purchase and sales invoice types

### Accounting Rules
- All transactions must balance (debit = credit)
- Chart of accounts maintains hierarchical structure
- Categories provide consistent transaction classification
- Multi-currency transactions use exchange rates

## Technical Implementation Notes

### Database Design
- All models include standard audit fields (created_by, modified_by, created_at, modified_at)
- Organization-level data isolation through org_id fields
- Workflow integration through wf_instance_id fields
- Unique constraints prevent data duplication

### API Architecture
- Automatic REST API generation for all models
- Consistent URL patterns: `/model/view/:viewId` for all operations
- View-based access control with field-level permissions
- Generic service layer handles all model operations

### Security Model
- Role-based access control with granular permissions
- Field-level security through view configurations
- Organization-level data isolation
- Audit trails for all workflow transitions

## Implementation Phases

### Sales Module Implementation Strategy

#### Phase 1: Manual Invoice Creation (Current Priority)
**Objective**: Enable finance team to create sales invoices manually without requiring sales orders

**Key Deliverables**:
- Customer model setup and CRUD operations
- Invoice model extension to support sales invoices (invoice_type field)
- Manual invoice creation UI with customer selection
- Payment receipt integration with payment allocation
- Invoice management features (listing, editing, status management)

**Business Value**:
- Immediate revenue recognition capability
- Support for service-based invoicing
- Handle ad-hoc sales transactions
- Foundation for future sales order integration

#### Phase 2: Sales Order Integration
- Sales order model creation and management
- Invoice generation from sales orders
- Order-to-invoice workflow integration
- Advanced order status management

#### Phase 3: Delivery Management
- Delivery challan generation with partial delivery support
- Delivery tracking and status management
- Inventory integration with partial stock allocation
- Backorder management for undelivered quantities

#### Phase 4: Advanced Features
- Advanced reporting and analytics
- Payment tracking and reconciliation
- Workflow integration for partial operations
- Performance optimization

## Future Expansion Areas

### Planned Enhancements
1. **Advanced Inventory Management**: Multi-location tracking, serial numbers
2. **CRM Integration**: Lead management, sales pipeline
3. **Advanced Reporting**: Predictive analytics, custom dashboards
4. **Integration APIs**: Third-party system connectivity
5. **Mobile Applications**: Field sales and procurement support

### Investment Module Expansion
- Real-time market data integration
- Advanced portfolio analytics
- Tax optimization strategies
- Risk management tools
- Performance benchmarking

### Sales Module Advanced Features (Future)
- **Complex Payment Scenarios**: Multi-currency partial payments, payment plans, installment tracking
- **Advanced Delivery Management**: Route optimization for partial deliveries, dynamic delivery scheduling
- **Automated Follow-ups**: AI-powered payment reminders and delivery scheduling
- **Complex Allocation Logic**: Advanced payment allocation algorithms beyond FIFO

## Success Metrics

### Operational Metrics
- **Order Processing**: 50% reduction in order processing time
- **Invoice Automation**: 90% automation rate for invoice generation
- **Payment Collection**: 30% reduction in payment collection cycle
- **Delivery Accuracy**: 25% improvement in delivery accuracy
- **Order Volume**: 20% increase in order volume handling capacity
- **Cash Flow**: 15% improvement in cash flow due to faster invoicing
- **Fulfillment Errors**: 10% reduction in order fulfillment errors
- **Customer Satisfaction**: 25% improvement in customer satisfaction scores

### User Adoption Metrics
- **Sales Team Adoption**: 80% of sales team actively using system within 3 months
- **User Satisfaction**: 90% user satisfaction rating
- **Support Reduction**: 50% reduction in order-related support tickets
- **Manual Entry Reduction**: 75% reduction in manual data entry

### Business Impact Metrics
- **Payment Collection Time**: 30% reduction through partial payment tracking
- **Delivery Efficiency**: 20% improvement through partial delivery management
- **Revenue Recognition**: Immediate capability for service-based invoicing
- **Process Standardization**: Consistent workflows across procurement and sales

## Usage Guidelines for AI Agents

### When Working with This System
1. **Always Query Real-Time State**: Use MCP PostgreSQL tools to check current database state before making changes
2. **Understand Model Relationships**: Recognize how procurement, sales, and accounting modules interact
3. **Respect Workflow Rules**: Follow established approval processes for transactional models
4. **Maintain Data Integrity**: Ensure all relationships and constraints are properly maintained
5. **Use Consistent Patterns**: Follow established naming conventions and data structures

### Common Operations
- **Creating New Models**: Follow the established patterns for audit fields, relationships, and constraints
- **Setting Up Workflows**: Use the workflow system for approval processes
- **Configuring Permissions**: Set up views and roles for proper access control
- **Integrating Modules**: Ensure new features work seamlessly with existing modules

This business domain context provides the foundation for understanding and extending the Fabriq Financial Suite system while maintaining consistency with the established architecture and business rules.
