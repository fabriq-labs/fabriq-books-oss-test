import {
  isOptionSymbol,
  parseUnderlyingSymbolFromOption,
  OPTION_SYMBOL_RE,
} from '../../lib/integrations/broker/option_symbol';

describe('option_symbol', () => {
  it('detects Questrade option symbols', () => {
    expect(isOptionSymbol('NVDA10Jul26P175.00')).toBe(true);
    expect(isOptionSymbol('GOOG10Jul26C405.00')).toBe(true);
    expect(isOptionSymbol('VFV.TO')).toBe(false);
  });

  it('parses underlying ticker from option symbol', () => {
    expect(parseUnderlyingSymbolFromOption('NVDA10Jul26P175.00')).toBe('NVDA');
    expect(parseUnderlyingSymbolFromOption('VFV.TO')).toBeNull();
  });

  it('exports OPTION_SYMBOL_RE for legacy callers', () => {
    expect(OPTION_SYMBOL_RE.test('NVDA10Jul26P175.00')).toBe(true);
  });
});
