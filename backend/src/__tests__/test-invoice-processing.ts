#!/usr/bin/env ts-node

import { readFileSync } from 'fs';
import { join } from 'path';
import { ModelService } from '../services/core/ModelService';
import logger from '../utils/logger';

// Mock AuthContext for testing
const mockAuthContext = {
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    org_id: 'test-org-123'
  },
  permissions: {
    'invoice': {
      'id': 'read' as const,
      'invoice_number': 'read' as const,
      'supplier_name': 'read' as const,
      'invoice_total': 'read' as const
    }
  }
};

async function testInvoiceProcessing(pdfPath: string, orgId: string, poNumber?: string) {
  try {
    logger.info('Starting invoice processing test', { pdfPath, orgId, poNumber });
    
    // Read PDF file
    const pdfBuffer = readFileSync(pdfPath);
    logger.info('PDF file read successfully', { size: pdfBuffer.length });
    
    // Use ModelService to process the invoice PDF
    const modelService = ModelService.getInstance();
    
    logger.info('Processing invoice PDF through ModelService...');
    
    const result = await modelService.parseDocument(
      'invoice', // modelName
      mockAuthContext,
      pdfBuffer,
      {
        extractorOptions: {
          includeMetadata: true,
          confidenceThreshold: 0.7
        }
      }
    );
    
    if (!result.success) {
      throw new Error(`Document processing failed: ${result.error}`);
    }
    
    logger.info('Invoice processing completed successfully');
    
    // Print the resulting invoice graph
    console.log('\n=== INVOICE PROCESSING RESULT ===');
    console.log('Success:', result.success);
    console.log('Confidence:', result.metaData?.confidence || 'N/A');
    console.log('Processing Time:', result.metaData?.processingTime || 'N/A');
    console.log('Extractor Type:', result.metaData?.extractorType || 'N/A');
    
    console.log('\n=== EXTRACTED INVOICE DATA ===');
    console.log(JSON.stringify(result.data, null, 2));
    
    return result;
    
  } catch (error) {
    logger.error('Error in invoice processing test', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      pdfPath,
      orgId,
      poNumber
    });
    
    console.error('\n=== ERROR ===');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: ts-node test-invoice-processing.ts <pdf-path> <org-id> [po-number]');
    console.log('Example: ts-node test-invoice-processing.ts ./sample-invoice.pdf test-org-123 PO-2024-001');
    process.exit(1);
  }
  
  const pdfPath = args[0];
  const orgId = args[1];
  const poNumber = args[2];
  
  console.log('Starting Invoice Processing Unit Test...');
  console.log(`PDF Path: ${pdfPath}`);
  console.log(`Org ID: ${orgId}`);
  console.log(`PO Number: ${poNumber || 'Not provided'}`);
  console.log('');
  
  try {
    const result = await testInvoiceProcessing(pdfPath, orgId, poNumber);
    console.log('\n✅ Unit test completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('\n❌ Unit test failed!');
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testInvoiceProcessing };
