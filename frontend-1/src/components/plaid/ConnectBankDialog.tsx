import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { plaidAPI, PlaidInstitution, PlaidItem } from '@/api/plaidApi';
import { useToast } from '@/hooks/use-toast';
import { useEntity } from '@/contexts/EntityContext';
import { Building2, Landmark, Loader2, Search } from 'lucide-react';

interface ConnectBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: (item: PlaidItem) => void;
}

export function ConnectBankDialog({ open, onOpenChange, onConnected }: ConnectBankDialogProps) {
  const { toast } = useToast();
  const { currentEntityId } = useEntity();
  const [skipLinkUi, setSkipLinkUi] = useState(true);
  const [query, setQuery] = useState('');
  const [institutions, setInstitutions] = useState<PlaidInstitution[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [selected, setSelected] = useState<PlaidInstitution | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [pendingLinkOpen, setPendingLinkOpen] = useState(false);

  const reset = useCallback(() => {
    setQuery('');
    setSelected(null);
    setLinkToken(null);
    setPendingLinkOpen(false);
    setConnecting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    plaidAPI.getConfig().then((cfg) => setSkipLinkUi(cfg.skip_link_ui)).catch(() => setSkipLinkUi(false));
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setLoadingInstitutions(true);
      plaidAPI
        .searchInstitutions(query)
        .then((res) => setInstitutions(res.data ?? []))
        .catch((err: Error) => {
          setInstitutions([]);
          toast({
            title: 'Could not load banks',
            description: err.message,
            variant: 'destructive',
          });
        })
        .finally(() => setLoadingInstitutions(false));
    }, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query, toast]);

  const handlePlaidSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setConnecting(true);
      try {
        const res = await plaidAPI.exchangeToken(
          publicToken,
          { institution: metadata.institution },
          currentEntityId ?? undefined,
        );
        onOpenChange(false);
        onConnected(res.data);
      } catch (err: any) {
        toast({
          title: 'Connection failed',
          description: err.message ?? 'Could not complete bank link',
          variant: 'destructive',
        });
      } finally {
        setConnecting(false);
        setLinkToken(null);
        setPendingLinkOpen(false);
      }
    },
    [onConnected, onOpenChange, toast, currentEntityId],
  );

  const { open: openPlaidLink, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handlePlaidSuccess,
  });

  useEffect(() => {
    if (pendingLinkOpen && linkToken && ready) {
      openPlaidLink();
      setPendingLinkOpen(false);
    }
  }, [pendingLinkOpen, linkToken, ready, openPlaidLink]);

  const handleConnect = async () => {
    if (!selected) return;

    if (skipLinkUi) {
      setConnecting(true);
      try {
        const res = await plaidAPI.sandboxConnect(
          selected.institution_id,
          selected.name,
          currentEntityId ?? undefined,
        );
        onOpenChange(false);
        onConnected(res.data);
      } catch (err: any) {
        toast({
          title: 'Connection failed',
          description: err.message ?? 'Could not connect to bank',
          variant: 'destructive',
        });
      } finally {
        setConnecting(false);
      }
      return;
    }

    setConnecting(true);
    try {
      const res = await plaidAPI.createLinkToken(selected.institution_id);
      setLinkToken(res.link_token);
      setPendingLinkOpen(true);
    } catch (err: any) {
      toast({
        title: 'Could not start bank login',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Connect bank account
          </DialogTitle>
          <DialogDescription>
            {skipLinkUi
              ? 'Search for your bank and connect. You will choose which accounts to import in the next step.'
              : 'Search for your bank, then sign in securely. Account import happens in Fabriq after login.'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search banks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          {loadingInstitutions ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading banks…
            </div>
          ) : institutions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {query ? 'No banks match your search.' : 'No banks available.'}
            </p>
          ) : (
            <ul className="divide-y">
              {institutions.map((inst) => {
                const isSelected = selected?.institution_id === inst.institution_id;
                return (
                  <li key={inst.institution_id}>
                    <button
                      type="button"
                      onClick={() => setSelected(inst)}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
                        isSelected ? 'bg-muted' : ''
                      }`}
                    >
                      {inst.logo ? (
                        <img
                          src={`data:image/png;base64,${inst.logo}`}
                          alt=""
                          className="h-8 w-8 rounded-full object-contain"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-background">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-sm font-medium">{inst.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!skipLinkUi && (
          <p className="text-xs text-muted-foreground">
            Bank sign-in opens in a secure Plaid window. Fabriq handles account selection and
            import after that.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={connecting}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={!selected || connecting}>
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : skipLinkUi ? (
              'Connect'
            ) : (
              'Continue to bank login'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConnectBankButtonProps {
  onConnected: (item: PlaidItem) => void;
  disabled?: boolean;
}

export function ConnectBankButton({ onConnected, disabled }: ConnectBankButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled} className="gap-2">
        <Landmark className="h-4 w-4" />
        Connect bank account
      </Button>
      <ConnectBankDialog
        open={open}
        onOpenChange={setOpen}
        onConnected={onConnected}
      />
    </>
  );
}
