import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlaidAccount, PlaidItem } from '@/api/plaidApi';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Building2, X } from 'lucide-react';
import { plaidUi } from './plaidUi';
import { PlaidAccountMappingStep } from './PlaidAccountMappingStep';

interface PlaidAccountSelectPanelProps {
  open: boolean;
  item: PlaidItem | null;
  onComplete: () => void;
  onCancel?: () => void;
}

type Step = 'select' | 'map';

function formatBalance(amount: number | null | undefined): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function accountSubtypeLabel(acct: PlaidAccount): string {
  return (acct.subtype ?? acct.type ?? 'account').replace(/_/g, ' ');
}

/**
 * Fabriq-owned two-step flow: select Plaid accounts, then map each to Fabriq CoA.
 */
export function PlaidAccountSelectPanel({
  open,
  item,
  onComplete,
  onCancel,
}: PlaidAccountSelectPanelProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const allAccounts = item?.accounts ?? [];
  const importableAccounts = useMemo(
    () => allAccounts.filter((a) => !a.fabriq_account_id),
    [allAccounts],
  );

  const selectedAccounts = useMemo(
    () => allAccounts.filter((a) => selectedIds.has(a.plaid_account_id)),
    [allAccounts, selectedIds],
  );

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setStep('select');
    }
  }, [open]);

  const toggleAccount = (plaidAccountId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(plaidAccountId);
      else next.delete(plaidAccountId);
      return next;
    });
  };

  const handleContinueToMap = () => {
    if (!item) return;
    if (selectedIds.size === 0) {
      toast({
        title: 'Select accounts',
        description: 'Check at least one account to continue.',
        variant: 'destructive',
      });
      return;
    }
    setStep('map');
  };

  if (!open || !item) return null;

  const institutionName = item.institution_name ?? 'your bank';
  const initial = institutionName.charAt(0).toUpperCase();
  const modalClass = step === 'map' ? plaidUi.modalWide : plaidUi.modal;

  return createPortal(
    <div className={plaidUi.overlay}>
      <div
        className={`${modalClass} animate-in fade-in zoom-in-95 duration-200`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plaid-account-select-title"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {step === 'select' ? (
          <>
            <div className="px-6 pt-8 pb-4 text-center border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-center gap-1.5 mb-6">
                <span className={plaidUi.progressDotActive} />
                <span className={plaidUi.progressDotInactive} />
              </div>
              <div className={plaidUi.institutionBadge}>{initial}</div>
              <h2 id="plaid-account-select-title" className={plaidUi.title}>
                Your accounts
              </h2>
              <p className={`mt-2 ${plaidUi.subtitle} px-2`}>
                Choose which{' '}
                <span className="font-medium text-slate-700">{institutionName}</span> accounts to
                add to Fabriq
              </p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {allAccounts.length === 0 ? (
                <p className="px-6 py-10 text-sm text-center text-slate-500">
                  No accounts returned from this bank.
                </p>
              ) : (
                <ul className={plaidUi.listDivide}>
                  {allAccounts.map((acct) => {
                    const isImported = Boolean(acct.fabriq_account_id);
                    const checked = isImported || selectedIds.has(acct.plaid_account_id);
                    const balance = formatBalance(acct.balance);
                    return (
                      <li key={acct.plaid_account_id}>
                        <div
                          role={isImported ? undefined : 'button'}
                          tabIndex={isImported ? undefined : 0}
                          onClick={() =>
                            !isImported && toggleAccount(acct.plaid_account_id, !checked)
                          }
                          onKeyDown={(e) => {
                            if (!isImported && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              toggleAccount(acct.plaid_account_id, !checked);
                            }
                          }}
                          className={`${plaidUi.accountRow} ${checked ? plaidUi.accountRowSelected : ''} ${
                            isImported ? 'opacity-60 cursor-default' : 'cursor-pointer'
                          }`}
                        >
                          <span
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={isImported}
                              onCheckedChange={(v) =>
                                !isImported && toggleAccount(acct.plaid_account_id, v === true)
                              }
                              className="h-[18px] w-[18px] rounded border-slate-300 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900"
                            />
                          </span>
                          <div className={plaidUi.accountIcon}>
                            <Building2 className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className={plaidUi.accountName}>
                              {acct.name ?? 'Account'}
                              {acct.mask && (
                                <span className="text-slate-500 font-normal"> · {acct.mask}</span>
                              )}
                            </p>
                            <p className={plaidUi.accountMeta}>
                              {accountSubtypeLabel(acct)}
                              {isImported && <span> · connected</span>}
                            </p>
                          </div>
                          {balance && <span className={plaidUi.balance}>{balance}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="shrink-0 px-6 py-5 border-t border-slate-100 bg-white">
              <p className="text-[11px] text-center text-slate-400 leading-relaxed mb-4">
                {importableAccounts.length === 0
                  ? 'All accounts from this bank are already connected.'
                  : 'Check accounts to connect. Nothing is selected by default.'}
              </p>
              <Button
                className={plaidUi.primaryBtn}
                disabled={selectedIds.size === 0 || importableAccounts.length === 0}
                onClick={handleContinueToMap}
              >
                Continue
              </Button>
            </div>

            <div className={plaidUi.footer}>
              <p className={plaidUi.footerText}>Fabriq · select accounts to connect</p>
            </div>
          </>
        ) : (
          <PlaidAccountMappingStep
            item={item}
            selectedAccounts={selectedAccounts}
            onBack={() => setStep('select')}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
