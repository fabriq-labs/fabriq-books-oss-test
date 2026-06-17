import { mapAccount, mapBalance, mapPosition, mapActivity } from '../../lib/integrations/broker/connectors/questrade/questrade_mappers';
import {
  QT_ACCOUNTS_RESPONSE,
  QT_BALANCES_TFSA,
  QT_POSITIONS_TFSA,
  QT_ACTIVITIES_TFSA,
} from './fixtures/questrade-responses';

describe('questrade_mappers', () => {
  describe('mapAccount', () => {
    it('maps number → externalId and composes name', () => {
      const dto = mapAccount(QT_ACCOUNTS_RESPONSE.accounts[0]);
      expect(dto.externalId).toBe('12345678');
      expect(dto.type).toBe('TFSA');
      expect(dto.name).toContain('12345678');
    });
  });

  describe('mapBalance', () => {
    it('maps CAD balance fields correctly', () => {
      const dto = mapBalance(QT_BALANCES_TFSA.perCurrencyBalances[0]);
      expect(dto.currencyCode).toBe('CAD');
      expect(dto.cash).toBe(5000.0);
      expect(dto.marketValue).toBe(36200.1);
      expect(dto.totalEquity).toBe(41200.1);
    });
  });

  describe('mapPosition', () => {
    it('maps VFV.TO position to BrokerPositionDTO', () => {
      const dto = mapPosition(QT_POSITIONS_TFSA.positions[0]);
      expect(dto.instrument.symbol).toBe('VFV.TO');
      expect(dto.quantity).toBe(100);
      expect(dto.averageCost).toBe(110.2);
      expect(dto.currentPrice).toBe(128.4);
      expect(dto.marketValue).toBe(12840.0);
      expect(dto.unrealizedPnl).toBe(1820.0);
    });

    it('defaults instrument type to STOCK for unknown security types', () => {
      const dto = mapPosition({ ...QT_POSITIONS_TFSA.positions[0], securityType: 'WeirdType' });
      expect(dto.instrument.type).toBe('STOCK');
    });

    it('maps ETF security type correctly', () => {
      const dto = mapPosition({ ...QT_POSITIONS_TFSA.positions[0], securityType: 'ETF' });
      expect(dto.instrument.type).toBe('ETF');
    });
  });

  describe('mapActivity', () => {
    const accountId = '12345678';

    it('maps a Buy activity to BrokerTradeDTO with type BUY', () => {
      const dto = mapActivity(accountId, QT_ACTIVITIES_TFSA.activities[0]);
      expect(dto).not.toBeNull();
      expect(dto!.type).toBe('BUY');
      expect(dto!.instrument?.symbol).toBe('VFV.TO');
      expect(dto!.quantity).toBe(10);
      expect(dto!.price).toBe(108.5);
      expect(dto!.brokerage).toBe(4.99);
    });

    it('maps a Dividends activity to BrokerTradeDTO with type DIVIDEND', () => {
      const dto = mapActivity(accountId, QT_ACTIVITIES_TFSA.activities[2]);
      expect(dto).not.toBeNull();
      expect(dto!.type).toBe('DIVIDEND');
    });

    it('produces a stable deterministic tradeId across two calls with same data', () => {
      const activity = QT_ACTIVITIES_TFSA.activities[0];
      const dto1 = mapActivity(accountId, activity);
      const dto2 = mapActivity(accountId, activity);
      expect(dto1!.tradeId).toBe(dto2!.tradeId);
    });

    it('produces different tradeIds for different activities', () => {
      const dto1 = mapActivity(accountId, QT_ACTIVITIES_TFSA.activities[0]);
      const dto2 = mapActivity(accountId, QT_ACTIVITIES_TFSA.activities[1]);
      expect(dto1!.tradeId).not.toBe(dto2!.tradeId);
    });

    it('returns null for activities with no action or price (non-trade entries)', () => {
      const dto = mapActivity(accountId, {
        tradeDate: '2026-06-01T00:00:00.000000-05:00',
        type: 'Other',
        action: '',
        quantity: 0,
        price: 0,
        netAmount: 0,
      });
      expect(dto).toBeNull();
    });
  });
});
