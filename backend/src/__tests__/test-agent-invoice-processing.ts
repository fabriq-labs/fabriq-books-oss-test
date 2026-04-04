import { readFileSync } from 'fs';
import { join } from 'path';
import { AgentService } from '../agent/AgentService';
import logger from '../utils/logger';
import { AuthContext } from '../auth/types';

const mockAuthContext: AuthContext = {
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    org_id: 'test-org-123'
  },
  permissions: {
    'invoice': {
      '*': 'read' as const
    }
  }
};

async function testAgentInvoiceProcessing(pdfPath: string, orgId: string, poNumber?: string) {
  try {
    console.log('🚀 Starting AgentService Invoice Processing Test');
    console.log('================================================');
    console.log(`📄 PDF Path: ${pdfPath}`);
    console.log(`🏢 Organization ID: ${orgId}`);
    console.log(`📋 PO Number: ${poNumber || 'Not provided'}`);
    console.log('');

    // Read PDF file
    const pdfBuffer = readFileSync(pdfPath);
    console.log(`📊 PDF Size: ${pdfBuffer.length} bytes`);

    // Convert to base64
    const base64Buffer = pdfBuffer.toString('base64');
    
    // Debug: Check base64 conversion
    const decodedBuffer = Buffer.from(base64Buffer, 'base64');
    logger.info('Base64 conversion debug', {
      originalSize: pdfBuffer.length,
      base64Length: base64Buffer.length,
      decodedSize: decodedBuffer.length,
      buffersEqual: pdfBuffer.equals(decodedBuffer)
    });

    console.log('🤖 Calling AgentService.handleRequest...');
    console.log('');

    // Create AgentService instance
    const agentService = new AgentService();

    // Prepare user message with explicit parameters
    const userMessage = `I have a PDF invoice that needs to be processed. Please call the processInvoiceFromPdf tool with these exact parameters:

pdfBuffer: "${base64Buffer}"
orgId: "${orgId}"
poNumber: "${poNumber || ''}"

Extract the invoice data and prepare form data for review.`;

    // Call AgentService
    const response = await agentService.handleRequest(
      userMessage,
      mockAuthContext,
      [],
      {
        modelName: 'invoice',
        pdfBuffer: base64Buffer,
        orgId,
        poNumber
      }
    );

    console.log('✅ AgentService Response Received');
    console.log('==================================');
    console.log(`🎯 Finish Reason: ${response.finishReason || 'N/A'}`);
    console.log(`📊 Usage: ${response.usage?.totalTokens || 'N/A'} tokens`);
    console.log('');

    // Display steps
    if (response.steps && response.steps.length > 0) {
      console.log('📋 Agent Steps:');
      console.log('---------------');
      response.steps.forEach((step: any, index: number) => {
        console.log(`${index + 1}. ${step.stepType || 'unknown'}: ${step.text || 'N/A'}`);
      });
      console.log('');
    }

    // Display tool results
    if (response.toolResults && response.toolResults.length > 0) {
      console.log('🔧 Tool Results:');
      console.log('-----------------');
      response.toolResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. Tool: ${result.toolName || 'Unknown'}`);
        console.log(`   Result Type: ${result.result?.resultType || 'N/A'}`);
        console.log(`   Message: ${result.result?.message || 'N/A'}`);
        
        if (result.result?.data) {
          const data = result.result.data;
          
          // Display invoice data
          if (data.invoice) {
            console.log(`   📄 Invoice Data:`);
            console.log(`      Invoice Number: ${data.invoice.invoice_number || 'N/A'}`);
            console.log(`      Invoice Date: ${data.invoice.invoice_date || 'N/A'}`);
            console.log(`      Supplier: ${data.invoice.supplier_name || 'N/A'}`);
            console.log(`      PO Number: ${data.invoice.po_number || poNumber || 'N/A'}`);
            console.log(`      Invoice Total: ${data.invoice.invoice_total || 'N/A'}`);
            console.log(`      Net Total: ${data.invoice.invoice_net_total || 'N/A'}`);
            console.log(`      Tax Amount: ${data.invoice.tax_total || 'N/A'}`);
            console.log(`      Terms: ${data.invoice.terms_and_conditions || 'N/A'}`);
          }
          
          // Display line items
          if (data.lineItems && data.lineItems.length > 0) {
            console.log(`   📋 Line Items (${data.lineItems.length}):`);
            data.lineItems.forEach((item: any, itemIndex: number) => {
              console.log(`      ${itemIndex + 1}. ${item.item_name || 'Unknown Item'}`);
              console.log(`         Rate: ${item.rate || 'N/A'}`);
              console.log(`         Quantity: ${item.invoice_qty || 'N/A'}`);
              console.log(`         Line Total: ${item.line_total || 'N/A'}`);
              console.log(`         Tax: ${item.tax_type || 'N/A'} (${item.tax_rate || 0}%)`);
            });
          } else {
            console.log(`   📋 Line Items: None found`);
          }
          
          // Display AI suggestions
          if (data.lineItems && data.lineItems.length > 0) {
            console.log(`   🤖 AI Suggestions:`);
            console.log(`      Confidence: ${result.result?.confidence || 100}%`);
            console.log(`      PO Match Found: ${data.poData ? 'true' : 'false'}`);
            console.log(`      Extracted At: ${new Date().toISOString()}`);
          }
          
          // Display actions
          if (result.result?.actions && result.result.actions.length > 0) {
            console.log(`   🎯 Actions:`);
            result.result.actions.forEach((action: any, actionIndex: number) => {
              console.log(`      ${actionIndex + 1}. ${action.type}: ${action.description || 'N/A'}`);
            });
          }
        }
        console.log('');
      });
    } else {
      console.log('🔧 Tool Results: None found');
      console.log('');
    }

    console.log('🎉 AgentService Invoice Processing Test Completed Successfully!');
    console.log('');
    console.log('✅ Test completed successfully!');

    return response;

  } catch (error: any) {
    console.error('❌ Test failed:', error);
    logger.error('AgentService test failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: ts-node test-agent-invoice-processing.ts <pdf-path> <org-id> [po-number]');
    console.log('');
    console.log('Example:');
    console.log('  ts-node test-agent-invoice-processing.ts "/path/to/invoice.pdf" "1" "PO000014"');
    process.exit(1);
  }

  const [pdfPath, orgId, poNumber] = args;
  
  try {
    await testAgentInvoiceProcessing(pdfPath, orgId, poNumber);
  } catch (error: any) {
    console.error('Script execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { testAgentInvoiceProcessing };
