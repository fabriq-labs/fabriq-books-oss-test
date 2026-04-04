#!/usr/bin/env ts-node

/**
 * Script to fetch vendors from Zoho Books
 * 
 * Usage:
 *   ts-node scripts/fetch-zoho-vendors.ts
 * 
 * Requires environment variables:
 *   - ZOHO_CLIENT_ID
 *   - ZOHO_CLIENT_SECRET
 *   - ZOHO_REFRESH_TOKEN
 *   - ZOHO_ORGANIZATION_ID (optional)
 *   - ZOHO_API_DOMAIN (optional, defaults to www.zohoapis.com)
 */

import { ZohoBooksAPIClient } from '../../src/lib/integrations/zoho_books/zoho_api_client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function fetchVendors() {
  try {
    console.log('🔍 Fetching vendors from Zoho Books...\n');

    // Check for required environment variables
    if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN) {
      console.error('❌ Missing required environment variables:');
      console.error('   - ZOHO_CLIENT_ID');
      console.error('   - ZOHO_CLIENT_SECRET');
      console.error('   - ZOHO_REFRESH_TOKEN');
      console.error('\nPlease set these in your .env file or environment.');
      process.exit(1);
    }

    // Initialize Zoho API client
    const zohoClient = new ZohoBooksAPIClient();

    // First, list all organizations the user has access to
    console.log('📋 Fetching organizations...\n');
    const organizations = await zohoClient.getOrganizations();
    
    if (organizations.length === 0) {
      console.error('❌ No organizations found. Please check your Zoho credentials.');
      process.exit(1);
    }

    console.log(`✓ Found ${organizations.length} organization(s):\n`);
    console.log('─'.repeat(100));
    organizations.forEach((org, index) => {
      console.log(`\n${index + 1}. ${org.organization_name || 'Unnamed Organization'}`);
      console.log(`   Organization ID: ${org.organization_id}`);
      console.log(`   Company ID: ${org.company_id || 'N/A'}`);
      console.log(`   Currency: ${org.currency_code || 'N/A'}`);
      console.log(`   Status: ${org.status || 'N/A'}`);
      if (org.organization_id === process.env.ZOHO_ORGANIZATION_ID) {
        console.log(`   ⭐ Currently configured in ZOHO_ORGANIZATION_ID`);
      }
    });
    console.log('\n' + '─'.repeat(100));

    // Get organization ID (will use env var if set, otherwise first org)
    const orgId = await zohoClient.getOrganizationId();
    const selectedOrg = organizations.find(org => org.organization_id === orgId);
    console.log(`\n✓ Using organization: ${selectedOrg?.organization_name || orgId}`);
    console.log(`  Organization ID: ${orgId}\n`);

    // Fetch vendors
    const vendors = await zohoClient.getVendors();

    if (vendors.length === 0) {
      console.log('⚠️  No vendors found in Zoho Books.');
      return;
    }

    console.log(`✓ Found ${vendors.length} vendor(s):\n`);
    console.log('─'.repeat(100));

    // Display vendors in a table format
    vendors.forEach((vendor, index) => {
      console.log(`\n${index + 1}. ${vendor.vendor_name || vendor.contact_name || 'Unnamed Vendor'}`);
      console.log(`   Contact ID: ${vendor.contact_id}`);
      console.log(`   Company: ${vendor.company_name || 'N/A'}`);
      console.log(`   Email: ${vendor.email || 'N/A'}`);
      console.log(`   Phone: ${vendor.phone || vendor.mobile || 'N/A'}`);
      console.log(`   Status: ${vendor.status || 'N/A'}`);
      console.log(`   Contact Type: ${vendor.contact_type || 'N/A'}`);
      
      // Highlight the vendor we're looking for
      if (vendor.contact_id === '2280971000000329057') {
        console.log(`   ⭐ THIS IS THE VENDOR WE'RE LOOKING FOR!`);
      }
    });

    console.log('\n' + '─'.repeat(100));
    console.log(`\n✅ Total vendors: ${vendors.length}`);

    // Check if the specific vendor exists
    const targetVendor = vendors.find(v => v.contact_id === '2280971000000329057');
    if (targetVendor) {
      console.log(`\n✅ Vendor with ID 2280971000000329057 found:`);
      console.log(`   Name: ${targetVendor.vendor_name || targetVendor.contact_name}`);
      console.log(`   Status: ${targetVendor.status}`);
    } else {
      console.log(`\n⚠️  Vendor with ID 2280971000000329057 NOT FOUND in the list above.`);
      console.log(`   This might be why the purchase order creation is failing.`);
    }

    // Export as JSON for easy inspection
    console.log('\n📋 Full vendor list (JSON):');
    console.log(JSON.stringify(vendors, null, 2));

  } catch (error) {
    console.error('\n❌ Error fetching vendors:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
fetchVendors();

