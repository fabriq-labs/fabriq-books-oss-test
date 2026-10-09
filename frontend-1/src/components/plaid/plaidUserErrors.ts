export interface PlaidUserError {
  title: string;
  message: string;
}

/** User-facing copy for Plaid item errors. The raw code and message stay on the API response. */
const PLAID_USER_ERRORS: Record<string, PlaidUserError> = {
  ITEM_LOGIN_REQUIRED: {
    title: 'Sign in again',
    message: 'Your bank needs you to sign in again before transactions can sync.',
  },
  PENDING_EXPIRATION: {
    title: 'Sign in again',
    message: 'Your bank login is about to expire. Sign in again to keep syncing transactions.',
  },
  PENDING_DISCONNECT: {
    title: 'Sign in again',
    message: 'This bank connection will stop working soon. Sign in again to keep it active.',
  },
  INVALID_CREDENTIALS: {
    title: 'Sign in again',
    message: 'The bank did not accept the login. Sign in again with your current username and password.',
  },
  INVALID_MFA: {
    title: 'Sign in again',
    message: 'The bank did not accept the verification code. Sign in again to continue.',
  },
  ITEM_LOCKED: {
    title: 'Bank login locked',
    message: 'The bank locked this login after too many attempts. Unlock it with your bank, then sign in again here.',
  },
  USER_SETUP_REQUIRED: {
    title: 'Finish bank setup',
    message: 'Your bank is asking you to finish setup on their site, then sign in again here.',
  },
  ACCESS_NOT_GRANTED: {
    title: 'Access not granted',
    message: 'The bank login did not share the accounts we need. Sign in again and allow access.',
  },
  NO_ACCOUNTS: {
    title: 'No accounts found',
    message: 'The bank login did not include any accounts we can sync. Sign in again and choose an account.',
  },
  INSTITUTION_DOWN: {
    title: 'Bank unavailable',
    message: 'Your bank is temporarily unavailable. Try again later, or sign in again if this continues.',
  },
  INSTITUTION_NOT_RESPONDING: {
    title: 'Bank unavailable',
    message: 'Your bank is not responding right now. Try again later, or sign in again if this continues.',
  },
  INSTITUTION_NO_LONGER_SUPPORTED: {
    title: 'Bank no longer supported',
    message: 'This bank connection is no longer supported. Disconnect it and connect the bank again.',
  },
  INSTITUTION_NOT_AVAILABLE: {
    title: 'Bank unavailable',
    message: 'This bank is not available for a connection right now. Try again later.',
  },
  INVALID_ACCESS_TOKEN: {
    title: 'Reconnect this bank',
    message: 'This connection is no longer valid. Sign in again to restore it.',
  },
  ITEM_NOT_FOUND: {
    title: 'Reconnect this bank',
    message: 'This connection could not be found at the bank. Sign in again to restore it.',
  },
  TOKEN_DECRYPT_FAILED: {
    title: 'Reconnect this bank',
    message: 'This connection could not be read. Sign in again to restore it.',
  },
};

const DEFAULT_USER_ERROR: PlaidUserError = {
  title: 'Bank connection needs attention',
  message: 'Reconnect this bank to keep syncing transactions.',
};

export function plaidUserError(errorCode: string | null | undefined): PlaidUserError {
  if (!errorCode) return DEFAULT_USER_ERROR;
  return PLAID_USER_ERRORS[errorCode] ?? DEFAULT_USER_ERROR;
}
