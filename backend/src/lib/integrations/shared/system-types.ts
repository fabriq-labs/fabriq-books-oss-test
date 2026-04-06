/**
 * System Type Configuration
 * 
 * Defines available ERP system types and their form field configurations.
 */

export interface FormField {
  name: string;
  label: string;
  required: boolean;
  type: 'text' | 'password' | 'email' | 'url';
  default?: string;
  placeholder?: string;
  helpText?: string;
}

export interface SystemTypeConfig {
  id: string;
  name: string;
  enabled: boolean;
  fields: FormField[];
  description?: string;
}

export const SYSTEM_TYPES: SystemTypeConfig[] = [
  {
    id: 'zoho_books',
    name: 'Zoho Books',
    enabled: true,
    description: 'Connect to Zoho Books for accounting and invoicing',
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        required: true,
        type: 'text',
        placeholder: 'Enter your Zoho Client ID',
        helpText: 'Get this from https://api-console.zoho.com/',
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        required: true,
        type: 'password',
        placeholder: 'Enter your Zoho Client Secret',
        helpText: 'Get this from https://api-console.zoho.com/',
      },
      {
        name: 'refresh_token',
        label: 'Refresh Token',
        required: true,
        type: 'password',
        placeholder: 'Enter your Zoho Refresh Token',
        helpText: 'Generate this using the Zoho OAuth flow',
      },
      {
        name: 'organization_id',
        label: 'Organization ID',
        required: false,
        type: 'text',
        placeholder: 'Auto-detected if not provided',
        helpText: 'Optional: Your Zoho Books organization ID',
      },
      {
        name: 'api_domain',
        label: 'API Domain',
        required: false,
        type: 'text',
        default: 'www.zohoapis.com',
        placeholder: 'www.zohoapis.com',
        helpText: 'Select based on your Zoho data center (US, EU, IN, etc.)',
      },
      {
        name: 'accounts_domain',
        label: 'Accounts Domain',
        required: false,
        type: 'text',
        default: 'https://accounts.zoho.com',
        placeholder: 'https://accounts.zoho.com',
        helpText: 'OAuth accounts domain for your region',
      },
    ],
  },
  {
    id: 'xero',
    name: 'Xero',
    enabled: false,
    description: 'Connect to Xero for accounting and invoicing (Coming soon)',
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        required: true,
        type: 'text',
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        required: true,
        type: 'password',
      },
      {
        name: 'refresh_token',
        label: 'Refresh Token',
        required: true,
        type: 'password',
      },
      {
        name: 'tenant_id',
        label: 'Tenant ID',
        required: false,
        type: 'text',
      },
    ],
  },
  {
    id: 'netsuite',
    name: 'Netsuite',
    enabled: false,
    description: 'Connect to Netsuite for ERP integration (Coming soon)',
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        required: true,
        type: 'text',
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        required: true,
        type: 'password',
      },
      {
        name: 'refresh_token',
        label: 'Refresh Token',
        required: true,
        type: 'password',
      },
    ],
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    enabled: true,
    description: 'Connect to QuickBooks Online for accounting and invoicing',
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        required: true,
        type: 'text',
        placeholder: 'Enter your QuickBooks Client ID',
        helpText: 'Get this from https://developer.intuit.com/app/developer/dashboard',
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        required: true,
        type: 'password',
        placeholder: 'Enter your QuickBooks Client Secret',
        helpText: 'Get this from https://developer.intuit.com/app/developer/dashboard',
      },
      {
        name: 'refresh_token',
        label: 'Refresh Token',
        required: true,
        type: 'password',
        placeholder: 'Enter your QuickBooks Refresh Token',
        helpText: 'Generate this using the QuickBooks OAuth flow',
      },
      {
        name: 'realm_id',
        label: 'Company ID (Realm ID)',
        required: true,
        type: 'text',
        placeholder: 'Enter your QuickBooks Company ID',
        helpText: 'Required for all QuickBooks API calls. Found in OAuth callback or company info.',
      },
      {
        name: 'environment',
        label: 'Environment',
        required: false,
        type: 'text',
        default: 'production',
        placeholder: 'production',
        helpText: 'Select sandbox or production environment',
      },
    ],
  },
];

/**
 * Get system type configuration by ID
 */
export function getSystemTypeConfig(systemTypeId: string): SystemTypeConfig | undefined {
  return SYSTEM_TYPES.find((config) => config.id === systemTypeId);
}

/**
 * Get enabled system types only
 */
export function getEnabledSystemTypes(): SystemTypeConfig[] {
  return SYSTEM_TYPES.filter((config) => config.enabled);
}


