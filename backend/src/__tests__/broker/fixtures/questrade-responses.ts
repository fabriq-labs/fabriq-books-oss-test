/** Raw Questrade API response fixtures — match the actual Questrade REST API shape. */

export const QT_ACCOUNTS_RESPONSE = {
  accounts: [
    { number: '12345678', type: 'TFSA', status: 'Active', clientAccountType: 'Individual' },
    { number: '23456789', type: 'RRSP', status: 'Active', clientAccountType: 'Individual' },
    { number: '34567890', type: 'Margin', status: 'Active', clientAccountType: 'Individual' },
  ],
};

export const QT_BALANCES_TFSA = {
  perCurrencyBalances: [
    { currency: 'CAD', cash: 5000.0, marketValue: 36200.1, totalEquity: 41200.1 },
  ],
  combinedBalances: [{ currency: 'CAD', cash: 5000.0, marketValue: 36200.1, totalEquity: 41200.1 }],
};

export const QT_BALANCES_RRSP = {
  perCurrencyBalances: [
    { currency: 'CAD', cash: 2000.0, marketValue: 86000.0, totalEquity: 88000.0 },
  ],
  combinedBalances: [{ currency: 'CAD', cash: 2000.0, marketValue: 86000.0, totalEquity: 88000.0 }],
};

export const QT_BALANCES_MARGIN = {
  perCurrencyBalances: [
    { currency: 'CAD', cash: 1000.0, marketValue: 10000.0, totalEquity: 11000.0 },
    { currency: 'USD', cash: 500.0, marketValue: 8500.0, totalEquity: 9000.0 },
  ],
  combinedBalances: [{ currency: 'CAD', cash: 2500.0, marketValue: 21700.0, totalEquity: 24200.0 }],
};

export const QT_POSITIONS_TFSA = {
  positions: [
    {
      symbol: 'VFV.TO',
      symbolId: 1001,
      openQuantity: 100,
      currentPrice: 128.4,
      currentMarketValue: 12840.0,
      averageEntryPrice: 110.2,
      openPnl: 1820.0,
      closedPnl: 0,
    },
    {
      symbol: 'XEQT.TO',
      symbolId: 1002,
      openQuantity: 200,
      currentPrice: 32.5,
      currentMarketValue: 6500.0,
      averageEntryPrice: 30.0,
      openPnl: 500.0,
      closedPnl: 0,
    },
  ],
};

export const QT_POSITIONS_RRSP = {
  positions: [
    {
      symbol: 'XIC.TO',
      symbolId: 1003,
      openQuantity: 500,
      currentPrice: 35.0,
      currentMarketValue: 17500.0,
      averageEntryPrice: 33.0,
      openPnl: 1000.0,
      closedPnl: 0,
    },
  ],
};

export const QT_POSITIONS_MARGIN = {
  positions: [
    {
      symbol: 'AAPL',
      symbolId: 2001,
      openQuantity: 50,
      currentPrice: 185.0,
      currentMarketValue: 9250.0,
      averageEntryPrice: 165.0,
      openPnl: 1000.0,
      closedPnl: 0,
    },
  ],
};

export const QT_ACTIVITIES_TFSA = {
  activities: [
    {
      tradeDate: '2026-05-01T00:00:00.000000-05:00',
      action: 'Buy',
      symbol: 'VFV.TO',
      symbolId: 1001,
      quantity: 10,
      price: 108.5,
      grossAmount: -1085.0,
      commission: -4.99,
      netAmount: -1089.99,
      currency: 'CAD',
      type: 'Trades',
      description: 'Buy 10 VFV.TO',
    },
    {
      tradeDate: '2026-05-15T00:00:00.000000-05:00',
      action: 'Buy',
      symbol: 'XEQT.TO',
      symbolId: 1002,
      quantity: 50,
      price: 30.0,
      grossAmount: -1500.0,
      commission: -4.99,
      netAmount: -1504.99,
      currency: 'CAD',
      type: 'Trades',
      description: 'Buy 50 XEQT.TO',
    },
    {
      tradeDate: '2026-06-01T00:00:00.000000-05:00',
      action: 'Dividends',
      symbol: 'VFV.TO',
      symbolId: 1001,
      quantity: 0,
      price: 0,
      grossAmount: 45.0,
      commission: 0,
      netAmount: 45.0,
      currency: 'CAD',
      type: 'Dividends',
      description: 'Dividends VFV.TO',
    },
  ],
};

export const QT_ACTIVITIES_EMPTY = { activities: [] };

export const QT_TOKEN_RESPONSE = {
  access_token: 'mock_access_token_abc123',
  refresh_token: 'mock_refresh_token_xyz789',
  api_server: 'https://api01.iq.questrade.com/',
  expires_in: 1800,
  token_type: 'Bearer',
};
