import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { viewAPI, bulkEditAPI } from '@/api/api';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, X } from 'lucide-react';

interface HQAccountMappingTabProps {
  organizationId: string;  // Current sub-entity organization ID
  orgId: string;           // Tenant org_id for fetching HQ accounts
}

interface Account {
  id: string;
  name: string | null;
  code: string | null;
  classification: string | null;
  hq_account_id: string | null;
}

export const HQAccountMappingTab: React.FC<HQAccountMappingTabProps> = ({
  organizationId,
  orgId,
}) => {
  const [subEntityAccounts, setSubEntityAccounts] = useState<Account[]>([]);
  const [hqAccounts, setHqAccounts] = useState<Account[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch sub-entity accounts and HQ accounts
  useEffect(() => {
    const fetchData = async () => {
      console.log('HQAccountMappingTab: Fetching data', { organizationId, orgId });
      setIsLoading(true);
      setError(null);
      try {
        // Fetch sub-entity accounts
        const subEntityResponse: any = await viewAPI.search(
          "account",
          "account_view",
          1,
          1000,
          undefined,
          { legal_entity_id: { eq: organizationId } }
        );
        const subEntityData = subEntityResponse?.data || [];
        console.log('HQAccountMappingTab: Sub-entity accounts', subEntityData.length);
        setSubEntityAccounts(subEntityData);

        // Initialize mappings from existing hq_account_id values
        const initialMappings: Record<string, string> = {};
        subEntityData.forEach((account: Account) => {
          if (account.hq_account_id) {
            initialMappings[account.id] = account.hq_account_id;
          }
        });
        setMappings(initialMappings);

        // Find HQ organization
        const orgResponse: any = await viewAPI.search(
          "entity",
          "entity_view",
          1,
          100,
          undefined,
          { is_it_headquartres: { eq: "Yes" }, org_id: { eq: orgId } }
        );
        const hqOrg = orgResponse?.data?.[0];

        if (hqOrg) {
          // Fetch HQ accounts
          const hqResponse: any = await viewAPI.search(
            "account",
            "account_view",
            1,
            1000,
            undefined,
            { legal_entity_id: { eq: hqOrg.id } }
          );
          const hqData = hqResponse?.data || [];
          console.log('HQAccountMappingTab: HQ accounts', hqData.length);
          setHqAccounts(hqData);
        } else {
          console.warn('HQAccountMappingTab: HQ organization not found');
          setError('HQ organization not found');
        }
      } catch (error: any) {
        console.error("Error fetching accounts:", error);
        const errorMessage = error.message || "Failed to fetch accounts";
        setError(errorMessage);
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (organizationId && orgId) {
      fetchData();
    } else {
      setIsLoading(false);
      setError("Missing organization ID or org ID");
    }
  }, [organizationId, orgId, toast]);

  const handleMappingChange = (accountId: string, hqAccountId: string) => {
    setMappings((prev) => {
      if (hqAccountId) {
        return {
          ...prev,
          [accountId]: hqAccountId,
        };
      } else {
        // Remove mapping if empty
        const newMappings = { ...prev };
        delete newMappings[accountId];
        return newMappings;
      }
    });
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);

      // Prepare bulk update data - only include accounts that have changed
      const changedAccounts = subEntityAccounts.filter((account) => {
        const currentMapping = mappings[account.id] || null;
        const originalMapping = account.hq_account_id || null;
        return currentMapping !== originalMapping;
      });

      if (changedAccounts.length === 0) {
        toast({
          title: "No changes",
          description: "No mappings have been changed",
        });
        return;
      }

      // Update each account individually since each has different hq_account_id value
      const updatePromises = changedAccounts.map((account) => {
        const hqAccountId = mappings[account.id] || null;
        return viewAPI.update(
          "account",
          account.id,
          "account_view",
          { hq_account_id: hqAccountId }
        );
      });

      await Promise.all(updatePromises);

      toast({
        title: "Success",
        description: `Successfully updated ${changedAccounts.length} account mapping(s)`,
      });

      // Refresh data to get updated values
      const subEntityResponse: any = await viewAPI.search(
        "account",
        "account_view",
        1,
        1000,
        undefined,
        { legal_entity_id: { eq: organizationId } }
      );
      const subEntityData = subEntityResponse?.data || [];
      setSubEntityAccounts(subEntityData);

      // Update mappings to reflect saved state
      const updatedMappings: Record<string, string> = {};
      subEntityData.forEach((account: Account) => {
        if (account.hq_account_id) {
          updatedMappings[account.id] = account.hq_account_id;
        }
      });
      setMappings(updatedMappings);
    } catch (error: any) {
      console.error("Error saving mappings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save mappings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Get HQ accounts filtered by classification
  const getHqAccountsByClassification = (classification: string | null) => {
    if (!classification) return hqAccounts;
    return hqAccounts.filter((acc) => acc.classification === classification);
  };

  // Get account display name
  const getAccountDisplayName = (account: Account) => {
    const parts = [];
    if (account.code) parts.push(`(${account.code})`);
    if (account.name) parts.push(account.name);
    return parts.length > 0 ? parts.join(' ') : account.id;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>HQ Account Mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>HQ Account Mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            <p className="font-semibold">Error loading accounts</p>
            <p className="text-sm mt-2">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>HQ Account Mapping</CardTitle>
          <Button onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save All Mappings"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {subEntityAccounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No accounts found for this entity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Classification</TableHead>
                  <TableHead>HQ Account</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subEntityAccounts.map((account) => {
                  const currentMapping = mappings[account.id] || null;
                  const hqAccountOptions = getHqAccountsByClassification(account.classification);
                  const selectedHqAccount = hqAccounts.find((acc) => acc.id === currentMapping);

                  return (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono text-sm">
                        {account.code || '-'}
                      </TableCell>
                      <TableCell>{account.name || '-'}</TableCell>
                      <TableCell>{account.classification || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={currentMapping || undefined}
                            onValueChange={(value) => handleMappingChange(account.id, value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="-- Select --" />
                            </SelectTrigger>
                            <SelectContent>
                              {hqAccountOptions.map((hqAccount) => (
                                <SelectItem key={hqAccount.id} value={hqAccount.id}>
                                  {getAccountDisplayName(hqAccount)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {currentMapping && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleMappingChange(account.id, '')}
                              title="Clear mapping"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {currentMapping && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

