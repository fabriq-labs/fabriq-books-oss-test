/**
 * QuickBooks Online Connector
 * 
 * Unified connector implementation for all QuickBooks Online operations.
 */

import { ERPConnector } from '../../connectors/types';
import { QuickBooksAPIClient, QuickBooksOAuthConfig } from '../quickbooks_api_client';
import { mapPurchaseOrderToQuickBooks } from '../mappers/purchase_order_mapper';
import logger from '../../../../utils/logger';

export class QuickBooksConnector implements ERPConnector {
  private client: QuickBooksAPIClient;

  constructor(oauthConfig: QuickBooksOAuthConfig) {
    this.client = new QuickBooksAPIClient(oauthConfig);
  }

  /**
   * Get the system type identifier
   */
  getSystemType(): string {
    return 'quickbooks';
  }

  /**
   * Create a purchase order in QuickBooks Online
   */
  async createPurchaseOrder(fabriqPO: any, tx: any): Promise<{ 
    externalId: string; 
    externalNumber: string;
    systemId: string; 
  }> {
    try {
      // Get QuickBooks source system ID from database
      const qbSourceSystem = await tx.$queryRaw<Array<{ id: string; default_purchase_account_id?: string }>>`
        SELECT id, default_purchase_account_id
        FROM public.source_system 
        WHERE system_type = 'quickbooks' 
          AND is_active = true 
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      if (!qbSourceSystem || qbSourceSystem.length === 0) {
        throw new Error(
          'QuickBooks source system not found. Please ensure QuickBooks integration is set up.'
        );
      }

      const qbSourceSystemId = qbSourceSystem[0].id;
      const defaultExpenseAccountId = qbSourceSystem[0].default_purchase_account_id || '';

      // Validate required fields specific to QuickBooks
      this.validatePurchaseOrder(fabriqPO);

      // Map Fabriq PO to QuickBooks format
      const qbPO = mapPurchaseOrderToQuickBooks(fabriqPO, defaultExpenseAccountId);

      logger.info('Mapped purchase order to QuickBooks format', {
        poId: fabriqPO.id,
        vendorId: qbPO.VendorRef?.value,
        lineItemsCount: qbPO.Line?.length || 0,
        date: qbPO.TxnDate,
      });

      // Create PO in QuickBooks
      const qbResponse = await this.client.createPurchaseOrder(qbPO);

      if (!qbResponse.PurchaseOrder) {
        throw new Error('QuickBooks API returned success but no purchase order data');
      }

      return {
        externalId: qbResponse.PurchaseOrder.Id,
        externalNumber: qbResponse.PurchaseOrder.DocNumber || '',
        systemId: qbSourceSystemId,
      };
    } catch (error) {
      // Pass through error with context
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create PO in QuickBooks connector', {
        error: errorMessage,
        poId: fabriqPO.id,
      });
      throw error;
    }
  }

  /**
   * Get a purchase order from QuickBooks Online
   */
  async getPurchaseOrder(externalId: string): Promise<any> {
    try {
      return await this.client.getPurchaseOrder(externalId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get PO from QuickBooks connector', {
        error: errorMessage,
        externalId,
      });
      throw error;
    }
  }

  /**
   * Get expense accounts from QuickBooks Online
   */
  async getExpenseAccounts(): Promise<Array<{ account_id: string; account_name: string }>> {
    try {
      return await this.client.getExpenseAccounts();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get expense accounts from QuickBooks connector', {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Validate Fabriq PO for QuickBooks requirements
   */
  private validatePurchaseOrder(po: any): void {
    if (!po.supplier_details) {
      throw new Error('Purchase order must have a supplier to sync to QuickBooks');
    }

    if (!po.supplier_details.source_record_id) {
      throw new Error(
        'Supplier does not have a QuickBooks vendor ID (source_record_id). ' +
        'Please ensure the supplier is synced from QuickBooks first.'
      );
    }

    if (!po.purchase_order_item || po.purchase_order_item.length === 0) {
      throw new Error('Purchase order must have at least one line item to sync to QuickBooks');
    }
  }
}
