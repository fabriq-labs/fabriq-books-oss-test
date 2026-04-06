#!/usr/bin/env node

/**
 * Simple test script to demonstrate the bank statement extractor
 * Run with: npx ts-node test-bank-statement-extractor.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { extract_document } from '../extractors';

// Load environment variables from .env file
const envPath = path.join(__dirname, '../../../.env');
console.log('Loading environment from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.log('Environment file loaded successfully');
}

// Mock context for testing
const mockContext = {
  user: {
    id: 'test-user',
    org_id: 'test-org'
  }
};

async function main() {
  console.log('=== Bank Statement Extractor Test ===\n');
  
  try {
    // Check if required environment variables are loaded
    const requiredEnvVars = ['GOOGLE_CLOUD_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', missingVars.join(', '));
      console.error('Please ensure your .env file contains all required variables.');
      process.exit(1);
    }
    
    console.log('Environment variables loaded successfully');
    console.log('Google Cloud Project ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
    console.log('Credentials available:', process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 ? 'Yes' : 'No');
    
    // Extract from the actual PDF file
    console.log('\nExtracting from OpTransactionHistory08-10-2025.pdf...');
    await testRealPDFExtraction(mockContext);

    
    console.log('\n=== Test completed successfully! ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
};

// Function to test extraction from the real PDF file
async function testRealPDFExtraction(context: any) {
  try {
    const pdfPath = path.join(__dirname, 'OpTransactionHistory15-09-2025.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.error('PDF file not found at:', pdfPath);
      return;
    }
    
    console.log('Loading PDF file:', pdfPath);
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log('PDF file size:', pdfBuffer.length, 'bytes');
    
    console.log('Starting extraction...');
    const startTime = Date.now();
    
    console.log('\n--- Running Full Document Extraction ---');
    const result = await extract_document(context, 'posting', pdfBuffer);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log('\n=== PDF Extraction Results ===');
    console.log('Success:', result.success);
    console.log('Confidence:', result.confidence + '%');
    console.log('Processing Time:', processingTime + 'ms');
    
    if (result.success) {
      console.log('\nExtracted Data:');
      console.log(JSON.stringify(result.data, null, 2));
      
      if (result.metadata) {
        console.log('\nMetadata:');
        console.log('- Document Type:', result.metadata.documentType);
        console.log('- Extraction Timestamp:', result.metadata.extractionTimestamp);
        console.log('- Processing Time:', result.metadata.processingTime + 'ms');
        console.log('- Page Count:', result.metadata.pageCount);
      }
    } else {
      console.log('\nErrors:', result.errors);
    }
    
  } catch (error) {
    console.error('Error during PDF extraction:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  main();
}
