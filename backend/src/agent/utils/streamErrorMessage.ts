import { APICallError } from 'ai';

/**
 * AI SDK masks stream errors by default in toDataStreamResponse() → client sees
 * "An error occurred." Use getAgentStreamErrorMessage as getErrorMessage to forward details.
 *
 * Importantly: `result.consumeStream()` also *swallows* errors (only invokes onError).
 * Callers that await consumeStream must capture onError and rethrow, or the HTTP
 * handler will hang / return an empty success.
 *
 * Set AGENT_EXPOSE_ERROR_DETAILS=true to include stack traces in API/stream responses
 * (for staging/debug; not recommended on public production without access controls).
 */
export function shouldExposeAgentErrorDetails(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.AGENT_EXPOSE_ERROR_DETAILS === 'true'
  );
}

function extractProviderDetail(error: Error): string | undefined {
  const err = error as Error & {
    responseBody?: string | Record<string, unknown>;
    data?: { error?: { message?: string } };
    cause?: unknown;
  };

  if (err.data?.error?.message) {
    return String(err.data.error.message);
  }

  if (err.responseBody) {
    try {
      const body =
        typeof err.responseBody === 'string' ? JSON.parse(err.responseBody) : err.responseBody;
      const nested =
        (body as { error?: { message?: string }; message?: string })?.error?.message ||
        (body as { message?: string })?.message;
      if (nested) return String(nested);
    } catch {
      if (typeof err.responseBody === 'string' && err.responseBody.length < 500) {
        return err.responseBody;
      }
    }
  }

  if (err.cause instanceof Error && err.cause.message && err.cause.message !== err.message) {
    return err.cause.message;
  }

  return undefined;
}

function getApiCallStatusCode(error: unknown): number | undefined {
  if (APICallError.isInstance(error) && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause && APICallError.isInstance(cause) && typeof cause.statusCode === 'number') {
    return cause.statusCode;
  }
  return undefined;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (error instanceof Error && /aborted|abort/i.test(error.message)) return true;
  return false;
}

/**
 * Map upstream LLM / stream failures to an HTTP status for non-stream routes
 * (e.g. POST /api/agent/extract).
 */
export function getAgentHttpStatusCode(error: unknown): number {
  if (isAbortError(error)) return 504;

  const providerStatus = getApiCallStatusCode(error);
  if (providerStatus === 401 || providerStatus === 403) return 502;
  // Some LLM gateways return 402 when the key lacks credits for reserved max_tokens.
  if (providerStatus === 402) return 402;
  if (providerStatus === 429) return 429;
  if (providerStatus != null && providerStatus >= 400 && providerStatus < 600) return 502;

  return 500;
}

/** Message forwarded to the client in AI data stream error parts (type `3:`). */
export function getAgentStreamErrorMessage(error: unknown): string {
  if (error == null) return 'Unknown error';
  if (typeof error === 'string') return error;

  if (isAbortError(error)) {
    return 'LLM request timed out. Please try again.';
  }

  if (error instanceof Error) {
    const providerStatus = getApiCallStatusCode(error);
    const providerDetail = extractProviderDetail(error);

    if (providerStatus === 401 || providerStatus === 403) {
      const detail = providerDetail || error.message;
      const base =
        detail.toLowerCase().includes('authentication') || detail.toLowerCase().includes('unauthorized')
          ? detail
          : `LLM provider authentication failed (${providerStatus}): ${detail}`;
      const withHint = /credential|api key|user not found|unauthorized/i.test(base)
        ? `${base.replace(/\.\s*$/, '')}. Check LLM API credentials.`
        : `${base.replace(/\.\s*$/, '')}. Check LLM API credentials.`;
      return withHint;
    }

    if (providerStatus === 402) {
      const detail = providerDetail || error.message;
      if (/credits|max_tokens|afford/i.test(detail)) {
        return `LLM provider out of credits or max_tokens too high (402): ${detail}`;
      }
      return `LLM provider payment/credits error (402): ${detail}`;
    }

    let message = providerDetail && providerDetail !== error.message
      ? `${error.message}: ${providerDetail}`
      : (providerDetail || error.message);

    if (shouldExposeAgentErrorDetails() && error.stack) {
      message = `${message}\n\n${error.stack}`;
    }
    return message;
  }

  return JSON.stringify(error);
}

/** JSON body for non-stream agent routes and pre-stream failures. */
export function formatAgentHttpError(error: unknown): { error: string; stack?: string } {
  const errorMessage = getAgentStreamErrorMessage(error);
  if (shouldExposeAgentErrorDetails() && error instanceof Error && error.stack) {
    return { error: errorMessage, stack: error.stack };
  }
  return { error: errorMessage };
}

/**
 * AI SDK `consumeStream()` swallows errors. Capture them via onError and rethrow
 * so route handlers can return a clean failure + write llm_trace.
 */
export async function consumeStreamAndThrowOnError(
  result: { consumeStream: (options?: { onError?: (error: unknown) => void }) => Promise<void> },
  onError?: (error: unknown) => void,
): Promise<void> {
  let streamError: unknown;
  await result.consumeStream({
    onError: (error) => {
      streamError = error;
      onError?.(error);
    },
  });
  if (streamError != null) {
    throw streamError instanceof Error
      ? streamError
      : new Error(getAgentStreamErrorMessage(streamError));
  }
}
