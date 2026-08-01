import { APICallError } from 'ai';
import {
  consumeStreamAndThrowOnError,
  formatAgentHttpError,
  getAgentHttpStatusCode,
  getAgentStreamErrorMessage,
  isAbortError,
} from '../../agent/utils/streamErrorMessage';

describe('streamErrorMessage', () => {
  it('maps provider 401 to HTTP 502 with auth message', () => {
    const err = new APICallError({
      message: 'Unauthorized',
      url: 'https://llm.example.test/api/v1/chat/completions', // pragma: allowlist secret
      requestBodyValues: {},
      statusCode: 401,
      responseBody: JSON.stringify({ error: { message: 'User not found.', code: 401 } }),
      isRetryable: false,
    });

    expect(getAgentHttpStatusCode(err)).toBe(502);
    expect(getAgentStreamErrorMessage(err)).toContain('LLM provider authentication failed');
    expect(getAgentStreamErrorMessage(err)).toContain('User not found');
    expect(formatAgentHttpError(err).error).toContain('Check LLM API credentials');
  });

  it('maps abort/timeout to HTTP 504', () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
    expect(getAgentHttpStatusCode(err)).toBe(504);
    expect(getAgentStreamErrorMessage(err)).toMatch(/timed out/i);
  });

  it('maps provider 429 to HTTP 429', () => {
    const err = new APICallError({
      message: 'Rate limit',
      url: 'https://llm.example.test/api/v1/chat/completions', // pragma: allowlist secret
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });
    expect(getAgentHttpStatusCode(err)).toBe(429);
  });

  it('maps provider 402 credit/max_tokens errors clearly', () => {
    const err = new APICallError({
      message: 'Payment Required',
      url: 'https://llm.example.test/api/v1/chat/completions', // pragma: allowlist secret
      requestBodyValues: {},
      statusCode: 402,
      responseBody: JSON.stringify({
        error: {
          message:
            'This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, but can only afford 63278.',
          code: 402,
        },
      }),
      isRetryable: false,
    });

    expect(getAgentHttpStatusCode(err)).toBe(402);
    expect(getAgentStreamErrorMessage(err)).toContain('credits');
    expect(getAgentStreamErrorMessage(err)).toContain('max_tokens');
    expect(formatAgentHttpError(err).error).toContain('402');
  });

  it('rethrows errors swallowed by AI SDK consumeStream', async () => {
    const providerError = new APICallError({
      message: 'Unauthorized',
      url: 'https://llm.example.test/api/v1/chat/completions', // pragma: allowlist secret
      requestBodyValues: {},
      statusCode: 401,
      responseBody: '{"error":{"message":"User not found.","code":401}}',
      isRetryable: false,
    });

    const result = {
      consumeStream: async (options?: { onError?: (error: unknown) => void }) => {
        // Mimic AI SDK: invoke onError and do not throw.
        options?.onError?.(providerError);
      },
    };

    await expect(consumeStreamAndThrowOnError(result)).rejects.toBe(providerError);
  });

  it('resolves when consumeStream completes without onError', async () => {
    const result = {
      consumeStream: async () => undefined,
    };
    await expect(consumeStreamAndThrowOnError(result)).resolves.toBeUndefined();
  });
});
