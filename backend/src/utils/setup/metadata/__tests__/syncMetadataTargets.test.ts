import { parseSyncTargets, resolveSyncTargets } from '../syncMetadataTargets';

describe('parseSyncTargets', () => {
  it('accepts a non-empty unique list in first-seen order', () => {
    expect(parseSyncTargets(['currencies', 'views', 'currencies'])).toEqual([
      'currencies',
      'views',
    ]);
  });

  it('rejects missing or empty targets', () => {
    expect(() => parseSyncTargets(undefined)).toThrow(/at least one/i);
    expect(() => parseSyncTargets([])).toThrow(/at least one/i);
    expect(() => parseSyncTargets('views')).toThrow(/at least one/i);
  });

  it('rejects unknown types', () => {
    expect(() => parseSyncTargets(['views', 'workflows'])).toThrow(/Unknown metadata type: workflows/);
  });
});

describe('resolveSyncTargets', () => {
  it('defaults CLI (no arg) to views + prompt templates', () => {
    expect(resolveSyncTargets()).toEqual(['views', 'promptTemplates']);
  });

  it('maps historic CLI filter strings', () => {
    expect(resolveSyncTargets('view')).toEqual(['views']);
    expect(resolveSyncTargets('prompttemplate')).toEqual(['promptTemplates']);
  });

  it('parses Super Admin { targets } objects', () => {
    expect(resolveSyncTargets({ targets: ['agentTemplates', 'currencies'] })).toEqual([
      'agentTemplates',
      'currencies',
    ]);
  });
});
