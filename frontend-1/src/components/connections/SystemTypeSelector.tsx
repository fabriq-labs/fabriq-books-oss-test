import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

interface SystemTypeConfig {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
}

const SYSTEM_TYPES: SystemTypeConfig[] = [
  {
    id: 'zoho_books',
    name: 'Zoho Books',
    enabled: true,
    description: 'Connect to Zoho Books for accounting and invoicing',
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    enabled: true,
    description: 'Connect to QuickBooks Online for accounting and invoicing',
  },
  {
    id: 'xero',
    name: 'Xero',
    enabled: false,
    description: 'Connect to Xero for accounting and invoicing (Coming soon)',
  },
  {
    id: 'netsuite',
    name: 'Netsuite',
    enabled: false,
    description: 'Connect to Netsuite for ERP integration (Coming soon)',
  },
];

interface SystemTypeSelectorProps {
  onSelect: (systemType: string) => void;
}

const SystemTypeSelector: React.FC<SystemTypeSelectorProps> = ({ onSelect }) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select ERP System</h3>
        <p className="text-sm text-gray-600 mb-4">
          Choose the ERP system you want to connect. Only enabled systems are available.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SYSTEM_TYPES.map((systemType) => (
          <Card
            key={systemType.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              systemType.enabled
                ? 'hover:border-primary'
                : 'opacity-60 cursor-not-allowed'
            }`}
            onClick={() => systemType.enabled && onSelect(systemType.id)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{systemType.name}</CardTitle>
                <Badge variant={systemType.enabled ? 'default' : 'secondary'}>
                  {systemType.enabled ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Available
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Coming Soon
                    </>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                {systemType.description}
              </CardDescription>
              {systemType.enabled && (
                <Button
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(systemType.id);
                  }}
                >
                  Select {systemType.name}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SystemTypeSelector;


