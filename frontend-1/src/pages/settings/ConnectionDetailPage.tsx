import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { erpConnectionsAPI } from "@/api/api";
import { fetchAPI } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Edit, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ConnectionForm from "@/components/connections/ConnectionForm";

interface SourceSystem {
  id: string;
  name: string;
  system_type: string;
  is_active: boolean;
  created_at: string;
  modified_at: string;
  org_id: string;
  connection_config?: any; // Encrypted
  region?: string;
  connector_version?: string;
  default_purchase_account_id?: string;
  default_purchase_account_name?: string;
  last_sync_at?: string | null;
  last_sync_status?: { status?: string; message?: string; synced_at?: string; detail?: unknown } | null;
}

const SYNCABLE_SYSTEM_TYPES = new Set(["zoho_books", "quickbooks"]);
const BROKER_SYSTEM_TYPES = new Set(["questrade"]);
type SyncMode = "full_sync" | "transform_only" | "extract_only";

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

const ConnectionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [connection, setConnection] = useState<SourceSystem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [decryptedConfig, setDecryptedConfig] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>("full_sync");
  const [brokerSyncing, setBrokerSyncing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchConnection();
    }
  }, [id]);

  const fetchConnection = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response: any = await erpConnectionsAPI.getById(id);
      // RestService returns { success: true, data: {...} }
      const connectionData = response?.data || response;

      setConnection(connectionData);

      // Note: connection_config is encrypted in the database
      // For editing, we'll need to decrypt it. For now, we'll pass it as-is
      // The form will handle empty values and user can re-enter credentials
      if (connectionData.connection_config) {
        // If it's already an object (shouldn't happen, but handle gracefully)
        if (typeof connectionData.connection_config === 'object') {
          setDecryptedConfig(connectionData.connection_config);
        } else {
          // It's encrypted, we'll need to handle this differently
          // For now, set empty config so user can enter new credentials
          setDecryptedConfig({ oauth: {} });
        }
      } else {
        setDecryptedConfig({ oauth: {} });
      }
    } catch (error) {
      console.error("Error fetching connection:", error);
      toast({
        title: "Error",
        description: "Failed to load connection details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToList = () => {
    navigate("/settings/connections");
  };

  const handleSave = async (data: any) => {
    if (!id) return;

    try {
      await erpConnectionsAPI.update(id, data);
      toast({
        title: "Success",
        description: "Connection updated successfully",
      });
      setIsEditing(false);
      fetchConnection(); // Refresh data
    } catch (error: any) {
      throw error; // Let ConnectionForm handle the error display
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    fetchConnection(); // Reset to original data
  };

  const handleBrokerSync = async () => {
    if (!connection) return;
    setBrokerSyncing(true);
    try {
      await fetchAPI('/api/broker-sync/run', { method: 'POST', body: JSON.stringify({ connection_id: connection.id }) });
      toast({ title: 'Sync complete', description: 'Portfolio updated from Questrade.' });
      fetchConnection();
    } catch {
      // fetchAPI shows error toast
    } finally {
      setBrokerSyncing(false);
    }
  };

  const handleSync = async () => {
    if (!id || !connection || !SYNCABLE_SYSTEM_TYPES.has(connection.system_type)) return;
    setSyncing(true);
    try {
      const res: any = await erpConnectionsAPI.triggerSync(id, syncMode);
      const queuedStatus = res?.data ?? {
        status: "in_progress",
        message: "Sync in progress",
        sync_mode: syncMode,
      };
      setConnection((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          last_sync_status: queuedStatus,
          last_sync_at: new Date().toISOString(),
        };
      });
      toast({
        title: "Sync started",
        description: "Sync is running in background. Status will update after completion.",
      });
    } catch {
      // fetchAPI shows error toast for HTTP failures
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading connection...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connection Not Found</h2>
          <Button onClick={handleBackToList}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connections
          </Button>
        </div>
      </div>
    );
  }

  const isSyncInProgress =
    (connection.last_sync_status as { status?: string } | null | undefined)?.status === "in_progress";

  const systemTypeConfig = SYSTEM_TYPE_CONFIGS[connection.system_type];

  if (!user?.org_id) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-red-500">Organization ID not found. Please contact support.</p>
          <Button onClick={handleBackToList} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connections
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={handleBackToList}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Connections
        </Button>
        <span className="text-gray-500">/</span>
        <span className="text-gray-700 font-medium">{connection.name}</span>
      </div>

      {!isEditing ? (
        <>
          {/* Connection Header */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-2xl">{connection.name}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      System: <code className="bg-gray-100 px-2 py-1 rounded text-xs">{connection.system_type}</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {SYNCABLE_SYSTEM_TYPES.has(connection.system_type) && (
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={syncMode}
                      onChange={(e) => setSyncMode(e.target.value as SyncMode)}
                      disabled={syncing}
                      title="Sync mode"
                    >
                      <option value="full_sync">Full sync — extract + transform</option>
                      <option value="transform_only">Transform only</option>
                      <option value="extract_only">Extract only</option>
                    </select>
                  )}
                  <Badge variant={connection.is_active ? "default" : "secondary"}>
                    {connection.is_active ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                  {SYNCABLE_SYSTEM_TYPES.has(connection.system_type) && (
                    <Button
                      variant="secondary"
                      disabled={syncing || isSyncInProgress || !connection.is_active}
                      onClick={() => void handleSync()}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                      {syncing ? "Syncing…" : "Sync"}
                    </Button>
                  )}
                  {BROKER_SYSTEM_TYPES.has(connection.system_type) && (
                    <Button
                      variant="secondary"
                      disabled={brokerSyncing || !connection.is_active}
                      onClick={() => void handleBrokerSync()}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${brokerSyncing ? "animate-spin" : ""}`} />
                      {brokerSyncing ? "Syncing…" : "Sync Now"}
                    </Button>
                  )}
                  <Button onClick={() => setIsEditing(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold">Created:</span>{' '}
                  {new Date(connection.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-semibold">Modified:</span>{' '}
                  {new Date(connection.modified_at).toLocaleString()}
                </div>
                {connection.region && (
                  <div>
                    <span className="font-semibold">Region:</span> {connection.region}
                  </div>
                )}
                {connection.connector_version && (
                  <div>
                    <span className="font-semibold">Version:</span> {connection.connector_version}
                  </div>
                )}
                {connection.default_purchase_account_name && (
                  <div className="col-span-2">
                    <span className="font-semibold">Default Purchase Account:</span>{' '}
                    {connection.default_purchase_account_name}
                  </div>
                )}
                {connection.last_sync_at && (
                  <div>
                    <span className="font-semibold">Last sync:</span>{' '}
                    {new Date(connection.last_sync_at).toLocaleString()}
                  </div>
                )}
                {connection.last_sync_status && (
                  <div className="col-span-2">
                    <span className="font-semibold">Last sync status:</span>{' '}
                    <span className="text-gray-700">
                      {(connection.last_sync_status as { status?: string }).status ?? '—'}
                      {(connection.last_sync_status as { message?: string }).message
                        ? ` — ${(connection.last_sync_status as { message?: string }).message}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-4 p-4 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">
                  <strong>Note:</strong> Connection credentials are encrypted and stored securely.
                  Click Edit to update credentials.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : systemTypeConfig ? (
        <ConnectionForm
          systemType={connection.system_type}
          systemTypeName={systemTypeConfig.name}
          fields={systemTypeConfig.fields}
          initialData={{
            ...connection,
            id: connection.id,
            connection_config: decryptedConfig,
          }}
          orgId={user.org_id!}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">System type configuration not found</p>
          <Button onClick={handleBackToList}>
            Back to Connections
          </Button>
        </div>
      )}
    </div>
  );
};

export default ConnectionDetailPage;

