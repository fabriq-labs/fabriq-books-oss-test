import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { erpConnectionsAPI } from "@/api/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SystemTypeSelector from "@/components/connections/SystemTypeSelector";
import ConnectionForm from "@/components/connections/ConnectionForm";

// System type configurations (matching backend)
const SYSTEM_TYPE_CONFIGS: Record<string, { name: string; fields: any[] }> = {
  zoho_books: {
    name: 'Zoho Books',
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
  questrade: {
    name: 'Questrade',
    fields: [
      {
        name: 'refresh_token',
        label: 'Personal Access Token',
        required: true,
        type: 'password',
        placeholder: 'Paste your Questrade Personal Access Token',
        helpText: 'Generate at questrade.com → App Hub → Personal Access Token. Tokens expire after 3 days without a sync.',
      },
    ],
  },
  quickbooks: {
    name: 'QuickBooks Online',
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
};

const CreateConnectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { systemType: systemTypeParam } = useParams<{ systemType?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedSystemType, setSelectedSystemType] = useState<string | null>(
    systemTypeParam || null
  );

  const handleSystemTypeSelect = (systemType: string) => {
    setSelectedSystemType(systemType);
  };

  const handleSave = async (data: any) => {
    try {
      await erpConnectionsAPI.create(data);
      toast({
        title: "Success",
        description: "Connection created successfully",
      });
      navigate('/settings/connections');
    } catch (error: any) {
      throw error; // Let ConnectionForm handle the error display
    }
  };

  const handleCancel = () => {
    navigate('/settings/connections');
  };

  const systemTypeConfig = selectedSystemType
    ? SYSTEM_TYPE_CONFIGS[selectedSystemType]
    : null;

  if (!user?.org_id) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-red-500">Organization ID not found. Please contact support.</p>
          <Button onClick={() => navigate('/settings/connections')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connections
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Connections
        </Button>
        <span className="text-gray-500">/</span>
        <span className="text-gray-700 font-medium">
          {selectedSystemType ? `Create ${systemTypeConfig?.name} Connection` : 'Create Connection'}
        </span>
      </div>

      {!selectedSystemType ? (
        <SystemTypeSelector onSelect={handleSystemTypeSelect} />
      ) : systemTypeConfig ? (
        <ConnectionForm
          systemType={selectedSystemType}
          systemTypeName={systemTypeConfig.name}
          fields={systemTypeConfig.fields}
          orgId={user.org_id!}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">Invalid system type selected</p>
          <Button onClick={() => setSelectedSystemType(null)}>
            Select Again
          </Button>
        </div>
      )}
    </div>
  );
};

export default CreateConnectionPage;


