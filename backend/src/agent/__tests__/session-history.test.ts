import { toSessionHistoryMessages } from '../sessionHistory';

describe('toSessionHistoryMessages', () => {
  it('replaces empty assistant content with a tool-call summary', () => {
    const history = toSessionHistoryMessages([
      { role: 'user', content: 'Find unbooked transactions' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { toolName: 'createPlan', args: {} },
          { toolName: 'searchRecords', args: { modelName: 'account' } },
          {
            toolName: 'completeStep',
            args: { result_summary: 'Found 4 Checking Accounts' },
          },
        ],
      },
    ]);

    expect(history).toEqual([
      { role: 'user', content: 'Find unbooked transactions' },
      {
        role: 'assistant',
        content:
          'Previous agent turn used tools: createPlan; searchRecords; completeStep (Found 4 Checking Accounts).',
      },
    ]);
  });

  it('drops empty assistant turns with no tools (Gemini poison)', () => {
    const history = toSessionHistoryMessages([
      { role: 'user', content: 'Continue with step 2' },
      { role: 'assistant', content: '', tool_calls: null },
    ]);
    expect(history).toEqual([{ role: 'user', content: 'Continue with step 2' }]);
  });

  it('keeps non-empty assistant text as-is', () => {
    const history = toSessionHistoryMessages([
      { role: 'assistant', content: '  Found nothing.  ', tool_calls: [] },
    ]);
    expect(history).toEqual([{ role: 'assistant', content: 'Found nothing.' }]);
  });
});
