#!/usr/bin/env ts-node

/**
 * Simple Invoice Creation Test
 * Tests invoice creation with minimal data
 */

import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.test' });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_USER_EMAIL = 'bruce.wayne@wayneenterprises.com';
const TEST_USER_PASSWORD = 'password';

async function testInvoiceCreation() {
  console.log('🧪 Testing Invoice Creation API');
  console.log('='.repeat(50));
  
  try {
    // Step 1: Authenticate
    console.log('1. Authenticating...');
    const authResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      })
    });
    
    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.statusText}`);
    }
    
    const authResult = await authResponse.json();
    const token = authResult.token;
    console.log(`   ✅ Authentication successful`);
    
    // Step 2: Test invoice creation with minimal data
    console.log('2. Testing invoice creation...');
    const invoiceData = {
      invoice_number: `INV-API-TEST-${Date.now()}`,
      invoice_type: 'SALES',
      status: 'Draft',
      org_id: 'org_wayne_enterprises'
    };
    
    const createResponse = await fetch(`${API_BASE_URL}/api/invoice/view/default`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(invoiceData)
    });
    
    if (createResponse.ok) {
      const result = await createResponse.json();
      console.log(`   ✅ Invoice created successfully`);
      console.log(`   Invoice ID: ${result.data?.id || result.id}`);
      console.log(`   Invoice Number: ${result.data?.invoice_number || result.invoice_number}`);
      console.log(`   Status: ${result.data?.status || result.status}`);
      
      // Step 3: Test invoice retrieval
      console.log('3. Testing invoice retrieval...');
      const invoiceId = result.data?.id || result.id;
      
      const getResponse = await fetch(`${API_BASE_URL}/api/invoice/${invoiceId}/view/default`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (getResponse.ok) {
        const invoiceResult = await getResponse.json();
        console.log(`   ✅ Invoice retrieved successfully`);
        console.log(`   Invoice Details:`, JSON.stringify(invoiceResult.data || invoiceResult, null, 2));
      } else {
        const errorText = await getResponse.text();
        console.log(`   ❌ Invoice retrieval failed: ${getResponse.status}`);
        console.log(`   Error: ${errorText}`);
      }
      
    } else {
      const errorText = await createResponse.text();
      console.log(`   ❌ Invoice creation failed: ${createResponse.status}`);
      console.log(`   Error: ${errorText}`);
      
      // Try to get more details
      console.log('   Request details:');
      console.log(`   URL: ${API_BASE_URL}/api/invoice/view/default`);
      console.log(`   Method: POST`);
      console.log(`   Headers: Authorization: Bearer ${token.substring(0, 20)}...`);
      console.log(`   Body: ${JSON.stringify(invoiceData, null, 2)}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testInvoiceCreation();
