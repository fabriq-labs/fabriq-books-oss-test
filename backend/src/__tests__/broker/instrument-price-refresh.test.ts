import { enrichOptionUnderlyings } from '../../lib/integrations/broker/sync/instrument_price_refresh';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    instrument: {
      update: jest.fn(),
    },
  },
}));

jest.mock('../../lib/integrations/broker/sync/upserts', () => ({
  upsertInstrument: jest.fn(),
}));

import prisma from '../../lib/prisma';
import { upsertInstrument } from '../../lib/integrations/broker/sync/upserts';

describe('enrichOptionUnderlyings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets underlying external_symbol_id even when link already exists', async () => {
    const connector = {
      getSymbol: jest.fn().mockResolvedValue({
        symbolId: 75130119,
        symbol: 'NVDA10Jul26P175.00',
        underlyingSymbol: 'NVDA',
        underlyingSymbolId: 8049,
        currencyCode: 'USD',
      }),
      searchSymbol: jest.fn(),
    };

    (upsertInstrument as jest.Mock).mockResolvedValue('inst_nvda');
    (prisma.instrument.update as jest.Mock).mockResolvedValue({});

    await enrichOptionUnderlyings(connector, [
      {
        instrumentId: 'inst_option',
        externalSymbolId: 75130119,
        optionSymbol: 'NVDA10Jul26P175.00',
        currencyCode: 'USD',
      },
    ]);

    expect(connector.getSymbol).toHaveBeenCalledWith(75130119);
    expect(upsertInstrument).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'NVDA',
        externalSymbolId: 8049,
      }),
      { externalSymbolId: 8049 }
    );
    expect(prisma.instrument.update).toHaveBeenCalledWith({
      where: { id: 'inst_nvda' },
      data: { external_symbol_id: 8049 },
    });
    expect(prisma.instrument.update).toHaveBeenCalledWith({
      where: { id: 'inst_option' },
      data: { underlying_instrument_id: 'inst_nvda' },
    });
  });

  it('falls back to searchSymbol when getSymbol has no underlyingSymbolId', async () => {
    const connector = {
      getSymbol: jest.fn().mockResolvedValue({
        symbolId: 75848587,
        symbol: 'SPCX25Jun26C25.00',
        underlyingSymbol: 'SPCX',
      }),
      searchSymbol: jest.fn().mockResolvedValue({
        symbolId: 12345,
        symbol: 'SPCX',
        name: 'SPCX',
        currencyCode: 'USD',
      }),
    };

    (upsertInstrument as jest.Mock).mockResolvedValue('inst_spcx');
    (prisma.instrument.update as jest.Mock).mockResolvedValue({});

    await enrichOptionUnderlyings(connector, [
      {
        instrumentId: 'inst_option_spcx',
        externalSymbolId: 75848587,
        optionSymbol: 'SPCX25Jun26C25.00',
      },
    ]);

    expect(connector.searchSymbol).toHaveBeenCalledWith('SPCX');
    expect(upsertInstrument).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'SPCX',
        externalSymbolId: 12345,
      }),
      { externalSymbolId: 12345 }
    );
  });
});
