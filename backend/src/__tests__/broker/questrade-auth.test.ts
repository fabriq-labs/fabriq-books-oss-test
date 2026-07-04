import axios from 'axios';
import {
  QuestradeAuth,
  __resetQuestradeRefreshLocksForTests,
} from '../../lib/integrations/broker/connectors/questrade/questrade_auth';
import { ReauthRequiredError } from '../../lib/integrations/broker/connectors/types';
import * as loader from '../../lib/integrations/broker/shared/broker-connection-loader';
import { QT_TOKEN_RESPONSE } from './fixtures/questrade-responses';

jest.mock('../../lib/integrations/broker/shared/broker-connection-loader');
const mockPersist = loader.persistBrokerOAuth as jest.MockedFunction<typeof loader.persistBrokerOAuth>;

describe('QuestradeAuth', () => {
  let axiosGetSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetQuestradeRefreshLocksForTests();
    mockPersist.mockResolvedValue(undefined);
    axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({ data: QT_TOKEN_RESPONSE, status: 200 });
  });

  afterEach(() => {
    axiosGetSpy.mockRestore();
    __resetQuestradeRefreshLocksForTests();
  });

  it('refreshes token and returns session on first ensureAuth', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    const session = await auth.ensureAuth();

    expect(session.accessToken).toBe(QT_TOKEN_RESPONSE.access_token);
    expect(session.apiServer).toBe(QT_TOKEN_RESPONSE.api_server);
    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
  });

  it('persists rotated refresh_token and access token cache after refresh', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'old_token' });
    await auth.ensureAuth();

    expect(mockPersist).toHaveBeenCalledWith('conn_1', expect.objectContaining({
      refresh_token: QT_TOKEN_RESPONSE.refresh_token,
      api_server: QT_TOKEN_RESPONSE.api_server,
      access_token: QT_TOKEN_RESPONSE.access_token,
      access_token_expires_at: expect.any(String),
    }));
  });

  it('returns cached session without calling token endpoint again', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    await auth.ensureAuth();
    await auth.ensureAuth();

    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
  });

  it('reuses persisted access token on a new auth instance without OAuth call', async () => {
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const auth = new QuestradeAuth('conn_1', {
      refresh_token: 'initial_token',
      api_server: QT_TOKEN_RESPONSE.api_server,
      access_token: 'cached_access_token',
      access_token_expires_at: expiresAt,
    });

    const session = await auth.ensureAuth();

    expect(session.accessToken).toBe('cached_access_token');
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });

  it('refreshes when persisted access token is expired', async () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const auth = new QuestradeAuth('conn_1', {
      refresh_token: 'initial_token',
      access_token: 'stale_access_token',
      access_token_expires_at: expiresAt,
    });

    await auth.ensureAuth();

    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent refresh for the same connection', async () => {
    let resolveToken!: (value: { data: typeof QT_TOKEN_RESPONSE; status: number }) => void;
    const tokenGate = new Promise<{ data: typeof QT_TOKEN_RESPONSE; status: number }>((resolve) => {
      resolveToken = resolve;
    });
    axiosGetSpy.mockReturnValue(tokenGate);

    const auth1 = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    const auth2 = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    const pending = Promise.all([auth1.ensureAuth(), auth2.ensureAuth()]);
    resolveToken({ data: QT_TOKEN_RESPONSE, status: 200 });
    await pending;

    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
  });

  it('throws ReauthRequiredError on invalid_grant (400)', async () => {
    axiosGetSpy.mockRejectedValue(Object.assign(new Error('invalid_grant'), {
      response: { status: 400, data: { error: 'invalid_grant' } },
    }));

    const auth = new QuestradeAuth('conn_1', { refresh_token: 'expired_token' });
    await expect(auth.ensureAuth()).rejects.toThrow(ReauthRequiredError);
  });

  it('throws ReauthRequiredError when constructed with no refresh_token', () => {
    expect(() => new QuestradeAuth('conn_1', { refresh_token: '' })).toThrow(ReauthRequiredError);
  });

  it('forceRefresh bypasses cache and re-calls token endpoint', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    await auth.ensureAuth();
    await auth.forceRefresh();

    expect(axiosGetSpy).toHaveBeenCalledTimes(2);
  });

  it('persists the new refresh_token BEFORE returning the session (order check)', async () => {
    const callOrder: string[] = [];
    mockPersist.mockImplementation(async () => { callOrder.push('persist'); });
    axiosGetSpy.mockImplementation(async () => {
      callOrder.push('tokenCall');
      return { data: QT_TOKEN_RESPONSE, status: 200 };
    });

    const auth = new QuestradeAuth('conn_1', { refresh_token: 'tok' });
    await auth.ensureAuth();

    expect(callOrder).toEqual(['tokenCall', 'persist']);
  });
});
