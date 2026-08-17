import {
  formatTradeLegsForPrompt,
  remainingLongLots,
  strategyForOption,
  MAX_UNDERLYING_TRADES_IN_CONTEXT,
} from '../../lib/reports/optionsCoverage';
import fs from 'fs';
import path from 'path';

describe('optionsCoverage helpers', () => {
  it('labels short calls as naked until coverage is applied', () => {
    expect(strategyForOption('C', -1)).toBe('naked_short_call');
    expect(strategyForOption('C', 1)).toBe('long_call');
    expect(strategyForOption('P', -2)).toBe('short_put');
  });

  it('keeps FIFO lots that still make up the long stock position', () => {
    const remaining = remainingLongLots([
      {
        trade_id: 't1',
        type: 'BUY',
        quantity: 100,
        price: 40,
        amount: 4000,
        value_date: '2025-01-10',
      },
      {
        trade_id: 't2',
        type: 'BUY',
        quantity: 50,
        price: 50,
        amount: 2500,
        value_date: '2025-03-01',
      },
      {
        trade_id: 't3',
        type: 'SELL',
        quantity: 80,
        price: 55,
        amount: 4400,
        value_date: '2025-06-01',
      },
    ]);

    expect(remaining).toHaveLength(2);
    expect(remaining[0]).toMatchObject({
      trade_id: 't1',
      quantity: 20,
      price: 40,
    });
    expect(remaining[0].amount).toBeCloseTo(800, 6);
    expect(remaining[1]).toMatchObject({
      trade_id: 't2',
      quantity: 50,
      amount: 2500,
    });
  });

  it('returns no lots when sells exhaust the long position', () => {
    expect(
      remainingLongLots([
        {
          trade_id: 't1',
          type: 'BUY',
          quantity: 100,
          price: 10,
          amount: 1000,
          value_date: '2025-01-01',
        },
        {
          trade_id: 't2',
          type: 'SELL',
          quantity: 100,
          price: 12,
          amount: 1200,
          value_date: '2025-02-01',
        },
      ])
    ).toEqual([]);
  });

  it('formats remaining lots as a prompt-safe block', () => {
    const text = formatTradeLegsForPrompt([
      {
        trade_id: 'trd_abc',
        type: 'BUY',
        quantity: 100,
        price: 45.2,
        amount: 4520,
        value_date: '2025-03-12',
      },
    ]);
    expect(text).toBe('2025-03-12 BUY 100 @ 45.2 (cash 4520; id trd_abc)');
  });

  it('caps oversized lot lists in the prompt string', () => {
    const lots = Array.from({ length: MAX_UNDERLYING_TRADES_IN_CONTEXT + 3 }, (_, i) => ({
      trade_id: `t${i}`,
      type: 'BUY' as const,
      quantity: 1,
      price: 1,
      amount: 1,
      value_date: '2025-01-01',
    }));
    const text = formatTradeLegsForPrompt(lots);
    expect(text.split('\n')).toHaveLength(MAX_UNDERLYING_TRADES_IN_CONTEXT + 1);
    expect(text).toContain('3 more lot(s) omitted');
  });
});

describe('options_analysis prompt template', () => {
  const promptPath = path.join(
    __dirname,
    '../../../prisma/metadata/prompt-templates/view_d63012d4_e1a1_4bb0_aadf_2367d2c6e1d6_options_analysis_fabriq.txt'
  );
  const prompt = fs.readFileSync(promptPath, 'utf8');

  it('tells Theta to treat covered calls as stock-overwritten, not naked shorts', () => {
    expect(prompt).toContain('NOT a naked short');
    expect(prompt).toContain('covered_call');
    expect(prompt).toContain('underlyingTrades');
    expect(prompt).toContain('state `strategy` explicitly');
  });
});
