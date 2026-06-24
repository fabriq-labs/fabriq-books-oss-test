import React, { useEffect, useMemo, useState } from 'react';
import { PlaidAccount, PlaidItem } from '@/api/plaidApi';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onCancel?.();
  };

  if (!item) return null;

  const institutionName = item.institution_name ?? 'your bank';
  const initial = institutionName.charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0',
          step === 'map' ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        {step === 'select' ? (
          <>
            <DialogHeader className="border-b px-6 py-5 text-center sm:text-center">
              <div className="flex items-center justify-center gap-1.5 mb-4">
                <span className={plaidUi.progressDotActive} />
                <span className={plaidUi.progressDotInactive} />
              </div>
              <div className={`${plaidUi.institutionAvatar} mx-auto mb-3`}>{initial}</div>
              <DialogTitle>Your accounts</DialogTitle>
              <DialogDescription>
                Choose which <span className="font-medium text-foreground">{institutionName}</span>{' '}
                accounts to connect in Fabriq
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0">
              {allAccounts.length === 0 ? (
                <p className="px-6 py-10 text-sm text-center text-muted-foreground">
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
                          className={cn(
                            plaidUi.accountRow,
                            checked && plaidUi.accountRowSelected,
                            isImported ? 'opacity-60 cursor-default' : 'cursor-pointer',
                          )}
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
                            />
                          </span>
                          <div className={plaidUi.accountIcon}>
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className={plaidUi.accountName}>
                              {acct.name ?? 'Account'}
                              {acct.mask && (
                                <span className="text-muted-foreground font-normal">
                                  {' '}
                                  · {acct.mask}
                                </span>
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

            <DialogFooter className="border-t px-6 py-4 sm:justify-center flex-col gap-2">
              <p className="text-xs text-center text-muted-foreground w-full">
                {importableAccounts.length === 0
                  ? 'All accounts from this bank are already connected.'
                  : 'Check accounts to connect. Nothing is selected by default.'}
              </p>
              <Button
                className="w-full sm:w-auto"
                disabled={selectedIds.size === 0 || importableAccounts.length === 0}
                onClick={handleContinueToMap}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <PlaidAccountMappingStep
            item={item}
            selectedAccounts={selectedAccounts}
            onBack={() => setStep('select')}
            onComplete={onComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
