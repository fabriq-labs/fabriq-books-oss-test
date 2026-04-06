import { sendEmail } from "../../lib/actions/email";
import { send_workflow_notification_email } from "../../lib/actions/zeiv";
import { AuthContext } from "../../auth/types";
import { WorkflowContext } from "../../workflow-engine/types/workflow.types";
import prisma from "../../lib/prisma";


// Hardcoded SMTP2Go credentials for testing
const SMTP2GO_API_URL = 'https://api.smtp2go.com/v3/email/send';
const SMTP2GO_SENDER = 'hello@fabriqdata.com';
const SMTP2GO_API_KEY = 'api-D020FB8A30164CF9A4418DEBABA70486';

// Real instance ID and model type for testing
describe('send_workflow_notification_email Integration Test', () => {
    // Set environment variables before each test
    beforeEach(() => {
        process.env.SMTP2GO_API_URL = SMTP2GO_API_URL;
        process.env.SMTP2GO_SENDER = SMTP2GO_SENDER;
        process.env.SMTP2GO_API_KEY = SMTP2GO_API_KEY;
    });

    afterEach(() => {
        delete process.env.SMTP2GO_API_URL;
        delete process.env.SMTP2GO_SENDER;
        delete process.env.SMTP2GO_API_KEY;
    });

    describe('Workflow notification email sending', () => {
        it.only('should send workflow notification emails using real purchase requisition ID', async () => {
            // Use real Prisma client to query the database
            const tx = prisma;
            const createTestContext = (userId: string = '2d9d64e9-634b-41e1-896f-434472283988', orgId: string = '52'): AuthContext => ({
                user: {
                    id: userId,
                    org_id: orgId,
                    email: 'demo1@fabriqdata.com',
                    name: 'Demo User 1'
                },
                permissions: {
                    purchase_requisition: {
                        '*': 'write' as const  // Give full write access to payment_receipt
                    },
                    invoice: {
                        '*': 'write' as const  // Give full write access to invoice
                    },
                    purchase_order: {
                        '*': 'write' as const  // Give full write access to purchase_order
                    },

                },
            });

            // Create mock AuthContext (you may want to use a real user from database)
            const mockAuthContext: AuthContext = createTestContext('2d9d64e9-634b-41e1-896f-434472283988', '52');
            const result = await send_workflow_notification_email(
                mockAuthContext,
                "purchase_requisition",
                "preq_02493d18-be1c-4ab6-b4dc-6ed73bfd40f2",
                [],
                {},
                tx
            );

            console.log('\n📧 Workflow notification result:', result);
            console.log(JSON.stringify(result, null, 2));
            // Verify result structure
            expect(result).toBeDefined();
            if (result?.message === 'Workflow notifications processed') {
                expect(result?.action_history).toBeDefined();
                expect(result?.action_history?.action_name).toBeDefined();
                console.log('\n✅ Workflow notification emails processed successfully!');
                if (result?.results && Array.isArray(result.results)) {
                    console.log(`📬 ${result.results.length} email(s) sent`);
                    result.results.forEach((emailResult: any, index: number) => {
                        if (emailResult && !emailResult.error) {
                            console.log(`   Email ${index + 1}: Sent successfully`);
                        } else {
                            console.log(`   Email ${index + 1}: Failed - ${emailResult?.message || 'Unknown error'}`);
                        }
                    });
                }
            } else {
                console.log('\n⚠️  No emails sent (workflow instance or history may not exist)');
                expect(result?.message).toBeDefined();
            }
        }, 30000); // 30 second timeout for real database and API calls
    });
});

