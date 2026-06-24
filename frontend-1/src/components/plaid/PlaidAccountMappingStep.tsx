import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { plaidAPI, PlaidAccount, PlaidItem } from '@/api/plaidApi';
import { viewAPI } from '@/api/metadataApi';
import { Button } from '@/components/ui/button';
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
      <div className="px-6 pt-8 pb-4 text-center border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-center gap-1.5 mb-6">
          <span className={plaidUi.progressDotActive} />
          <span className={plaidUi.progressDotActive} />
        </div>
        <div className={plaidUi.institutionBadge}>{initial}</div>
        <h2 className={plaidUi.title}>Map accounts</h2>
        <p className={`mt-2 ${plaidUi.subtitle} px-2`}>
          Bank accounts on the left map to Fabriq accounts on the right
        </p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/80">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Plaid account</p>
          <span className="w-5" />
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Fabriq account</p>
        </div>

        <ul className={plaidUi.listDivide}>
          {rows.map((row) => {
            const acct = plaidById.get(row.plaidAccountId);
            if (!acct) return null;

            const balance = formatBalance(acct.balance);
            const isMapped = row.status === 'mapped';
            const coaDisplay = mapPlaidAccountToCoaDisplay(acct.type, acct.subtype);
            const mappedAccount = coaById.get(row.selectedFabriqId);
            const plaidLabel = formatPlaidAccountLabel(acct.name, acct.mask);

            return (
              <li key={row.plaidAccountId} className="px-5 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 sm:items-start">
                  {/* Left — Plaid account */}
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-2 sm:hidden">
                      Plaid account
                    </p>
                    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                      <div className={plaidUi.accountIcon}>
                        <Building2 className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={plaidUi.accountName}>
                          {acct.name ?? 'Account'}
                          {acct.mask && (
                            <span className="text-slate-500 font-normal"> · {acct.mask}</span>
                          )}
                        </p>
                        <p className={plaidUi.accountMeta}>{accountSubtypeLabel(acct)}</p>
                        {balance && <p className={`${plaidUi.balance} mt-1 text-sm`}>{balance}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex items-center justify-center pt-8 text-slate-300">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <div className="flex sm:hidden items-center justify-center text-slate-300 py-1">
                    <ArrowRight className="h-4 w-4 rotate-90" />
                  </div>

                  {/* Right — Fabriq account */}
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-2 sm:hidden">
                      Fabriq account
                    </p>

                    {isMapped ? (
                      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                        <div className={plaidUi.accountIcon}>
                          <Landmark className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={plaidUi.accountName}>
                            {accountLabel(mappedAccount) || plaidLabel}
                          </p>
                          <p className={plaidUi.accountMeta}>
                            {mappedAccount?.code && <span>{mappedAccount.code} · </span>}
                            {row.mappedVia === 'create' ? 'New account' : 'Existing account'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-2 text-sm text-emerald-700">
                            <Check className="h-4 w-4 shrink-0" />
                            Mapped
                          </div>
                        </div>
                      </div>
                    ) : row.mode === 'existing' ? (
                      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Map to an existing Fabriq account</p>
                        <Select
                          value={row.selectedFabriqId || undefined}
                          disabled={row.saving}
                          onValueChange={(val) =>
                            updateRow(row.plaidAccountId, { selectedFabriqId: val })
                          }
                        >
                          <SelectTrigger className="w-full h-9 border-slate-200 bg-white">
                            <SelectValue placeholder="Select existing account" />
                          </SelectTrigger>
                          <SelectContent>
                            {coaOptionsForRow(row).map((fa) => (
                              <SelectItem key={fa.id} value={fa.id}>
                                {fa.name ?? fa.code ?? fa.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8 rounded-lg px-3 bg-[#111111] hover:bg-black text-white"
                            disabled={row.saving}
                            onClick={() => handleApprove(row.plaidAccountId)}
                          >
                            {row.saving ? 'Approving…' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg px-3 border-slate-200"
                            disabled={row.saving}
                            onClick={() => updateRow(row.plaidAccountId, { mode: 'create' })}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Create new
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Create a new Fabriq account from this Plaid account</p>
                        <div className="rounded-md border border-slate-100 bg-white px-3 py-2">
                          <p className="text-sm font-medium text-slate-900">{plaidLabel}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {coaDisplay.classification} · {coaDisplay.types.join(', ')}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8 rounded-lg px-3 bg-[#111111] hover:bg-black text-white"
                            disabled={row.saving}
                            onClick={() => handleCreateAndLink(row.plaidAccountId)}
                          >
                            {row.saving ? 'Creating…' : 'Create and link'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg px-3 border-slate-200"
                            disabled={row.saving}
                            onClick={() => updateRow(row.plaidAccountId, { mode: 'existing' })}
                          >
                            Use existing
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 px-6 py-5 border-t border-slate-100 bg-white flex gap-3">
        <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={onBack}>
          Back
        </Button>
        <Button
          className={`${plaidUi.primaryBtn} flex-1`}
          disabled={!allMapped}
          onClick={onComplete}
        >
          Done
        </Button>
      </div>

      <div className={plaidUi.footer}>
        <p className={plaidUi.footerText}>Fabriq · map Plaid accounts to Fabriq accounts</p>
      </div>
    </>
  );
}
