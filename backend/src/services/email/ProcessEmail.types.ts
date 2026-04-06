import { AuthContext } from '../../auth/types';

export interface ProcessEmailAttachment {
  buffer: Buffer;
  filename: string;
}

export interface ProcessEmailPayload {
  org_id: string;
  gmail_message_id: string;
  gmail_thread_id?: string;
  from_email?: string;
  to_email?: string;
  subject?: string;
  received_at?: Date;
  body_snippet?: string;
  model_name?: string;
  attachments: ProcessEmailAttachment[];
}

export interface ProcessEmailResult {
  ingest_id: string;
  skipped: boolean;
  reason?: string;
  item_count: number;
}

/** First tool result from extractInvoiceFromFile (data, created_invoice_id, etc.) */
export interface ExtractInvoiceToolResult {
  tool: string;
  resultType: string;
  data?: {
    invoice?: Record<string, unknown>;
    line_items?: unknown[];
    purchase_order?: unknown;
  };
  created_invoice_id?: string;
  invoice_auto_created?: boolean;
  rejection_reason?: string;
  error?: string;
}
