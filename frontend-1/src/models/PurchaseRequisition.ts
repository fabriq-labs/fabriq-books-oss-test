
// This file defines the structure of the Purchase Requisition models
// It's used for TypeScript type safety and can be used as a reference for Supabase

export interface PurchaseRequisition {
  id: string;
  pr_number: string;
  pr_date: Date;
  requester: string;
  requester_department: string;
  on_behalf_of: boolean;
  on_behalf_of_user?: string;
  on_behalf_of_department?: string;
  purchase_reason: string;
  delivery_location: string;
  deliver_to: string;
  legal_entity: string;
  is_budgeted: boolean;
  budget_level?: 'Header' | 'Line';
  cost_center?: string;
  budget_period?: string;
  budget_line?: string;
  is_for_project: boolean;
  project_name?: string;
  purchase_total: number;
  pr_status: 'Draft' | 'Department Approval' | 'Finance Approval' | 'Procurement Approval' | 'Approved' | 'Pending Completion' | 'Completed' | 'Rejected';
  created_at: Date;
  updated_at: Date;
  attachments?: string[]; // Array of file URLs
}

export interface PurchaseLineItem {
  id: string;
  pr_id: string; // Foreign key to PurchaseRequisition
  item_code: string;
  item_image?: string;
  item_description: string;
  quantity: number;
  rate: number;
  item_total: number;
  cost_center?: string; // Only used when budget_level is Line
  created_at: Date;
  updated_at: Date;
}

/* 
Supabase SQL for creating these tables:

-- Purchase Requisition Table
CREATE TABLE purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_number TEXT NOT NULL UNIQUE,
  pr_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  requester TEXT NOT NULL,
  requester_department TEXT NOT NULL,
  on_behalf_of BOOLEAN NOT NULL DEFAULT FALSE,
  on_behalf_of_user TEXT,
  on_behalf_of_department TEXT,
  purchase_reason TEXT NOT NULL,
  delivery_location TEXT NOT NULL,
  deliver_to TEXT NOT NULL,
  legal_entity TEXT NOT NULL,
  is_budgeted BOOLEAN NOT NULL DEFAULT FALSE,
  budget_level TEXT CHECK (budget_level IN ('Header', 'Line')),
  cost_center TEXT,
  budget_period TEXT,
  budget_line TEXT,
  is_for_project BOOLEAN NOT NULL DEFAULT FALSE,
  project_name TEXT,
  purchase_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  pr_status TEXT NOT NULL DEFAULT 'Draft' CHECK (pr_status IN ('Draft', 'Department Approval', 'Finance Approval', 'Procurement Approval', 'Approved', 'Pending Completion', 'Completed', 'Rejected')),
  attachments TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Purchase Line Items Table
CREATE TABLE purchase_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_image TEXT,
  item_description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  rate NUMERIC(15, 2) NOT NULL CHECK (rate >= 0),
  item_total NUMERIC(15, 2) NOT NULL CHECK (item_total >= 0),
  cost_center TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_purchase_line_items_pr_id ON purchase_line_items(pr_id);
CREATE INDEX idx_purchase_requisitions_status ON purchase_requisitions(pr_status);
CREATE INDEX idx_purchase_requisitions_requester ON purchase_requisitions(requester);
*/
