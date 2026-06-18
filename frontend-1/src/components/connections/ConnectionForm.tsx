import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { erpConnectionsAPI } from "@/api/api";
import { Loader2, CheckCircle, XCircle, Check, ChevronsUpDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface FormField {
  name: string;
  label: string;
  required: boolean;
  type: 'text' | 'password' | 'email' | 'url';
  default?: string;
  placeholder?: string;
  helpText?: string;
}

interface ConnectionFormProps {
  systemType: string;
  systemTypeName: string;
  fields: FormField[];
  initialData?: any;
  orgId: string;
  onSave: (data: any) => Promise<void>;
  onCancel?: () => void;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({
  systemType,
  systemTypeName,
  fields,
  initialData,
  orgId,
  onSave,
  onCancel,
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState(() => {
    const initial: any = {
      name: initialData?.name || `${systemTypeName} Connection`,
      org_id: orgId,
      system_type: systemType,
      is_active: initialData?.is_active ?? true,
      default_purchase_account_id: initialData?.default_purchase_account_id || '',
      default_purchase_account_name: initialData?.default_purchase_account_name || '',
    };

    // Initialize OAuth fields
    const oauthFields: any = {};
    fields.forEach((field) => {
      oauthFields[field.name] = initialData?.connection_config?.oauth?.[field.name] || field.default || '';
    });
    initial.connection_config = { oauth: oauthFields };

    return initial;
  });

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  // Initialize testPassed to true for existing connections (they were already tested)
  // Will be reset to false if credentials are changed
  const [testPassed, setTestPassed] = useState(!!initialData?.id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expenseAccounts, setExpenseAccounts] = useState<Array<{ account_id: string; account_name: string }>>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false); // Track if accounts are loaded and should show dropdown

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      connection_config: {
        ...prev.connection_config,
        oauth: {
          ...prev.connection_config.oauth,
          [fieldName]: value,
        },
      },
    }));
    // Clear error for this field
    if (errors[fieldName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
    // Reset test result and clear selected account when credentials change
    if (testResult) {
      setTestResult(null);
      setTestPassed(false);
    }
    // Clear selected account when credentials change
    if (formData.default_purchase_account_id || formData.default_purchase_account_name) {
      setFormData((prev: any) => ({
        ...prev,
        default_purchase_account_id: '',
        default_purchase_account_name: '',
      }));
      setExpenseAccounts([]);
      setShowAccountDropdown(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.trim() === '') {
      newErrors.name = 'Connection name is required';
    }

    fields.forEach((field) => {
      if (field.required) {
        const value = formData.connection_config?.oauth?.[field.name];
        if (!value || value.trim() === '') {
          newErrors[field.name] = `${field.label} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestPassed(false);

    try {
      // Pass connectionId if this is an existing connection so that refreshed tokens are saved
      const result = await erpConnectionsAPI.testConnection(
        systemType,
        formData.connection_config.oauth,
        initialData?.id
      ) as { success: boolean; message?: string; data?: { new_refresh_token?: string } };

      if (result.success) {
        // Questrade rotates the refresh token on every use. If the backend returns a new token
        // (new connection flow — no connectionId to persist to), update the form field directly
        // without going through handleFieldChange, which would reset testPassed.
        const newToken = result.data?.new_refresh_token;
        if (newToken) {
          setFormData((prev: any) => ({
            ...prev,
            connection_config: {
              ...prev.connection_config,
              oauth: { ...prev.connection_config.oauth, refresh_token: newToken },
            },
          }));
        }

        const successMessage = newToken
          ? `${result.message || 'Connection test successful!'} The token in this form has been updated with the refreshed value — click Save to store it.`
          : result.message || 'Connection test successful!';

        setTestResult({ success: true, message: successMessage });
        setTestPassed(true);
        toast({ title: "Success", description: result.message || 'Connection test passed' });
      } else {
        setTestResult({
          success: false,
          message: result.message || 'Connection test failed',
        });
        setTestPassed(false);
        toast({
          title: "Connection Test Failed",
          description: result.message || 'Please check your credentials',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to test connection';
      setTestResult({
        success: false,
        message: errorMessage,
      });
      setTestPassed(false);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleLoadAccounts = async () => {
    // Account loading only works after connection is saved
    if (!initialData?.id) {
      toast({
        title: "Connection Not Saved",
        description: "Please save the connection first before loading accounts",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingAccounts(true);
    try {
      const result = await erpConnectionsAPI.fetchExpenseAccounts(initialData.id) as {
        success: boolean;
        data?: Array<{ account_id: string; account_name: string }>;
        message?: string;
      };

      if (result.success && result.data) {
        setExpenseAccounts(result.data);
        setShowAccountDropdown(true); // Show dropdown after accounts are loaded
        setAccountSearchOpen(true); // Open the dropdown automatically
        if (result.data.length === 0) {
          toast({
            title: "No Accounts Found",
            description: "No expense accounts found",
            variant: "destructive",
          });
        }
      } else {
        throw new Error(result.message || 'Failed to fetch expense accounts');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to load expense accounts',
        variant: "destructive",
      });
      setExpenseAccounts([]);
      setShowAccountDropdown(false);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleChangeAccount = async () => {
    // Load accounts and show dropdown
    if (!initialData?.id) return;
    
    setIsLoadingAccounts(true);
    try {
      const result = await erpConnectionsAPI.fetchExpenseAccounts(initialData.id) as {
        success: boolean;
        data?: Array<{ account_id: string; account_name: string }>;
        message?: string;
      };

      if (result.success && result.data) {
        setExpenseAccounts(result.data);
        setShowAccountDropdown(true); // Show dropdown after accounts are loaded
        setAccountSearchOpen(true); // Open the dropdown automatically
        if (result.data.length === 0) {
          toast({
            title: "No Accounts Found",
            description: "No expense accounts found",
            variant: "destructive",
          });
        }
      } else {
        throw new Error(result.message || 'Failed to fetch expense accounts');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to load expense accounts',
        variant: "destructive",
      });
      setExpenseAccounts([]);
      setShowAccountDropdown(false);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleAccountSelect = (accountId: string) => {
    const selectedAccount = expenseAccounts.find(acc => acc.account_id === accountId);
    if (selectedAccount) {
      setFormData((prev: any) => ({
        ...prev,
        default_purchase_account_id: selectedAccount.account_id,
        default_purchase_account_name: selectedAccount.account_name,
      }));
      // Close dropdown after selection, but keep it available for future changes
      setAccountSearchOpen(false);
      // Keep showAccountDropdown true so dropdown remains visible showing the selected account
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!testPassed) {
      toast({
        title: "Test Required",
        description: "Please test the connection before saving",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to save connection',
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connection Details</CardTitle>
          <CardDescription>
            Configure your {systemTypeName} connection. All credentials are encrypted and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Connection Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, name: e.target.value }))}
              placeholder="Enter connection name"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* OAuth Fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">OAuth Credentials</h3>
            {fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id={field.name}
                  type={field.type}
                  value={formData.connection_config?.oauth?.[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  placeholder={field.placeholder || field.label}
                  className={errors[field.name] ? 'border-red-500' : ''}
                />
                {errors[field.name] && (
                  <p className="text-sm text-red-500">{errors[field.name]}</p>
                )}
                {field.helpText && (
                  <p className="text-xs text-gray-500">{field.helpText}</p>
                )}
              </div>
            ))}
          </div>

          {/* Default Purchase Account - For Zoho Books and QuickBooks */}
          {(systemType === 'zoho_books' || systemType === 'quickbooks') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Default Purchase Account</h3>
              </div>
              
              {!initialData?.id && (
                <p className="text-xs text-gray-500 italic">
                  Save the connection first to enable account selection
                </p>
              )}

              {/* Connection saved but no account selected and accounts not loaded */}
              {initialData?.id && !formData.default_purchase_account_id && !showAccountDropdown && !isLoadingAccounts && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLoadAccounts}
                  disabled={isSaving}
                >
                  Select Purchase Account
                </Button>
              )}

              {/* Loading accounts state */}
              {initialData?.id && isLoadingAccounts && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                >
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading accounts...
                </Button>
              )}

              {/* Account already selected - show account name (dropdown-like, non-interactive) with Change button */}
              {initialData?.id && formData.default_purchase_account_id && !showAccountDropdown && !isLoadingAccounts && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 justify-between"
                    disabled
                  >
                    <span>{formData.default_purchase_account_name}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleChangeAccount}
                    disabled={isSaving || isLoadingAccounts}
                  >
                    {isLoadingAccounts ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Change'
                    )}
                  </Button>
                </div>
              )}

              {/* Accounts loaded - show searchable dropdown */}
              {initialData?.id && showAccountDropdown && expenseAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="expense-account">Select Expense Account</Label>
                  <Popover open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={accountSearchOpen}
                        className="w-full justify-between"
                        id="expense-account"
                      >
                        {formData.default_purchase_account_name || "Select an expense account..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command 
                        filter={(value, search) => {
                          // Custom filter: search by account name (the value is account_name)
                          if (!search) return 1;
                          const accountName = value.toLowerCase();
                          const searchLower = search.toLowerCase();
                          return accountName.includes(searchLower) ? 1 : 0;
                        }}
                      >
                        <CommandInput 
                          placeholder="Search accounts..." 
                        />
                        <CommandEmpty>No accounts found.</CommandEmpty>
                        <CommandGroup>
                          <CommandList>
                            {expenseAccounts.map((account) => (
                                <CommandItem
                                  key={account.account_id}
                                  value={account.account_name}
                                  onSelect={() => {
                                    handleAccountSelect(account.account_id);
                                    setAccountSearchOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.default_purchase_account_id === account.account_id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {account.account_name}
                                </CommandItem>
                              ))}
                          </CommandList>
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* No accounts found after loading */}
              {initialData?.id && showAccountDropdown && expenseAccounts.length === 0 && !isLoadingAccounts && (
                <p className="text-xs text-gray-500">
                  No expense accounts found
                </p>
              )}
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </div>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              disabled={!testPassed || isSaving || isTesting}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Connection'
              )}
            </Button>

            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionForm;


