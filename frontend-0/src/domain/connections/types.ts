import type { SyncMode } from '@/api/metadataApi';

export type QboOAuthForm = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  realm_id: string;
  environment: 'sandbox' | 'production';
};

export const emptyQboOAuth: QboOAuthForm = {
  client_id: '',
  client_secret: '',
  refresh_token: '',
  realm_id: '',
  environment: 'sandbox',
};

export type SyncModeOption = {
  value: SyncMode;
  label: string;
  hint: string;
  /** Button text when this mode is selected. */
  actionLabel: string;
  /** Short past-tense label for the last run. */
  pastLabel: string;
  /** Toast title once the run is queued. */
  startedTitle: string;
  /** Pulls from QuickBooks, so it needs import settings on the connection. */
  needsImportSettings: boolean;
  advanced: boolean;
};

export const SYNC_MODE_OPTIONS: SyncModeOption[] = [
  {
    value: 'full_sync',
    label: 'Import now',
    hint: 'Pull the latest data from QuickBooks, then update Fabriq.',
    actionLabel: 'Import now',
    pastLabel: 'Full import',
    startedTitle: 'Import started',
    needsImportSettings: true,
    advanced: false,
  },
  {
    value: 'transform_only',
    label: 'Reprocess existing import',
    hint: 'Refresh Fabriq records from data that was already imported. Nothing new is pulled.',
    actionLabel: 'Reprocess import',
    pastLabel: 'Reprocessed',
    startedTitle: 'Reprocessing started',
    needsImportSettings: false,
    advanced: false,
  },
  {
    value: 'extract_only',
    label: 'Pull data only',
    hint: 'Pull the latest data from QuickBooks without updating Fabriq records yet.',
    actionLabel: 'Pull data',
    pastLabel: 'Data pulled only',
    startedTitle: 'Pull started',
    needsImportSettings: true,
    advanced: true,
  },
];

export const syncModeOption = (mode: string | null | undefined): SyncModeOption | undefined =>
  SYNC_MODE_OPTIONS.find((opt) => opt.value === mode);
