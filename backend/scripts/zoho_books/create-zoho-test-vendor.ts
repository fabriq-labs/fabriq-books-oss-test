#!/usr/bin/env ts-node

/**
 * Script to create a test vendor in Zoho Books
 * 
 * This script creates a vendor with test data that can be used for testing
 * purchase order creation.
 * 
 * Usage:
 *   ts-node scripts/create-zoho-test-vendor.ts
 * 
 * Requires environment variables:
 *   - ZOHO_CLIENT_ID
 *   - ZOHO_CLIENT_SECRET
 *   - ZOHO_REFRESH_TOKEN
 *   - ZOHO_ORGANIZATION_ID (optional)
 *   - ZOHO_API_DOMAIN (optional)
 */

import { ZohoBooksAPIClient } from '../../src/lib/integrations/zoho_books/zoho_api_client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function createTestVendor() {
  try {
    console.log('🏭 Creating Test Vendor in Zoho Books\n');
    console.log('─'.repeat(80));

    // Check for required environment variables
    if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN) {
      console.error('❌ Missing required environment variables:');
      console.error('   - ZOHO_CLIENT_ID');
      console.error('   - ZOHO_CLIENT_SECRET');
      console.error('   - ZOHO_REFRESH_TOKEN');
      console.error('\nPlease set these in your .env file.');
      process.exit(1);
    }

    // Initialize Zoho API client
    const zohoClient = new ZohoBooksAPIClient();

    // Get organization ID
    const orgId = await zohoClient.getOrganizationId();
    console.log(`✓ Connected to Zoho Books organization: ${orgId}\n`);

    // Test vendor data
    const testVendorData = {
      vendor_name: 'Test Vendor - Fabriq Integration',
      company_name: 'Test Vendor Inc',
      email: 'test-vendor@example.com',
      phone: '+1-555-0100',
      mobile: '+1-555-0101',
      billing_address: {
        address: '123 Test Street',
        street: '123 Test Street',
        city: 'San Francisco',
        state: 'California',
        zip: '94102',
        country: 'United States',
      },
      shipping_address: {
        address: '123 Test Street',
        street: '123 Test Street',
        city: 'San Francisco',
        state: 'California',
        zip: '94102',
        country: 'United States',
      },
      currency_code: 'USD',
      notes: 'Test vendor created by Fabriq integration script',
    };

    console.log('📋 Vendor data to create:\n');
    console.log(JSON.stringify(testVendorData, null, 2));
    console.log('\n─'.repeat(80));
    console.log('\n🚀 Creating vendor in Zoho Books...\n');

    // Create the vendor
    const vendor = await zohoClient.createVendor(testVendorData);

    console.log('✅ Success! Vendor created in Zoho Books\n');
    console.log('─'.repeat(80));
    console.log('\n📋 Created Vendor Details:\n');
    console.log(JSON.stringify(vendor, null, 2));
    console.log('\n─'.repeat(80));
    
    console.log('\n✅ Vendor Information:');
    console.log(`   Contact ID (vendor_id): ${vendor.contact_id}`);
    console.log(`   Vendor Name: ${vendor.vendor_name || vendor.contact_name}`);
    console.log(`   Company Name: ${vendor.company_name || 'N/A'}`);
    console.log(`   Email: ${vendor.email || 'N/A'}`);
    console.log(`   Phone: ${vendor.phone || vendor.mobile || 'N/A'}`);
    console.log(`   Contact Type: ${vendor.contact_type || 'N/A'}`);
    console.log(`   Status: ${vendor.status || 'N/A'}`);

    console.log('\n─'.repeat(80));
    console.log('\n📝 Use this vendor_id in your test payload:\n');
    console.log(`   vendor_id: "${vendor.contact_id}"`);
    console.log('\n✅ Test vendor created successfully!\n');

  } catch (error: any) {
    console.error('\n❌ Error creating vendor:\n');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response Data:`, JSON.stringify(error.response.data, null, 2));
      
      // Provide helpful error messages
      if (error.response.data?.code === 6041) {
        console.error('\n💡 Error 6041: User not associated with the organization');
        console.error('   This means the refresh token is for a different organization.');
        console.error('   Solution: Generate a new refresh token for the correct organization.');
      } else if (error.response.data?.message?.includes('already exists')) {
        console.error('\n💡 Vendor already exists');
        console.error('   A vendor with this name or email may already exist.');
        console.error('   Solution: Use a different vendor name or email.');
      }
    } else if (error.message) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Unknown error:', error);
    }
    
    process.exit(1);
  }
}

// Run the script
createTestVendor();

