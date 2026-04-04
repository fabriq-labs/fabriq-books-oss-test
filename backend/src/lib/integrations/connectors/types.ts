export interface ERPConnector {
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
   * Get a purchase order from the external ERP system
   * @param externalId The external system's purchase order ID
   * @returns Promise with the purchase order data
   */
  getPurchaseOrder(externalId: string): Promise<any>;

  /**
   * Get expense accounts from the external ERP system
   * @returns Promise with array of expense accounts containing account_id and account_name
   */
  getExpenseAccounts(): Promise<Array<{ account_id: string; account_name: string }>>;

  /**
   * Get the system type identifier (e.g., 'zoho_books', 'xero')
   */
  getSystemType(): string;
}

// Keep PurchaseOrderConnector as an alias for backward compatibility during migration
export type PurchaseOrderConnector = ERPConnector;

