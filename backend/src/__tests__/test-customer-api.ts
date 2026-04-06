#!/usr/bin/env ts-node

/**
 * Simple Customer Creation Test
 * Tests if the API is working with a simpler model
 */

import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.test' });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_USER_EMAIL = 'bruce.wayne@wayneenterprises.com';
const TEST_USER_PASSWORD = 'password';

async function testCustomerCreation() {
  console.log('🧪 Testing Customer Creation API');
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
    
    // Step 2: Test customer creation
    console.log('2. Testing customer creation...');
    const customerData = {
      customer_name: 'Test Customer API',
      primary_email: 'test@apicustomer.com',
      primary_phone: '+1-555-9999',
      customer_address: '123 API Test St',
      city: 'Test City',
      state: 'Test State',
      country: 'United States',
      zip_code: '12345',
      industry: 'Technology',
      org_id: 'org_wayne_enterprises'
    };
    
    const createResponse = await fetch(`${API_BASE_URL}/api/customers/view/default`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(customerData)
    });
    
    if (createResponse.ok) {
      const result = await createResponse.json();
      console.log(`   ✅ Customer created successfully`);
      console.log(`   Customer ID: ${result.data?.id || result.id}`);
      console.log(`   Customer Name: ${result.data?.customer_name || result.customer_name}`);
    } else {
      const errorText = await createResponse.text();
      console.log(`   ❌ Customer creation failed: ${createResponse.status}`);
      console.log(`   Error: ${errorText}`);
    }
    
    // Step 3: Test customer search
    console.log('3. Testing customer search...');
    const searchResponse = await fetch(`${API_BASE_URL}/api/customers/view/default/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        filters: {
          customer_name: { contains: 'Test' }
        },
        page: 1,
        pageSize: 10,
        sortOption: {}
      })
    });
    
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      console.log(`   ✅ Customer search successful`);
      console.log(`   Found ${searchResult.data?.data?.length || searchResult.data?.length || 0} customers`);
    } else {
      const errorText = await searchResponse.text();
      console.log(`   ❌ Customer search failed: ${searchResponse.status}`);
      console.log(`   Error: ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testCustomerCreation();
