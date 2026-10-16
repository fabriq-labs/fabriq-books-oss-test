export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError');
}
