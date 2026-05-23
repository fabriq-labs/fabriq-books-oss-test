/**
 * AI SDK masks stream errors by default in toDataStreamResponse() → client sees
 * "An error occurred." Use getAgentStreamErrorMessage as getErrorMessage to forward details.
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

/** Message forwarded to the client in AI data stream error parts (type `3:`). */
export function getAgentStreamErrorMessage(error: unknown): string {
  if (error == null) return 'Unknown error';
  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    const providerDetail = extractProviderDetail(error);
    let message = providerDetail ? `${error.message}: ${providerDetail}` : error.message;

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
