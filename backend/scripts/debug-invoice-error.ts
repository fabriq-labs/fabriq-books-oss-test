#!/usr/bin/env ts-node

/**
 * Debug Invoice Creation Error
 * This script will help us understand the exact error
 */

import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.test' });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_USER_EMAIL = 'bruce.wayne@wayneenterprises.com';
const TEST_USER_PASSWORD = 'password';

async function debugInvoiceCreation() {
  console.log('🔍 Debugging Invoice Creation Error');
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
    
    // Step 2: Check if invoice model exists in the registry
    console.log('2. Checking model registry...');
    const modelsResponse = await fetch(`${API_BASE_URL}/api/models`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (modelsResponse.ok) {
      const models = await modelsResponse.json();
      console.log(`   ✅ Models retrieved successfully`);
      console.log(`   Available models:`, models.data?.map((m: any) => m.name).join(', ') || 'No models found');
      
      const invoiceModel = models.data?.find((m: any) => m.name.toLowerCase() === 'invoice');
      if (invoiceModel) {
        console.log(`   ✅ Invoice model found:`, invoiceModel.name);
      } else {
        console.log(`   ❌ Invoice model not found in registry`);
      }
    } else {
      console.log(`   ❌ Failed to get models: ${modelsResponse.status}`);
    }
    
    // Step 3: Try to create invoice with minimal data
    console.log('3. Testing invoice creation with minimal data...');
    const invoiceData = {
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
    
    console.log(`   Response status: ${createResponse.status}`);
    const responseText = await createResponse.text();
    console.log(`   Response body: ${responseText}`);
    
    // Step 4: Try without view parameter
    console.log('4. Testing invoice creation without view parameter...');
    const createResponse2 = await fetch(`${API_BASE_URL}/api/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(invoiceData)
    });
    
    console.log(`   Response status: ${createResponse2.status}`);
    const responseText2 = await createResponse2.text();
    console.log(`   Response body: ${responseText2}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
debugInvoiceCreation();
