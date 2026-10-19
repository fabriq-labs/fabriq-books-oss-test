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

export const SYNC_MODE_OPTIONS = [
  {
    value: 'full_sync' as const,
    label: 'Full sync',
    hint: 'Airbyte extract + dbt transform',
  },
  {
    value: 'transform_only' as const,
    label: 'Transform only',
    hint: 'dbt only — use when datalake.qb_* already has data',
  },
  {
    value: 'extract_only' as const,
    label: 'Extract only',
    hint: 'Airbyte only — land raw tables, skip dbt',
  },
];
