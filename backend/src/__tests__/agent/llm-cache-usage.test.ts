import {
  extractCacheUsage,
  sumCacheUsageFromSteps,
  resolveCacheUsage,
} from '../../lib/ai/usage';

describe('prompt-cache usage extraction (lib/ai/usage)', () => {
  describe('extractCacheUsage', () => {
    it('returns nulls when metadata is missing or empty', () => {
      expect(extractCacheUsage(undefined)).toEqual({ cachedPromptTokens: null, cacheCreationTokens: null });
      expect(extractCacheUsage(null)).toEqual({ cachedPromptTokens: null, cacheCreationTokens: null });
      expect(extractCacheUsage({})).toEqual({ cachedPromptTokens: null, cacheCreationTokens: null });
    });

    it('reads OpenAI cachedPromptTokens', () => {
      const meta = { openai: { cachedPromptTokens: 1536 } };
      expect(extractCacheUsage(meta)).toEqual({ cachedPromptTokens: 1536, cacheCreationTokens: null });
    });

    it('reads Anthropic cache read + creation tokens', () => {
      const meta = {
        anthropic: { cacheReadInputTokens: 8000, cacheCreationInputTokens: 200 },
      };
      expect(extractCacheUsage(meta)).toEqual({ cachedPromptTokens: 8000, cacheCreationTokens: 200 });
    });

    it('reads Google cachedContentTokenCount (flat and nested)', () => {
      expect(extractCacheUsage({ google: { cachedContentTokenCount: 4096 } })).toEqual({
        cachedPromptTokens: 4096,
        cacheCreationTokens: null,
      });
      expect(extractCacheUsage({ google: { usageMetadata: { cachedContentTokenCount: 2048 } } })).toEqual({
        cachedPromptTokens: 2048,
        cacheCreationTokens: null,
      });
    });

    it('reads Bedrock nested cache usage', () => {
      const meta = { bedrock: { usage: { cacheReadInputTokens: 512, cacheWriteInputTokens: 64 } } };
      expect(extractCacheUsage(meta)).toEqual({ cachedPromptTokens: 512, cacheCreationTokens: 64 });
    });

    it('ignores zero and non-positive values (no cache hit)', () => {
      expect(extractCacheUsage({ openai: { cachedPromptTokens: 0 } })).toEqual({
        cachedPromptTokens: null,
        cacheCreationTokens: null,
      });
    });

    it('falls back to a defensive scan for renamed cache keys', () => {
      // Hypothetical future/unknown provider namespace.
      const meta = { someProvider: { cacheReadPromptTokens: 999 } };
      expect(extractCacheUsage(meta).cachedPromptTokens).toBe(999);
    });
  });

  describe('sumCacheUsageFromSteps', () => {
    it('returns nulls for empty/absent steps', () => {
      expect(sumCacheUsageFromSteps(undefined)).toEqual({ cachedPromptTokens: null, cacheCreationTokens: null });
      expect(sumCacheUsageFromSteps([])).toEqual({ cachedPromptTokens: null, cacheCreationTokens: null });
    });

    it('sums cached tokens across multi-step turns', () => {
      const steps = [
        { providerMetadata: { anthropic: { cacheReadInputTokens: 5000, cacheCreationInputTokens: 300 } } },
        { providerMetadata: { anthropic: { cacheReadInputTokens: 5000 } } },
        { providerMetadata: {} },
      ];
      expect(sumCacheUsageFromSteps(steps)).toEqual({ cachedPromptTokens: 10000, cacheCreationTokens: 300 });
    });
  });

  describe('resolveCacheUsage', () => {
    it('prefers per-step sums over top-level metadata', () => {
      const result = {
        steps: [{ providerMetadata: { openai: { cachedPromptTokens: 100 } } }],
        providerMetadata: { openai: { cachedPromptTokens: 9999 } },
      };
      expect(resolveCacheUsage(result).cachedPromptTokens).toBe(100);
    });

    it('falls back to top-level metadata when steps carry none', () => {
      const result = {
        steps: [{ providerMetadata: {} }],
        providerMetadata: { openai: { cachedPromptTokens: 777 } },
      };
      expect(resolveCacheUsage(result).cachedPromptTokens).toBe(777);
    });
  });
});
