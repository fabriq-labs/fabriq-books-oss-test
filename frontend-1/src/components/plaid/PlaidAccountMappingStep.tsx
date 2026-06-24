import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { plaidAPI, PlaidAccount, PlaidItem } from '@/api/plaidApi';
import { viewAPI } from '@/api/metadataApi';
import { Button } from '@/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, Building2, Check, Landmark, Plus } from 'lucide-react';
import { plaidUi } from './plaidUi';
import {
  CoaAccountOption,
  formatPlaidAccountLabel,
  isBankRelevantAccount,
  mapPlaidAccountToCoaDisplay,
  suggestFabriqAccount,
} from './plaidAccountMatch';

interface PlaidAccountMappingStepProps {
  item: PlaidItem;
  selectedAccounts: PlaidAccount[];
  onBack: () => void;
  onComplete: () => void;
}

type RowStatus = 'pending' | 'mapped';
type MappingMode = 'existing' | 'create';

interface MappingRow {
  plaidAccountId: string;
  selectedFabriqId: string;
  status: RowStatus;
  saving: boolean;
  mode: MappingMode;
  mappedVia: MappingMode | null;
}

function formatBalance(amount: number | null | undefined): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function accountSubtypeLabel(acct: PlaidAccount): string {
  return (acct.subtype ?? acct.type ?? 'account').replace(/_/g, ' ');
}

function linkedFabriqIds(item: PlaidItem): Set<string> {
  return new Set(
    item.accounts
      .map((a) => a.fabriq_account_id)
      .filter((id): id is string => Boolean(id)),
  );
}

function accountLabel(account: CoaAccountOption | undefined): string {
  if (!account) return 'Account';
  return account.name ?? account.code ?? account.id;
}

export function PlaidAccountMappingStep({
  item,
  selectedAccounts,
  onBack,
  onComplete,
}: PlaidAccountMappingStepProps) {
  const { toast } = useToast();
  const [coaAccounts, setCoaAccounts] = useState<CoaAccountOption[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(() => linkedFabriqIds(item));
  const [rows, setRows] = useState<MappingRow[]>([]);

  const loadCoaAccounts = useCallback(async () => {
    try {
      const res = await viewAPI.search('account', 'account_view', 1, 500);
      setCoaAccounts((res as { data?: CoaAccountOption[] })?.data ?? []);
    } catch {
      setCoaAccounts([]);
    }
  }, []);

  useEffect(() => {
    loadCoaAccounts();
  }, [loadCoaAccounts]);

  const selectableCoaAccounts = useMemo(() => {
    const bankRelevant = coaAccounts.filter(isBankRelevantAccount);
    const pool = bankRelevant.length > 0 ? bankRelevant : coaAccounts;
    return pool.filter((a) => !linkedIds.has(a.id));
  }, [coaAccounts, linkedIds]);

  const coaOptionsForRow = (row: MappingRow) => {
    if (!row.selectedFabriqId) return selectableCoaAccounts;
    const selected = coaAccounts.find((a) => a.id === row.selectedFabriqId);
    if (!selected || selectableCoaAccounts.some((a) => a.id === row.selectedFabriqId)) {
      return selectableCoaAccounts;
    }
    return [...selectableCoaAccounts, selected];
  };

  useEffect(() => {
    if (coaAccounts.length === 0) return;

    const pool = coaAccounts.filter((a) => !linkedIds.has(a.id));
    const bankRelevant = pool.filter(isBankRelevantAccount);
    const selectable = bankRelevant.length > 0 ? bankRelevant : pool;

    setRows((prev) => {
      if (prev.length > 0) {
        return prev.map((row) => {
          if (row.status === 'mapped' || row.selectedFabriqId) return row;
          const acct = selectedAccounts.find((a) => a.plaid_account_id === row.plaidAccountId);
          if (!acct) return row;
          const suggested = suggestFabriqAccount(acct.name, acct.mask, selectable);
          return { ...row, selectedFabriqId: suggested ?? '' };
        });
      }

      return selectedAccounts.map((acct) => {
        const suggested = suggestFabriqAccount(acct.name, acct.mask, selectable);
        return {
          plaidAccountId: acct.plaid_account_id,
          selectedFabriqId: suggested ?? '',
          status: 'pending' as RowStatus,
          saving: false,
          mode: 'existing' as MappingMode,
          mappedVia: null,
        };
      });
    });
  }, [coaAccounts, selectedAccounts, linkedIds]);

  const plaidById = useMemo(
    () => new Map(selectedAccounts.map((a) => [a.plaid_account_id, a])),
    [selectedAccounts],
  );

  const coaById = useMemo(
    () => new Map(coaAccounts.map((a) => [a.id, a])),
    [coaAccounts],
  );

  const updateRow = (plaidAccountId: string, patch: Partial<MappingRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.plaidAccountId === plaidAccountId ? { ...r, ...patch } : r)),
    );
  };

  const handleApprove = async (plaidAccountId: string) => {
    const row = rows.find((r) => r.plaidAccountId === plaidAccountId);
    if (!row?.selectedFabriqId) {
      toast({
        title: 'Select an account',
        description: 'Choose an existing Fabriq account to map on the right.',
        variant: 'destructive',
      });
      return;
    }

    updateRow(plaidAccountId, { saving: true });
    try {
      const result = await plaidAPI.linkAccount(item.id, plaidAccountId, row.selectedFabriqId);
      setLinkedIds((prev) => new Set(prev).add(result.data.fabriq_account_id));
      updateRow(plaidAccountId, {
        status: 'mapped',
        saving: false,
        mappedVia: 'existing',
        selectedFabriqId: result.data.fabriq_account_id,
      });
      toast({ title: 'Account mapped', description: 'Plaid account linked to existing Fabriq account.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not link account';
      toast({ title: 'Mapping failed', description: message, variant: 'destructive' });
      updateRow(plaidAccountId, { saving: false });
    }
  };

  const handleCreateAndLink = async (plaidAccountId: string) => {
    updateRow(plaidAccountId, { saving: true });
    try {
      const result = await plaidAPI.importAccounts(item.id, [plaidAccountId]);
      const mapped = result.data.accounts.find((a) => a.plaid_account_id === plaidAccountId);
      const fabriqId = mapped?.fabriq_account_id ?? result.data.account_ids[0];
      if (!fabriqId) {
        throw new Error('Account was not created');
      }

      await loadCoaAccounts();
      setLinkedIds((prev) => new Set(prev).add(fabriqId));
      updateRow(plaidAccountId, {
        status: 'mapped',
        saving: false,
        mappedVia: 'create',
        selectedFabriqId: fabriqId,
      });
      toast({ title: 'Account created', description: 'New Fabriq account created from this Plaid account.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create account';
      toast({ title: 'Create failed', description: message, variant: 'destructive' });
      updateRow(plaidAccountId, { saving: false });
    }
  };

  const allMapped = rows.length > 0 && rows.every((r) => r.status === 'mapped');
  const institutionName = item.institution_name ?? 'your bank';
  const initial = institutionName.charAt(0).toUpperCase();

  return (
    <>
      <DialogHeader className="border-b px-6 py-5 text-center sm:text-center">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          <span className={plaidUi.progressDotActive} />
          <span className={plaidUi.progressDotActive} />
        </div>
        <div className={`${plaidUi.institutionAvatar} mx-auto mb-3`}>{initial}</div>
        <DialogTitle>Map accounts</DialogTitle>
        <DialogDescription>
          Bank accounts on the left map to Fabriq accounts on the right
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-3 px-5 py-3 border-b bg-muted/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Plaid account
          </p>
          <span className="w-5" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Fabriq account
          </p>
        </div>

        <ul className={plaidUi.listDivide}>
          {rows.map((row) => {
            const acct = plaidById.get(row.plaidAccountId);
            if (!acct) return null;

            const balance = formatBalance(acct.balance);
            const isMapped = row.status === 'mapped';
            const coaDisplay = mapPlaidAccountToCoaDisplay(acct.type, acct.subtype);
            const mappedAccount = coaById.get(row.selectedFabriqId);
            const selectedAccount =
              row.status === 'mapped' ? mappedAccount : coaById.get(row.selectedFabriqId);
            const plaidLabel = formatPlaidAccountLabel(acct.name, acct.mask);

            return (
              <li key={row.plaidAccountId} className="px-5 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 sm:items-stretch">
                  {/* Left — Plaid account */}
                  <div className="min-w-0 flex flex-col">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2 sm:hidden">
                      Plaid account
                    </p>
                    <div className={plaidUi.panelBox}>
                      <div className={plaidUi.accountIcon}>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={plaidUi.accountName}>
                          {acct.name ?? 'Account'}
                          {acct.mask && (
                            <span className="text-muted-foreground font-normal"> · {acct.mask}</span>
                          )}
                        </p>
                        <p className={plaidUi.accountMeta}>{accountSubtypeLabel(acct)}</p>
                        {balance && <p className={`${plaidUi.balance} mt-1 text-sm`}>{balance}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center justify-center self-center text-muted-foreground/50">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <div className="flex sm:hidden items-center justify-center text-muted-foreground/50 py-1">
                    <ArrowRight className="h-4 w-4 rotate-90" />
                  </div>

                  {/* Right — Fabriq account */}
                  <div className="min-w-0 flex flex-col gap-2">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0 sm:hidden">
                      Fabriq account
                    </p>

                    {isMapped ? (
                      <div className={plaidUi.mappedBox}>
                        <div className={plaidUi.accountIcon}>
                          <Landmark className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={plaidUi.accountName}>
                            {accountLabel(mappedAccount) || plaidLabel}
                          </p>
                          <p className={plaidUi.accountMeta}>
                            {mappedAccount?.code && <span>{mappedAccount.code} · </span>}
                            {row.mappedVia === 'create' ? 'New account' : 'Existing account'}
                          </p>
                          <Badge variant="secondary" className="mt-2 gap-1">
                            <Check className="h-3 w-3" />
                            Mapped
                          </Badge>
                        </div>
                      </div>
                    ) : row.mode === 'existing' ? (
                      <>
                        <div className={plaidUi.panelBox}>
                          <div className={plaidUi.accountIcon}>
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <Select
                              value={row.selectedFabriqId || undefined}
                              disabled={row.saving}
                              onValueChange={(val) =>
                                updateRow(row.plaidAccountId, { selectedFabriqId: val })
                              }
                            >
                              <SelectTrigger className="w-full h-8 border-0 bg-transparent p-0 shadow-none focus:ring-0 text-sm font-medium">
                                <SelectValue placeholder="Select Fabriq account" />
                              </SelectTrigger>
                              <SelectContent>
                                {coaOptionsForRow(row).map((fa) => (
                                  <SelectItem key={fa.id} value={fa.id}>
                                    {fa.name ?? fa.code ?? fa.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedAccount && (
                              <p className={plaidUi.accountMeta}>
                                {selectedAccount.code ?? selectedAccount.classification ?? '—'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={row.saving}
                            onClick={() => handleApprove(row.plaidAccountId)}
                          >
                            {row.saving ? 'Approving…' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={row.saving}
                            onClick={() => updateRow(row.plaidAccountId, { mode: 'create' })}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Create new
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={plaidUi.panelBox}>
                          <div className={plaidUi.accountIcon}>
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={plaidUi.accountName}>{plaidLabel}</p>
                            <p className={plaidUi.accountMeta}>
                              {coaDisplay.classification} · {coaDisplay.types.join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={row.saving}
                            onClick={() => handleCreateAndLink(row.plaidAccountId)}
                          >
                            {row.saving ? 'Creating…' : 'Create and link'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={row.saving}
                            onClick={() => updateRow(row.plaidAccountId, { mode: 'existing' })}
                          >
                            Use existing
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <DialogFooter className="border-t px-6 py-4 gap-2 sm:gap-0">
        <Button variant="outline" className="flex-1 sm:flex-none" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1 sm:flex-none" disabled={!allMapped} onClick={onComplete}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
