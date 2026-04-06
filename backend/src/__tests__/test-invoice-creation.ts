#!/usr/bin/env ts-node

/**
 * Test Script: Invoice Creation via API
 * 
 * This script mimics the exact browser workflow for creating an invoice:
 * 1. Create initial invoice (POST request)
 * 2. Search for customer using search API
 * 3. Update invoice with customer selection (PUT request)
 * 4. Add invoice line items (POST child request)
 * 5. Update item quantities (PUT child request)
 * 6. Print final invoice response
 * 
 * Each step triggers a PUT/POST request and saves to database, just like the frontend.
 * 
 * Test Data: Uses real data from prasanna@fabriqdata.com's organization (PJ Company)
 * - Customer: Nteli LLC
 * - Item: Software Architect (ITM39) - $80/hour
 * - Organization: PJ Company
 */

import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.test' });

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_USER_EMAIL = 'prasanna@fabriqdata.com';
const TEST_USER_PASSWORD = 'password';

// Test data from database queries
const TEST_DATA = {
  organization: {
    id: '1',
    name: 'PJ Company'
  },
  customers: [
    {
      id: 'cust_85b18213-7322-488c-9378-3e1a867966c6',
      customer_name: 'Nteli LLC',
      primary_email: 'bz@nteligroup.com',
      primary_phone: '000',
      customer_address: '1412 Broadway',
      city: 'New York',
      state: 'New York',
      country: 'USA',
      zip_code: '10018',
      industry: 'IT',
      org_id: '1',
      preferred_currency_id: 'cur_1be1e36d-8434-491c-bbe9-1ad246754f77'
    }
  ],
  items: [
    {
      id: 'prod_d1ad3c2b-3fcd-4d52-a2e4-96df32ccf767',
      item_code: 'ITM39',
      item_name: 'Software Architect',
      name: 'Software Architect',
      item_shortname: 'SA',
      item_description: 'Solution Consulting & Implementation Services',
      item_type: 'Services',
      unit_price: 80,
      stockable: 'No',
      item_status: 'Active',
      lead_time: null,
      org_id: '1',
      item_category_id: 'item_9448325f-7e8e-4c81-9a72-cd2fb191673f',
      currency_master_id: null
    }
  ],
  accounts: [
    {
      id: 'acco_bc037039-7d48-46e4-aaa2-06e7597e2c12',
      name: 'Expense Account',
      type: ['Core'],
      code: 'E101',
      org_id: '1'
    },
    {
      id: 'acco_f2616b94-0bf5-40a9-a81f-8aa3eb8d94bd',
      name: 'Interest Income',
      type: ['Investments'],
      code: 'I120',
      org_id: '1'
    }
  ],
  currency: {
    id: 'cur_1be1e36d-8434-491c-bbe9-1ad246754f77',
    base_currency: 'USD',
    from_currency: 'USD',
    currency_value: 100,
    effective_from: '2025-09-25T08:00:00.000Z',
    status: 'Active',
    org_id: '1'
  }
};

interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class InvoiceCreationTest {
  private authToken: string | null = null;
  private invoiceId: string | null = null;
  private lineItemIds: string[] = [];

  /**
   * Step 1: Authenticate user and get JWT token
   */
  async authenticate(): Promise<void> {
    console.log('🔐 Step 1: Authenticating user...');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD
        })
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const result = await response.json() as any;
      
      if (result.token) {
        this.authToken = result.token;
        console.log(`✅ Authentication successful for user: ${result.user?.name || TEST_USER_EMAIL}`);
        console.log(`   Token: ${this.authToken?.substring(0, 20)}...`);
      } else {
        throw new Error('No token received from authentication');
      }
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Step 2: Create initial invoice (POST request)
   * This mimics the frontend creating a new invoice form
   */
  async createInitialInvoice(): Promise<void> {
    console.log('\n📄 Step 2: Creating initial invoice...');
    
    const invoiceData = {
      invoice_number: `INV-TEST-${Date.now()}`,
      invoice_date: new Date().toISOString(),
      invoice_type: 'SALES'            
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/view/default`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(invoiceData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Invoice creation failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as any;
      
      if (result.data?.id) {
        this.invoiceId = result.data.id;
        console.log(`✅ Invoice created successfully`);
        console.log(`   Invoice ID: ${this.invoiceId}`);
        console.log(`   Invoice Number: ${result.data.invoice_number || invoiceData.invoice_number}`);        
      } else {
        throw new Error('No invoice ID received from creation');
      }
    } catch (error) {
      console.error('❌ Invoice creation failed:', error);
      throw error;
    }
  }

  /**
   * Step 3: Search for customer (mimics frontend customer dropdown search)
   */
  async searchCustomer(searchTerm: string = 'Nteli'): Promise<any> {
    console.log(`\n🔍 Step 3: Searching for customer "${searchTerm}"...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/customers/view/default/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          filters: {
            customer_name: { contains: searchTerm }
          },
          page: 1,
          pageSize: 10,
          sortOption: {}
        })
      });

      if (!response.ok) {
        throw new Error(`Customer search failed: ${response.statusText}`);
      }

      const result = await response.json() as any;
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const customer = result.data[0];
        console.log(`✅ Customer found: ${customer.customer_name}`);
        console.log(`   Customer ID: ${customer.id}`);
        console.log(`   Email: ${customer.primary_email}`);
        console.log(`   Address: ${customer.customer_address}, ${customer.city}`);
        return customer;
      } else {
        throw new Error('No customers found');
      }
    } catch (error) {
      console.error('❌ Customer search failed:', error);
      throw error;
    }
  }

  /**
   * Step 4: Update invoice with customer selection (PUT request)
   * This mimics the frontend updating the invoice when customer is selected
   */
  async updateInvoiceWithCustomer(customer: any): Promise<void> {
    console.log(`\n👤 Step 4: Updating invoice with customer "${customer.customer_name}"...`);
    
    const updateData = {
      customer_id: customer.id
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/${this.invoiceId}/view/default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Invoice update failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as any;
      
      console.log(`✅ Invoice updated with customer details`);
      console.log(`   Customer ID: ${updateData.customer_id}`);
      console.log(`   Customer: ${customer.customer_name}`);
      console.log(`   Address: ${customer.customer_address}, ${customer.city}`);
    } catch (error) {
      console.error('❌ Invoice update failed:', error);
      throw error;
    }
  }

  /**
   * Step 5: Search for items (mimics frontend item dropdown search)
   */
  async searchItems(searchTerm: string = 'Software'): Promise<any[]> {
    console.log(`\n🔍 Step 5: Searching for items "${searchTerm}"...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/item_master/view/default/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          filters: {
            item_name: { contains: searchTerm }
          },
          page: 1,
          pageSize: 10,
          sortOption: {}
        })
      });

      if (!response.ok) {
        throw new Error(`Item search failed: ${response.statusText}`);
      }

      const result = await response.json() as any;
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        console.log(`✅ Found ${result.data.length} items:`);
        result.data.forEach((item: any, index: any) => {
          console.log(`   ${index + 1}. ${item.item_name} - $${item.unit_price} (${item.item_type})`);
        });
        return result.data;
      } else {
        throw new Error('No items found');
      }
    } catch (error) {
      console.error('❌ Item search failed:', error);
      throw error;
    }
  }

  /**
   * Step 6: Add invoice line item (POST child request)
   * This mimics the frontend adding a line item to the invoice
   */
  async addInvoiceLineItem(item: any, quantity: number = 1): Promise<string> {
    console.log(`\n📦 Step 6: Adding line item "${item.item_name}" (qty: ${quantity})...`);
    
    // Count existing line items before creation
    const existingLineItemsCount = await this.getLineItemsCount();
    console.log(`📊 Existing line items count: ${existingLineItemsCount}`);
    
    const lineItemData = {
      item_master_id: item.id,
      item_name: item.item_name,
      item_description: item.item_description,
      item_type: item.item_type,
      invoice_qty: quantity,
      rate: item.unit_price,
      item_number: item.item_code
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/${this.invoiceId}/view/default/invoice_line_item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(lineItemData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Line item creation failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as any;
      
      console.log('🔍 Line item creation response:', JSON.stringify(result, null, 2));
      
      // The API returns the invoice data instead of line item data
      // We need to get the actual line item ID from the database
      const lineItemId = await this.getNewlyCreatedLineItemId(existingLineItemsCount);
      
      if (lineItemId) {
        this.lineItemIds.push(lineItemId);
        console.log(`✅ Line item added successfully`);
        console.log(`   Line Item ID: ${lineItemId}`);
        console.log(`   Item: ${lineItemData.item_name}`);
        console.log(`   Quantity: ${lineItemData.invoice_qty}`);
        console.log(`   Unit Price: $${lineItemData.rate}`);
        console.log(`   Line Total: Calculated by backend`);
        return lineItemId;
      } else {
        throw new Error('No line item ID found after creation');
      }
    } catch (error) {
      console.error('❌ Line item creation failed:', error);
      throw error;
    }
  }

  /**
   * Helper method to count existing line items for the current invoice
   */
  private async getLineItemsCount(): Promise<number> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/${this.invoiceId}/view/default`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (!response.ok) {
        return 0;
      }

      const result = await response.json() as any;
      
      // Count line items in the invoice data
      if (result.data && result.data.invoice_line_item) {
        return Array.isArray(result.data.invoice_line_item) ? result.data.invoice_line_item.length : 0;
      }
      
      return 0;
    } catch (error) {
      console.error('Error getting line items count:', error);
      return 0;
    }
  }

  /**
   * Helper method to get the newly created line item ID based on count
   */
  private async getNewlyCreatedLineItemId(previousCount: number): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/${this.invoiceId}/view/default`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json() as any;
      
      // Get the newly created line item (should be at index previousCount)
      if (result.data && result.data.invoice_line_item && Array.isArray(result.data.invoice_line_item)) {
        const lineItems = result.data.invoice_line_item;
        if (lineItems.length > previousCount) {
          return lineItems[previousCount].id; // The newly created one
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting newly created line item ID:', error);
      return null;
    }
  }

  /**
   * Step 7: Update line item quantity (PUT child request)
   * This mimics the frontend updating quantity which triggers recalculation
   */
  async updateLineItemQuantity(lineItemId: string, newQuantity: number): Promise<void> {
    console.log(`\n📊 Step 7: Updating line item quantity to ${newQuantity}...`);
    
    const updateData = {
        invoice_qty: newQuantity,
        tax_rate: 10
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/${this.invoiceId}/view/default/invoice_line_item/${lineItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Line item update failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as any;
      
      console.log(`✅ Line item quantity updated to ${newQuantity}`);
      console.log(`   Backend will recalculate line total and invoice total automatically`);
    } catch (error) {
      console.error('❌ Line item update failed:', error);
      throw error;
    }
  }

  /**
   * Step 8: Get final invoice with all details
   */
  async getFinalInvoice(): Promise<any> {
    console.log(`\n📋 Step 8: Retrieving final invoice details...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/${this.invoiceId}/view/default`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Invoice retrieval failed: ${response.statusText}`);
      }

      const result = await response.json() as any;
      
      console.log(`✅ Final invoice retrieved successfully`);
      
      return result.data;
    } catch (error) {
      console.error('❌ Invoice retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Print formatted invoice summary
   */
  printInvoiceSummary(invoice: any): void {
    console.log('\n' + '='.repeat(80));
    console.log('📄 FINAL INVOICE SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`Invoice ID: ${invoice.id}`);
    console.log(`Invoice Number: ${invoice.invoice_number || 'N/A'}`);
    console.log(`Invoice Date: ${invoice.invoice_date || 'N/A'}`);
    console.log(`Invoice Type: ${invoice.invoice_type || 'N/A'}`);
    console.log(`Status: ${invoice.status || 'N/A'}`);
    console.log('');
    
    console.log('Customer Details:');
    console.log(`  Name: ${invoice.customer_name || 'N/A'}`);
    console.log(`  Email: ${invoice.customer_email || 'N/A'}`);
    console.log(`  Phone: ${invoice.customer_phone || 'N/A'}`);
    console.log(`  Address: ${invoice.customer_address || 'N/A'}`);
    console.log(`  City: ${invoice.customer_city || 'N/A'}, ${invoice.customer_state || 'N/A'} ${invoice.customer_zip_code || 'N/A'}`);
    console.log(`  Country: ${invoice.customer_country || 'N/A'}`);
    console.log('');
    
    console.log('Financial Summary:');
    console.log(`  Subtotal: $${invoice.invoice_net_total || invoice.subtotal || '0.00'}`);
    console.log(`  Tax Amount: $${invoice.tax_amount || '0.00'}`);
    console.log(`  Total Amount: $${invoice.invoice_total || invoice.total_amount || '0.00'}`);
    console.log(`  Balance Amount: $${invoice.balance_amount || '0.00'}`);
    console.log(`  Currency: ${invoice.currency_id || 'N/A'}`);
    console.log('');
    
    console.log('Line Items:');
    if (invoice.invoice_line_item && invoice.invoice_line_item.length > 0) {
      invoice.invoice_line_item.forEach((item: any, index: number) => {
        console.log(`  ${index + 1}. ${item.item_name || 'N/A'}`);
        console.log(`     Code: ${item.item_code || 'N/A'}`);
        console.log(`     Description: ${item.item_description || 'N/A'}`);
        console.log(`     Quantity: ${item.quantity || '0'}`);
        console.log(`     Unit Price: $${item.unit_price || '0.00'}`);
        console.log(`     Line Total: $${item.line_total || '0.00'}`);
        console.log('');
      });
    } else {
      console.log('  No line items found');
    }
    
    console.log('System Information:');
    console.log(`  Created By: ${invoice.created_by || 'N/A'}`);
    console.log(`  Created At: ${invoice.created_at || 'N/A'}`);
    console.log(`  Modified By: ${invoice.modified_by || 'N/A'}`);
    console.log(`  Modified At: ${invoice.modified_at || 'N/A'}`);
    console.log(`  Organization: ${invoice.org_id || 'N/A'}`);
    console.log(`  Assigned To: ${invoice.assigned_to || 'N/A'}`);
    
    console.log('='.repeat(80));
  }

  /**
   * Run the complete invoice creation workflow
   */
  async runCompleteWorkflow(): Promise<void> {
    try {
      console.log('🚀 Starting Invoice Creation Test Workflow');
      console.log('='.repeat(60));
      
      // Step 1: Authenticate
      await this.authenticate();
      
      // Step 2: Create initial invoice
      await this.createInitialInvoice();
      
      // Step 3: Search for customer
      const customer = await this.searchCustomer('Nteli');
      
      // Step 4: Update invoice with customer
      await this.updateInvoiceWithCustomer(customer);
      
      // Step 5: Search for items
      const items = await this.searchItems('Software');
      
      // Step 6: Add first line item
      const lineItemId1 = await this.addInvoiceLineItem(items[0], 1);
      
      
      // Step 7: Update quantity (this triggers backend recalculation)
      await this.updateLineItemQuantity(lineItemId1, 2);
      
      // Step 8: Search for second item and add it (using same item with different quantity)
      const softwareItems = await this.searchItems('Architect');
      if (softwareItems.length > 0) {
        await this.addInvoiceLineItem(softwareItems[0], 5);
      }
      
      // Step 9: Get final invoice
      const finalInvoice = await this.getFinalInvoice();
      
      // Step 10: Print summary
      this.printInvoiceSummary(finalInvoice);
      
      console.log('\n🎉 Invoice creation workflow completed successfully!');
      console.log(`📄 Invoice ID: ${this.invoiceId}`);
      console.log(`🔗 You can view this invoice in the frontend using ID: ${this.invoiceId}`);
      
    } catch (error) {
      console.error('\n💥 Workflow failed:', error);
      throw error;
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🧪 Invoice Creation API Test Script');
  console.log('This script mimics the exact browser workflow for creating invoices');
  console.log('Each step triggers API calls that save to the database');
  console.log('Using real data from prasanna@fabriqdata.com (PJ Company)\n');
  
  const test = new InvoiceCreationTest();
  
  try {
    await test.runCompleteWorkflow();
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  main();
}

export { InvoiceCreationTest };
