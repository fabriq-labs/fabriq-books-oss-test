// test-closing-balance.ts
import { createClosingBalancePostingForAccount, createClosingBalancePostings } from '../lib/actions/perfin';
import { getTrialBalance } from '../lib/reports/perfin';

async function testClosingBalance() {
  try {
    // Replace these with your actual values
    const financialYear = 2024; // FY 2020-21
    const orgId = '1';
    const accountId = 'acco_5d412f37-abda-4c52-968a-48caa0229cbd'; // From step 1
    const createdBy = '6a6a1f15-3ead-45f8-9da3-53e7157a9bd0';
    
    console.log('Creating closing balance posting for FY 2020-21...');
    console.log('Account ID:', accountId);
    
    const result = await createClosingBalancePostingForAccount(
      financialYear,
      orgId,
      accountId,
      createdBy
    );
    
    if (result) {
      console.log('✅ Success! Created posting:', result);
    } else {
      console.log('ℹ️ No posting created (account has zero balance)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function testClosingBalanceForAllAccounts() {
  try {
    // Replace these with your actual values
    const financialYears = [2020, 2021,2022, 2023, 2024]; // Example financial years to process
    const orgId = '1';
    const createdBy = '6a6a1f15-3ead-45f8-9da3-53e7157a9bd0';
    
    let allCreatedPostings: any[] = []; // To accumulate results from all years
    
    for (const year of financialYears) {
      console.log(`\n--- Processing FY ${year}-${(year + 1).toString().slice(-2)} ---`);
      console.log(`Creating closing balance postings for ALL accounts for FY ${year}-${(year + 1).toString().slice(-2)}...`);
      console.log('Organization ID:', orgId);
      console.log('Created By:', createdBy);
      
      const yearResults = await createClosingBalancePostings(
        year,
        orgId,
        createdBy
      );
      
      if (yearResults && yearResults.length > 0) {
        console.log(`Successfully created ${yearResults.length} postings for FY ${year}-${(year + 1).toString().slice(-2)}.`);
        allCreatedPostings.push(...yearResults);
      } else {
        console.log(`No closing balance postings created for FY ${year}-${(year + 1).toString().slice(-2)} (no accounts with non-zero balances).`);
      }
    }
    
    const results = allCreatedPostings; // Assign to 'results' to match the subsequent code
    
    if (results && results.length > 0) {
      console.log(`✅ Success! Created ${results.length} closing balance postings:`);
      
      // Show first few created postings
      // results.slice(0, 5).forEach((posting, index) => {
      //   console.log(`${index + 1}. Account: ${posting.account_name || posting.credit_account_id}`);
      //   console.log(`   Amount: ${posting.amount}`);
      //   console.log(`   Type: ${posting.posting_type}`);
      //   console.log(`   Notes: ${posting.notes}`);
      //   console.log('---');
      // });
      
      // if (results.length > 5) {
      //   console.log(`... and ${results.length - 5} more postings`);
      // }
    } else {
      console.log('ℹ️ No closing balance postings created (no accounts with non-zero balances)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function testTrialBalanceWithOpeningBalance() {
  try {
    const orgId = '1';
    const startDate = '2020-04-01';
    const endDate = '2021-03-31';
    
    console.log('Testing trial balance with opening balance...');
    console.log('Date range:', startDate, 'to', endDate);
    
    const trialBalance = await getTrialBalance(startDate, endDate, orgId);
    
    console.log(`✅ Success! Found ${trialBalance.length} accounts in trial balance`);
    
    // Show first few accounts with their balances
    trialBalance.slice(0, 5).forEach(account => {
      console.log(`Account: ${account.account_name}`);
      console.log(`  Current Period Balance: ${account.balance}`);
      console.log(`  Opening Balance: ${account.opening_balance}`);
      console.log(`  Total Balance: ${account.total_balance}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Run all tests
async function runTests() {
  // console.log('=== Test 1: Create Closing Balance Posting (Single Account) ===');
  // await testClosingBalance();
  
  console.log('\n=== Test 2: Create Closing Balance Postings (All Accounts) ===');
  await testClosingBalanceForAllAccounts();
  
  // console.log('\n=== Test 3: Trial Balance with Opening Balance ===');
  // await testTrialBalanceWithOpeningBalance();
}

runTests();