#!/usr/bin/env ts-node

/**
 * Simple API Test Script
 * Tests basic API connectivity and authentication
 */

import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.test' });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_USER_EMAIL = 'bruce.wayne@wayneenterprises.com';
const TEST_USER_PASSWORD = 'password';

async function testBasicAPI() {
  console.log('🧪 Testing Basic API Connectivity');
  console.log('='.repeat(50));
  
  try {
    // Test 1: Check if server is running
    console.log('1. Testing server connectivity...');
    const healthResponse = await fetch(`${API_BASE_URL}/api/health`);
    console.log(`   Server status: ${healthResponse.status}`);
    
    // Test 2: Test authentication
    console.log('2. Testing authentication...');
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
    
    if (authResponse.ok) {
      const authResult = await authResponse.json();
      console.log(`   ✅ Authentication successful`);
      console.log(`   User: ${authResult.user?.name || TEST_USER_EMAIL}`);
      console.log(`   Token: ${authResult.token?.substring(0, 20)}...`);
      
      // Test 3: Test a simple API call
      console.log('3. Testing simple API call...');
      const testResponse = await fetch(`${API_BASE_URL}/api/metadata/user/me`, {
        headers: {
          'Authorization': `Bearer ${authResult.token}`
        }
      });
      
      if (testResponse.ok) {
        const userData = await testResponse.json();
        console.log(`   ✅ User data retrieved successfully`);
        console.log(`   User ID: ${userData.id}`);
        console.log(`   Organization: ${userData.org_id}`);
      } else {
        console.log(`   ❌ User data retrieval failed: ${testResponse.status}`);
      }
      
    } else {
      console.log(`   ❌ Authentication failed: ${authResponse.status}`);
      const errorText = await authResponse.text();
      console.log(`   Error: ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testBasicAPI();
