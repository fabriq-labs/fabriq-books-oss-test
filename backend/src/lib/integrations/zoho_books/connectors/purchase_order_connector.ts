/**
 * Zoho Books Connector
 * 
 * Unified connector implementation for all Zoho Books operations.
 */

import { ERPConnector } from '../../connectors/types';
import { ZohoBooksAPIClient, ZohoOAuthConfig } from '../zoho_api_client';
import { mapPurchaseOrderToZoho } from '../mappers/purchase_order_mapper';
import logger from '../../../../utils/logger';

export class ZohoBooksConnector implements ERPConnector {
  private client: ZohoBooksAPIClient;

  constructor(oauthConfig: ZohoOAuthConfig) {
    this.client = new ZohoBooksAPIClient(oauthConfig);
  }

  /**
   * Get the system type identifier
   */
  getSystemType(): string {
    return 'zoho_books';
  }

  /**
   * Create a purchase order in Zoho Books
   */
  async createPurchaseOrder(fabriqPO: any, tx: any): Promise<{ 
    externalId: string; 
    externalNumber: string;
    systemId: string; 
  }> {
    try {
      // Get Zoho source system ID from database (now in public schema)
      const zohoSourceSystem = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id, default_purchase_account_id
        FROM public.source_system 
        WHERE system_type = 'zoho_books' 
          AND is_active = true 
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      if (!zohoSourceSystem || zohoSourceSystem.length === 0) {
        throw new Error(
          'Zoho Books source system not found. Please ensure Zoho integration is set up.'
        );
      }

      const zohoSourceSystemId = zohoSourceSystem[0].id;
      const defaultPurchaseAccountId = zohoSourceSystem[0].default_purchase_account_id;

      // Validate required fields specific to Zoho
      this.validatePurchaseOrder(fabriqPO);

      // Map Fabriq PO to Zoho format
      const zohoPO = mapPurchaseOrderToZoho(fabriqPO, defaultPurchaseAccountId);

      logger.info('Mapped purchase order to Zoho format', {
        poId: fabriqPO.id,
        vendorId: zohoPO.vendor_id,
        lineItemsCount: zohoPO.line_items.length,
        date: zohoPO.date,
      });

      // Create PO in Zoho
      const zohoResponse = await this.client.createPurchaseOrder(zohoPO);

      if (!zohoResponse.purchaseorder) {
        throw new Error('Zoho API returned success but no purchase order data');
      }

      return {
        externalId: zohoResponse.purchaseorder.purchaseorder_id,
        externalNumber: zohoResponse.purchaseorder.purchaseorder_number,
        systemId: zohoSourceSystemId,
      };
    } catch (error) {
      // Pass through error with context
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create PO in Zoho Books connector', {
        error: errorMessage,
        poId: fabriqPO.id,
      });
      throw error;
    }
  }

  /**
   * Get a purchase order from Zoho Books
   */
  async getPurchaseOrder(externalId: string): Promise<any> {
    try {
      return await this.client.getPurchaseOrder(externalId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get PO from Zoho Books connector', {
        error: errorMessage,
        externalId,
      });
      throw error;
    }
  }

  /**
   * Get expense accounts from Zoho Books
   */
  async getExpenseAccounts(): Promise<Array<{ account_id: string; account_name: string }>> {
    try {
      return await this.client.getExpenseAccounts();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get expense accounts from Zoho Books connector', {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Validate Fabriq PO for Zoho requirements
   */
  private validatePurchaseOrder(po: any): void {
    if (!po.supplier_details) {
      throw new Error('Purchase order must have a supplier to sync to Zoho');
    }

    if (!po.supplier_details.source_record_id) {
      throw new Error(
        'Supplier does not have a Zoho vendor_id (source_record_id). ' +
        'Please ensure the supplier is synced from Zoho first.'
      );
    }

    if (!po.purchase_order_item || po.purchase_order_item.length === 0) {
      throw new Error('Purchase order must have at least one line item to sync to Zoho');
    }
  }
}

// Keep ZohoPurchaseOrderConnector as an alias for backward compatibility during migration
export const ZohoPurchaseOrderConnector = ZohoBooksConnector;

