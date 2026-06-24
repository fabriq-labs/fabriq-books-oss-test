import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

export type PlaidEnv = 'sandbox' | 'development' | 'production';

export function getPlaidEnv(): PlaidEnv {
  const env = (process.env.PLAID_ENV ?? 'sandbox') as PlaidEnv;
  if (env === 'sandbox' || env === 'development' || env === 'production') {
    return env;
  }
  return 'sandbox';
}

export function isPlaidConfigured(): boolean {
  return Boolean(
    process.env.PLAID_CLIENT_ID?.trim() &&
      process.env.PLAID_SECRET?.trim()
  );
}

let _client: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (!isPlaidConfigured()) {
    throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.');
  }
  if (!_client) {
    const config = new Configuration({
      basePath: PlaidEnvironments[getPlaidEnv()],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
          'PLAID-SECRET': process.env.PLAID_SECRET!,
        },
      },
    });
    _client = new PlaidApi(config);
  }
  return _client;
}

export const PLAID_PRODUCTS: Products[] = [Products.Transactions];
export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];
