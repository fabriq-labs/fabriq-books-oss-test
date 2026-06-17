import axios from 'axios';
import { QuestradeAuth } from '../../lib/integrations/broker/connectors/questrade/questrade_auth';
import { ReauthRequiredError } from '../../lib/integrations/broker/connectors/types';
import * as loader from '../../lib/integrations/broker/shared/broker-connection-loader';
import { QT_TOKEN_RESPONSE } from './fixtures/questrade-responses';

jest.mock('../../lib/integrations/broker/shared/broker-connection-loader');
const mockPersist = loader.persistBrokerOAuth as jest.MockedFunction<typeof loader.persistBrokerOAuth>;

describe('QuestradeAuth', () => {
  let axiosGetSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPersist.mockResolvedValue(undefined);
    axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({ data: QT_TOKEN_RESPONSE, status: 200 });
  });

  afterEach(() => {
    axiosGetSpy.mockRestore();
  });

  it('refreshes token and returns session on first ensureAuth', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    const session = await auth.ensureAuth();

    expect(session.accessToken).toBe(QT_TOKEN_RESPONSE.access_token);
    expect(session.apiServer).toBe(QT_TOKEN_RESPONSE.api_server);
    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
  });

  it('persists the rotated refresh_token immediately after refresh', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'old_token' });
    await auth.ensureAuth();

    expect(mockPersist).toHaveBeenCalledWith('conn_1', expect.objectContaining({
      refresh_token: QT_TOKEN_RESPONSE.refresh_token,
      api_server: QT_TOKEN_RESPONSE.api_server,
    }));
  });

  it('returns cached session without calling token endpoint again', async () => {
    const auth = new QuestradeAuth('conn_1', { refresh_token: 'initial_token' });
    await auth.ensureAuth();
    await auth.ensureAuth();

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
