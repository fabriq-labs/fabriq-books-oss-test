import React, { useCallback } from 'react';
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { Button } from '@/components/ui/button';
import { Landmark } from 'lucide-react';

interface PlaidLinkButtonProps {
  linkToken: string | null;
  onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  disabled?: boolean;
}

export function PlaidLinkButton({ linkToken, onSuccess, disabled }: PlaidLinkButtonProps) {
  const handleSuccess = useCallback(
    (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      onSuccess(publicToken, metadata);
    },
    [onSuccess],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
  });

  return (
    <Button
      onClick={() => open()}
      disabled={disabled || !linkToken || !ready}
      className="gap-2"
    >
      <Landmark className="h-4 w-4" />
      Connect bank account
    </Button>
  );
}
