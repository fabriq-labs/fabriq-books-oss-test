import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:4000';
const TEST_USER_EMAIL = 'bruce.wayne@wayneenterprises.com';
const TEST_USER_PASSWORD = 'password';

async function testCustomerSearch() {
  console.log('🔍 Testing Customer Search API...');
  
  try {
    // Step 1: Authenticate
    console.log('🔐 Authenticating...');
    const authResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.statusText}`);
    }

    const authResult = await authResponse.json() as any;
    const authToken = authResult.token;
    console.log(`✅ Authentication successful: ${authToken?.substring(0, 20)}...`);

    // Step 2: Test different search parameters
    const searchTests = [
      {
        name: 'Contains "Stark"',
        filters: { customer_name: { contains: 'Stark' } }
      },
      {
        name: 'StartsWith "Stark"',
        filters: { customer_name: { startswith: 'Stark' } }
      },
      {
        name: 'Equals "Stark Industries"',
        filters: { customer_name: { equals: 'Stark Industries' } }
      },
      {
        name: 'No filters (get all)',
        filters: {}
      }
    ];

    for (const test of searchTests) {
      console.log(`\n🧪 Testing: ${test.name}`);
      
      const searchResponse = await fetch(`${API_BASE_URL}/api/customers/view/default/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          filters: test.filters,
          page: 1,
          pageSize: 10,
          sortOption: {}
        })
      });

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.log(`❌ Search failed: ${searchResponse.statusText} - ${errorText}`);
        continue;
      }

      const searchResult = await searchResponse.json() as any;
      console.log(`📊 Response structure:`, JSON.stringify(searchResult, null, 2));
      
      if (searchResult.data?.data && searchResult.data.data.length > 0) {
        console.log(`✅ Found ${searchResult.data.data.length} customers:`);
        searchResult.data.data.forEach((customer: any, index: number) => {
          console.log(`   ${index + 1}. ${customer.customer_name} (${customer.id})`);
        });
      } else {
        console.log(`❌ No customers found`);
      }
    }

  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

testCustomerSearch();
