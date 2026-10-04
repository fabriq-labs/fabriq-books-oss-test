import {
  parseSyncMetadataCliArgs,
  parseSyncTargets,
  parseViewNames,
  resolveSyncTargets,
  selectViewsByName,
} from '../syncMetadataTargets';

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

describe('parseViewNames', () => {
  it('splits commas, trims, and drops duplicates', () => {
    expect(parseViewNames([' account_view, invoice_view ', 'account_view', 'supplier_view'])).toEqual([
      'account_view',
      'invoice_view',
      'supplier_view',
    ]);
  });

  it('rejects an empty list', () => {
    expect(() => parseViewNames(['', '  '])).toThrow(/at least one view name/i);
  });
});

describe('parseSyncMetadataCliArgs', () => {
  it('keeps the historic default when no args are passed', () => {
    expect(parseSyncMetadataCliArgs([])).toEqual({});
  });

  it('accepts comma-separated and repeated --views', () => {
    expect(parseSyncMetadataCliArgs(['--views', 'account_view,invoice_view'])).toEqual({
      viewNames: ['account_view', 'invoice_view'],
    });
    expect(parseSyncMetadataCliArgs(['--views', 'account_view', '--views', 'invoice_view'])).toEqual({
      viewNames: ['account_view', 'invoice_view'],
    });
    expect(parseSyncMetadataCliArgs(['--views=tax_master_view'])).toEqual({
      viewNames: ['tax_master_view'],
    });
  });

  it('rejects unknown args and a missing value', () => {
    expect(() => parseSyncMetadataCliArgs(['--nope'])).toThrow(/Unknown argument/);
    expect(() => parseSyncMetadataCliArgs(['--views'])).toThrow(/Missing view names/);
  });
});

describe('selectViewsByName', () => {
  const views = [
    { name: 'account_view', file: 'a' },
    { name: 'invoice_view', file: 'b' },
    { name: 'supplier_view', file: 'c' },
  ];

  it('returns only the requested views in request order', () => {
    expect(selectViewsByName(views, ['invoice_view', 'account_view'])).toEqual([
      { name: 'invoice_view', file: 'b' },
      { name: 'account_view', file: 'a' },
    ]);
  });

  it('throws before use when a name is missing', () => {
    expect(() => selectViewsByName(views, ['account_view', 'missing_view'])).toThrow(
      /Views not found in metadata JSON: missing_view/
    );
  });
});
