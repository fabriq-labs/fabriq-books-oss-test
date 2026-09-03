import {
  applyTemplateToolFilter,
  CORE_SESSION_TOOLS,
  TEMPLATE_FILTER_ALWAYS_KEEP,
} from '../templateToolFilter';

describe('applyTemplateToolFilter', () => {
  const tools = {
    searchRecords: {},
    createRecord: {},
    categorizePostings: {},
    analyticsQuery: {},
    createPlan: {},
    completeStep: {},
    queueActions: {},
    requestClarification: {},
  };

  it('does not filter when allowed_tools is empty', () => {
    expect(applyTemplateToolFilter(tools, [])).toBe(tools);
  });

  it('keeps searchRecords even when the template omitted it (Book Transactions crash)', () => {
    const filtered = applyTemplateToolFilter(tools, [
      'getAnalyticsContext',
      'analyticsQuery',
      'queueActions',
    ]);
    expect(Object.keys(filtered).sort()).toEqual(
      [
        ...CORE_SESSION_TOOLS,
        ...TEMPLATE_FILTER_ALWAYS_KEEP,
        'analyticsQuery',
        'queueActions',
      ].sort(),
    );
    expect(filtered.searchRecords).toBeDefined();
    expect(filtered.createRecord).toBeUndefined();
    expect(filtered.categorizePostings).toBeUndefined();
  });

  it('still strips write tools that the template did not allow', () => {
    const filtered = applyTemplateToolFilter(tools, ['analyticsQuery']);
    expect(filtered.createRecord).toBeUndefined();
    expect(filtered.queueActions).toBeUndefined();
    expect(filtered.categorizePostings).toBeUndefined();
  });
});
