/**
 * MockQuestradeServer intercepts axios HTTP calls to the Questrade token
 * endpoint and the api_server resource URLs. Uses jest.spyOn on axios so no
 * extra packages are needed.
 *
 * Usage:
 *   const mock = new MockQuestradeServer();
 *   mock.install();          // before tests
 *   mock.uninstall();        // after tests
 *   mock.overridePositions('12345678', { positions: [] }); // per-test overrides
 */

import axios from 'axios';
import {
  QT_ACCOUNTS_RESPONSE,
  QT_ACTIVITIES_EMPTY,
  QT_ACTIVITIES_TFSA,
  QT_BALANCES_MARGIN,
  QT_BALANCES_RRSP,
  QT_BALANCES_TFSA,
  QT_POSITIONS_MARGIN,
  QT_POSITIONS_RRSP,
  QT_POSITIONS_TFSA,
  QT_TOKEN_RESPONSE,
} from './fixtures/questrade-responses';

const TOKEN_URL = 'https://login.questrade.com/oauth2/token';

export class MockQuestradeServer {
  private getSpy: jest.SpyInstance | null = null;
  private tokenResponses: Map<string, object> = new Map();
  private resourceOverrides: Map<string, object> = new Map();

  install() {
    this.getSpy = jest.spyOn(axios, 'get').mockImplementation(async (url: string, config?: any) => {
      const strUrl = String(url);

      // Token endpoint
      if (strUrl.startsWith(TOKEN_URL)) {
        const refreshToken = config?.params?.refresh_token ?? '';
        if (refreshToken === 'INVALID_TOKEN') {
          const err: any = new Error('invalid_grant');
          err.response = { status: 400, data: { error: 'invalid_grant' } };
          throw err;
        }
        return { data: QT_TOKEN_RESPONSE, status: 200 };
      }

      // Resource endpoints — url may be a path like 'v1/accounts' or full URL
      const path = strUrl.replace(/^https?:\/\/[^/]+\//, '');

      const override = this.resourceOverrides.get(path);
      if (override) {
        return { data: override, status: 200 };
      }

      if (path === 'v1/accounts') {
        return { data: QT_ACCOUNTS_RESPONSE, status: 200 };
      }

      const balanceMatch = path.match(/^v1\/accounts\/(\d+)\/balances$/);
      if (balanceMatch) {
        const acctId = balanceMatch[1];
        if (acctId === '12345678') return { data: QT_BALANCES_TFSA, status: 200 };
        if (acctId === '23456789') return { data: QT_BALANCES_RRSP, status: 200 };
        if (acctId === '34567890') return { data: QT_BALANCES_MARGIN, status: 200 };
      }

      const positionsMatch = path.match(/^v1\/accounts\/(\d+)\/positions$/);
      if (positionsMatch) {
        const acctId = positionsMatch[1];
        if (acctId === '12345678') return { data: QT_POSITIONS_TFSA, status: 200 };
        if (acctId === '23456789') return { data: QT_POSITIONS_RRSP, status: 200 };
        if (acctId === '34567890') return { data: QT_POSITIONS_MARGIN, status: 200 };
      }

      const activitiesMatch = path.match(/^v1\/accounts\/(\d+)\/activities$/);
      if (activitiesMatch) {
        const acctId = activitiesMatch[1];
        if (acctId === '12345678') return { data: QT_ACTIVITIES_TFSA, status: 200 };
        return { data: QT_ACTIVITIES_EMPTY, status: 200 };
      }

      throw new Error(`MockQuestradeServer: unhandled URL ${strUrl}`);
    });
  }

  uninstall() {
    this.getSpy?.mockRestore();
    this.getSpy = null;
    this.resourceOverrides.clear();
  }

  overridePath(path: string, response: object) {
    this.resourceOverrides.set(path, response);
  }

  overridePositions(accountId: string, response: object) {
    this.overridePath(`v1/accounts/${accountId}/positions`, response);
  }

  simulateMidSync401() {
    let callCount = 0;
    this.getSpy?.mockImplementation(async (url: string, config?: any) => {
      const strUrl = String(url);
      if (strUrl.startsWith(TOKEN_URL)) {
        return { data: QT_TOKEN_RESPONSE, status: 200 };
      }
      callCount++;
      if (callCount === 1) {
        const err: any = new Error('Unauthorized');
        err.response = { status: 401, data: {} };
        throw err;
      }
      return this.defaultResourceHandler(strUrl);
    });
  }

  private async defaultResourceHandler(strUrl: string) {
    const path = strUrl.replace(/^https?:\/\/[^/]+\//, '');
    if (path === 'v1/accounts') return { data: QT_ACCOUNTS_RESPONSE, status: 200 };
    throw new Error(`Unhandled: ${strUrl}`);
  }
}
