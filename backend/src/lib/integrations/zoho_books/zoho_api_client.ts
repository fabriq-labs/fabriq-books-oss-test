/**
 * Zoho Books API Client
 * 
 * Handles authentication and API calls to Zoho Books for creating purchase orders.
 * Uses OAuth 2.0 with refresh token for authentication.
 * 
 * Credentials required:
 * - ZOHO_CLIENT_ID
 * - ZOHO_CLIENT_SECRET
 * - ZOHO_REFRESH_TOKEN
 * - ZOHO_ORGANIZATION_ID (optional, can be fetched)
 * - ZOHO_API_DOMAIN (optional, defaults to US: www.zohoapis.com)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../../../utils/logger';

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface ZohoPurchaseOrder {
  purchaseorder_id?: string;
  purchaseorder_number?: string;
  date: string;
  vendor_id: string;
  vendor_name?: string;
  line_items: ZohoLineItem[];
  reference_number?: string;
  delivery_date?: string;
  expected_date?: string;
  currency_code?: string;
  exchange_rate?: number;
  discount?: number;
  shipping_charge?: number;
  adjustment?: number;
  notes?: string;
  terms?: string;
  delivery_address?: string;
  custom_fields?: Array<{ customfield_id: string; value: string }>;
}

export interface ZohoLineItem {
  item_id?: string;
  account_id?: string;
  name: string;
  description?: string;
  rate: number;
  quantity: number;
  unit?: string;
  discount?: number;
  tax_id?: string;
  tax_exemption_id?: string;
  reverse_charge?: boolean;
  item_custom_fields?: Array<{ customfield_id: string; value: string }>;
}

export interface ZohoCreatePOResponse {
  code: number;
  message: string;
  purchaseorder: {
    purchaseorder_id: string;
    purchaseorder_number: string;
    [key: string]: any;
  };
}

export interface ZohoOAuthConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  organization_id?: string;
  api_domain?: string;
  accounts_domain?: string;
}

export class ZohoBooksAPIClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private organizationId: string;
  private apiDomain: string;
  private accountsDomain: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private axiosInstance: AxiosInstance;

  constructor(oauthConfig: ZohoOAuthConfig) {
    this.clientId = oauthConfig.client_id;
    this.clientSecret = oauthConfig.client_secret;
    this.refreshToken = oauthConfig.refresh_token;
    this.organizationId = oauthConfig.organization_id || '';
    
    // Determine API domain based on data center (default: US)
    // Options: www.zohoapis.com, www.zohoapis.eu, www.zohoapis.in, etc.
    this.apiDomain = oauthConfig.api_domain || 'www.zohoapis.com';
    
    // Accounts domain for OAuth token refresh (default: accounts.zoho.com)
    this.accountsDomain = oauthConfig.accounts_domain || 'https://accounts.zoho.com';

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        'Missing Zoho OAuth credentials. Required: client_id, client_secret, refresh_token'
      );
    }

    // Create axios instance with base URL
    this.axiosInstance = axios.create({
      baseURL: `https://${this.apiDomain}/books/v3`,
      timeout: 30000, // 30 seconds
    });

    // Add request interceptor to include access token
    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.accessToken) {
        config.headers['Authorization'] = `Zoho-oauthtoken ${this.accessToken}`;
      }
      return config;
    });
  }

  /**
   * Ensure we have a valid access token, refreshing if needed
   */
  private async ensureValidToken(): Promise<void> {
    // Check if token exists and is not expired
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return; // Token is still valid
    }

    // Token is missing or expired, refresh it
    await this.refreshAccessToken();
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      logger.info('Refreshing Zoho access token...');

      const tokenUrl = `${this.accountsDomain}/oauth/v2/token`;
      const response = await axios.post<ZohoTokenResponse>(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        
        // Calculate expiration time (default 1 hour = 3600 seconds)
        const expiresIn = response.data.expires_in || 3600;
        this.tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000); // Refresh 5 min before expiry

        // Update refresh token if provided (some OAuth flows return new refresh token)
        if (response.data.refresh_token) {
          this.refreshToken = response.data.refresh_token;
          logger.info('Zoho refresh token updated');
        }

        logger.info('✅ Successfully refreshed Zoho access token', {
          expiresAt: this.tokenExpiresAt.toISOString(),
        });
      } else {
        throw new Error('No access token in refresh response');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to refresh Zoho access token', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });
      throw new Error(`Failed to refresh Zoho access token: ${axiosError.message}`);
    }
  }

  /**
   * Get all organizations the user has access to
   */
  async getOrganizations(): Promise<any[]> {
    try {
      await this.ensureValidToken();
      const response = await this.axiosInstance.get('/organizations');
      
      if (response.data.organizations && response.data.organizations.length > 0) {
        return response.data.organizations;
      }

      return [];
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to fetch Zoho organizations', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw new Error(`Failed to fetch Zoho organizations: ${axiosError.message}`);
    }
  }

  /**
   * Get organization ID if not set
   */
  async getOrganizationId(): Promise<string> {
    if (this.organizationId) {
      return this.organizationId;
    }

    try {
      const organizations = await this.getOrganizations();
      
      if (organizations.length > 0) {
        this.organizationId = organizations[0].organization_id;
        logger.info('Fetched Zoho organization ID', { organizationId: this.organizationId });
        return this.organizationId;
      }

      throw new Error('No organizations found in Zoho account');
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to fetch Zoho organization ID', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw new Error(`Failed to fetch Zoho organization ID: ${axiosError.message}`);
    }
  }

  /**
   * Create a purchase order in Zoho Books
   */
  async createPurchaseOrder(po: ZohoPurchaseOrder): Promise<ZohoCreatePOResponse> {
    try {
      await this.ensureValidToken();
      const orgId = await this.getOrganizationId();

      logger.info('Creating purchase order in Zoho Books', {
        vendorId: po.vendor_id,
        lineItemsCount: po.line_items.length,
        organizationId: orgId,
        endpoint: `/purchaseorders?organization_id=${orgId}`,
      });

      // Log line items to verify tax_id is present
      po.line_items.forEach((item, index) => {
        logger.info(`Line item ${index + 1} tax info`, {
          itemName: item.name,
          taxId: item.tax_id || 'NOT SET',
          taxExemptionId: item.tax_exemption_id || 'NOT SET',
          reverseCharge: item.reverse_charge !== undefined ? item.reverse_charge : 'NOT SET',
        });
      });

      // Zoho Books API: purchase orders need to be wrapped in 'purchaseorder' object
      // This is different from contacts which are sent directly
      const response = await this.axiosInstance.post<ZohoCreatePOResponse>(
        `/purchaseorders?organization_id=${orgId}`,
        po
      );

      if (response.data.code === 0 && response.data.purchaseorder) {
        logger.info('✅ Successfully created purchase order in Zoho', {
          purchaseorderId: response.data.purchaseorder.purchaseorder_id,
          purchaseorderNumber: response.data.purchaseorder.purchaseorder_number,
        });
        return response.data;
      } else {
        throw new Error(
          `Zoho API error: ${response.data.message || 'Unknown error'} (code: ${response.data.code})`
        );
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to create purchase order in Zoho', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      // Provide more helpful error messages
      if (axiosError.response?.status === 401) {
        throw new Error('Zoho authentication failed. Please check your credentials.');
      } else if (axiosError.response?.status === 404) {
        throw new Error('Zoho organization not found. Please check ZOHO_ORGANIZATION_ID.');
      } else if (axiosError.response?.data) {
        const errorData = axiosError.response.data as any;
        throw new Error(
          `Zoho API error: ${errorData.message || errorData.error || 'Unknown error'}`
        );
      }

      throw new Error(`Failed to create purchase order in Zoho: ${axiosError.message}`);
    }
  }

  /**
   * Get purchase order by ID
   */
  async getPurchaseOrder(purchaseorderId: string): Promise<any> {
    try {
      await this.ensureValidToken();
      const orgId = await this.getOrganizationId();

      const response = await this.axiosInstance.get(
        `/purchaseorders/${purchaseorderId}?organization_id=${orgId}`
      );

      if (response.data.code === 0) {
        return response.data.purchaseorder;
      } else {
        throw new Error(`Zoho API error: ${response.data.message}`);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to get purchase order from Zoho', {
        purchaseorderId,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw new Error(`Failed to get purchase order from Zoho: ${axiosError.message}`);
    }
  }

  /**
   * Get all contacts (customers and vendors) from Zoho Books
   */
  async getContacts(contactType?: 'customer' | 'vendor'): Promise<any[]> {
    try {
      await this.ensureValidToken();
      const orgId = await this.getOrganizationId();

      let url = `/contacts?organization_id=${orgId}`;
      if (contactType) {
        url += `&contact_type=${contactType}`;
      }

      const response = await this.axiosInstance.get(url);

      if (response.data.code === 0 && response.data.contacts) {
        return response.data.contacts;
      } else {
        throw new Error(`Zoho API error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to get contacts from Zoho', {
        contactType,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw new Error(`Failed to get contacts from Zoho: ${axiosError.message}`);
    }
  }

  /**
   * Get all vendors from Zoho Books
   */
  async getVendors(): Promise<any[]> {
    return this.getContacts('vendor');
  }

  /**
   * Create a vendor (contact) in Zoho Books
   */
  async createVendor(vendorData: {
    vendor_name: string;
    company_name?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    billing_address?: {
      address?: string;
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
    shipping_address?: {
      address?: string;
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
    currency_code?: string;
    payment_terms?: number;
    notes?: string;
  }): Promise<any> {
    try {
      await this.ensureValidToken();
      const orgId = await this.getOrganizationId();

      logger.info('Creating vendor in Zoho Books', {
        vendorName: vendorData.vendor_name,
        organizationId: orgId,
      });

      // Zoho Books API structure for creating vendors
      // According to Zoho API docs, use contact_name (not vendor_name) and set contact_type to 'vendor'
      const contactData: any = {
        contact_type: 'vendor', // This is critical - must be 'vendor' not 'customer'
        contact_name: vendorData.vendor_name, // Use contact_name for both customers and vendors
        company_name: vendorData.company_name || vendorData.vendor_name,
      };

      // Add optional fields only if provided
      if (vendorData.email) {
        contactData.email = vendorData.email;
      }
      if (vendorData.phone) {
        contactData.phone = vendorData.phone;
      }
      if (vendorData.mobile) {
        contactData.mobile = vendorData.mobile;
      }
      if (vendorData.billing_address) {
        contactData.billing_address = vendorData.billing_address;
      }
      if (vendorData.shipping_address) {
        contactData.shipping_address = vendorData.shipping_address;
      }
      if (vendorData.currency_code) {
        contactData.currency_code = vendorData.currency_code;
      }
      if (vendorData.payment_terms) {
        contactData.payment_terms = vendorData.payment_terms;
      }
      if (vendorData.notes) {
        contactData.notes = vendorData.notes;
      }

      logger.info('Creating vendor with payload', { contactData });

      // Zoho Books API for contacts: send data directly (not wrapped like purchase orders)
      // Postman sends it directly, so we'll match that structure
      const response = await this.axiosInstance.post(
        `/contacts?organization_id=${orgId}`,
        contactData
      );

      if (response.data.code === 0 && response.data.contact) {
        logger.info('✅ Successfully created vendor in Zoho', {
          contactId: response.data.contact.contact_id,
          contactName: response.data.contact.contact_name,
        });
        return response.data.contact;
      } else {
        throw new Error(
          `Zoho API error: ${response.data.message || 'Unknown error'} (code: ${response.data.code})`
        );
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to create vendor in Zoho', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      if (axiosError.response?.data) {
        const errorData = axiosError.response.data as any;
        throw new Error(
          `Zoho API error: ${errorData.message || errorData.error || 'Unknown error'}`
        );
      }

      throw new Error(`Failed to create vendor in Zoho: ${axiosError.message}`);
    }
  }

  /**
   * Get all expense accounts from Zoho Books Chart of Accounts
   */
  async getExpenseAccounts(): Promise<Array<{ account_id: string; account_name: string }>> {
    try {
      await this.ensureValidToken();
      const orgId = await this.getOrganizationId();

      logger.info('Fetching expense accounts from Zoho Books', {
        organizationId: orgId,
      });

      const allAccounts: Array<{ account_id: string; account_name: string }> = [];
      let page = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await this.axiosInstance.get(
          `/chartofaccounts?organization_id=${orgId}&filter_by=AccountType.Expense&page=${page}`
        );

        if (response.data.code === 0) {
          const accounts = response.data.chartofaccounts || [];
          
          // Filter to only active accounts and extract account_id and account_name
          const expenseAccounts = accounts
            .filter((account: any) => account.is_active === true)
            .map((account: any) => ({
              account_id: account.account_id,
              account_name: account.account_name,
            }));

          allAccounts.push(...expenseAccounts);

          // Check if there are more pages
          const pageContext = response.data.page_context || {};
          hasMorePages = pageContext.has_more_page === true;

          if (hasMorePages) {
            page++;
          }
        } else {
          throw new Error(
            `Zoho API error: ${response.data.message || 'Unknown error'} (code: ${response.data.code})`
          );
        }
      }

      logger.info('✅ Successfully fetched expense accounts from Zoho', {
        count: allAccounts.length,
      });

      return allAccounts;
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to get expense accounts from Zoho', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      if (axiosError.response?.data) {
        const errorData = axiosError.response.data as any;
        throw new Error(
          `Zoho API error: ${errorData.message || errorData.error || 'Unknown error'}`
        );
      }

      throw new Error(`Failed to get expense accounts from Zoho: ${axiosError.message}`);
    }
  }
}

