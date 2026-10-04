/**
 * Verifies the LLM trace logger persists prompt-cache token counts derived from
 * provider metadata — without touching a real database (Prisma is mocked).
 */

const createMock = jest.fn().mockResolvedValue({ id: 'llmt_test' });
const createManyMock = jest.fn().mockResolvedValue({ count: 0 });

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: async (cb: (tx: any) => Promise<void>) =>
      cb({
        llm_trace: { create: createMock },
        llm_trace_step: { createMany: createManyMock },
      }),
  },
}));

import { llmTraceLogger } from '../../lib/llm-trace-logger';

const baseParams = {
  orgId: 'org_indian_demo',
  userId: 'user_sanjay_gupta',
  question: 'test',
  llmModel: 'gemini-2.0-flash-001',
  durationMs: 100,
  status: 'success' as const,
};

describe('LLM trace logger — prompt-cache persistence', () => {
  beforeEach(() => {
    createMock.mockClear();
    createManyMock.mockClear();
  });

  it('sums cached tokens from per-step providerMetadata into the trace row', async () => {
    await llmTraceLogger.logTrace({
      ...baseParams,
      result: {
        text: 'done',
        usage: { promptTokens: 20000, completionTokens: 500 },
        steps: [
          { text: '', usage: { promptTokens: 12000, completionTokens: 200 }, providerMetadata: { openai: { cachedPromptTokens: 9000 } } } as any,
          { text: '', usage: { promptTokens: 8000, completionTokens: 300 }, providerMetadata: { openai: { cachedPromptTokens: 6000 } } } as any,
        ],
      },
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.prompt_tokens).toBe(20000);
    expect(data.cached_prompt_tokens).toBe(15000); // 9000 + 6000
    expect(data.cache_creation_tokens).toBeNull();

    // Per-step rows also carry cache counts
    const stepRows = createManyMock.mock.calls[0][0].data;
    expect(stepRows[0].cached_prompt_tokens).toBe(9000);
    expect(stepRows[1].cached_prompt_tokens).toBe(6000);
  });

  it('records Anthropic cache read + creation tokens', async () => {
    await llmTraceLogger.logTrace({
      ...baseParams,
      result: {
        text: 'done',
        usage: { promptTokens: 10000, completionTokens: 400 },
        steps: [
          { text: '', providerMetadata: { anthropic: { cacheReadInputTokens: 8000, cacheCreationInputTokens: 250 } } } as any,
        ],
      },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.cached_prompt_tokens).toBe(8000);
    expect(data.cache_creation_tokens).toBe(250);
  });

  it('honours a pre-computed usage override (batch categorization path)', async () => {
    await llmTraceLogger.logTrace({
      ...baseParams,
      result: {
        text: 'done',
        steps: [],
        usage: { promptTokens: 5000, completionTokens: 100, cachedPromptTokens: 3200, cacheCreationTokens: null },
      },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.cached_prompt_tokens).toBe(3200);
  });

  it('writes null cache columns when no provider metadata is present', async () => {
    await llmTraceLogger.logTrace({
      ...baseParams,
      result: {
        text: 'done',
        usage: { promptTokens: 1000, completionTokens: 50 },
        steps: [{ text: '', usage: { promptTokens: 1000, completionTokens: 50 } } as any],
      },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.cached_prompt_tokens).toBeNull();
    expect(data.cache_creation_tokens).toBeNull();
  });

  it('persists OpenRouter cost from response.body.usage.cost', async () => {
    await llmTraceLogger.logTrace({
      ...baseParams,
      result: {
        text: 'done',
        usage: { promptTokens: 1000, completionTokens: 50 },
        steps: [],
        response: { body: { usage: { prompt_tokens: 1000, completion_tokens: 50, cost: 0.00123 } } },
      },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.cost_usd).toBe(0.00123);
  });

  it('persists explicit costUsd override (batch path)', async () => {
    await llmTraceLogger.logTrace({
      ...baseParams,
      result: {
        text: 'done',
        steps: [],
        usage: { promptTokens: 500, completionTokens: 20, costUsd: 0.0045 },
      },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.cost_usd).toBe(0.0045);
  });
});
