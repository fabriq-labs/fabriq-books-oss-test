export interface PurchaseOrderConnector {
  /**
   * Create a purchase order in the external ERP system
   * @param fabriqPO The Fabriq Purchase Order object (with related data)
   * @param tx The Prisma transaction client (for database queries if needed)
   * @returns Promise with external system ID and reference number
   */
  createPurchaseOrder(fabriqPO: any, tx: any): Promise<{ 
    externalId: string; 
    externalNumber: string;
    systemId: string; 
  }>;

  /**
   * Get the system type identifier (e.g., 'zoho_books', 'xero')
   */
  getSystemType(): string;
}

