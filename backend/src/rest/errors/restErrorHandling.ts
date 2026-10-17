import { Request, Response } from 'express';
import logger from '../../utils/logger';
import {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError
} from './ApiError';

/**
 * JSON body for REST error responses. Clients typically read `error` (see frontend api.ts).
 */
export function buildApiErrorResponseBody(err: ApiError): Record<string, unknown> {
  const body: Record<string, unknown> = {
    error: err.message
  };
  if (err.code) {
    body.code = err.code;
  }
  if (err.details !== undefined) {
    body.details = err.details;
  }
  return body;
}

export function sendApiErrorResponse(res: Response, err: ApiError): void {
  res.status(err.statusCode).json(buildApiErrorResponseBody(err));
}

/**
 * Maps plain service/DAL error strings (often thrown as `new Error(...)` inside ModelService)
 * to typed {@link ApiError} with correct HTTP status and clearer user-facing copy.
 */
export function mapServiceMessageToApiError(message: string | undefined | null): ApiError {
  const raw = (message ?? '').trim();
  if (!raw) {
    return new ValidationError(
      'The request could not be completed because the server did not return a specific reason. Please check your input and try again.'
    );
  }

  const lower = raw.toLowerCase();

  if (raw === 'Authentication required' || lower === 'authentication required') {
    return new UnauthorizedError(
      'You need to be signed in to perform this action. Please authenticate and try again.',
      { originalError: raw }
    );
  }

  if (raw.startsWith('Unauthorized: No permissions found')) {
    return new ForbiddenError(
      'Your session does not include any role permissions. Ask an administrator to assign you at least one role so you can use the application.',
      { originalError: raw }
    );
  }

  if (raw.startsWith('Unauthorized: No permissions for model')) {
    const model = raw.replace(/^Unauthorized:\s*No permissions for model\s*/i, '').trim();
    const modelPhrase = model ? `the "${model}" model` : 'the requested model';
    return new ForbiddenError(
      `You are not allowed to access ${modelPhrase} for this operation. This usually means your role does not include a view with permissions for that model, or the requested view is not assigned to your role.`,
      { originalError: raw, model: model || undefined }
    );
  }

  if (raw.startsWith('Unauthorized: Insufficient permissions')) {
    return new ForbiddenError(
      'You do not have sufficient permission for this operation (for example read vs write). Ask an administrator to adjust your role or view permissions.',
      { originalError: raw }
    );
  }

  if (raw.startsWith('Unauthorized: No access to fields')) {
    return new ForbiddenError(
      'Your role cannot access one or more of the fields requested for this query. Try a different view, or ask an administrator to grant access to the needed fields.',
      { originalError: raw }
    );
  }

  if (raw.startsWith('Unauthorized:')) {
    return new UnauthorizedError(
      'This action could not be authorized. If you are signed in, your token may be expired or the server rejected the request.',
      { originalError: raw }
    );
  }

  if (raw.startsWith('Forbidden:')) {
    const rest = raw.replace(/^Forbidden:\s*/i, '').trim();
    return new ForbiddenError(
      rest || 'Access to this resource is forbidden for your account.',
      { originalError: raw }
    );
  }

  if (raw.startsWith('Unknown field')) {
    return new ValidationError(raw, { originalError: raw });
  }

  if (raw === 'Record not found') {
    return new NotFoundError(
      'No matching record was found. It may have been deleted, or the ID in the URL may be incorrect.',
      { originalError: raw }
    );
  }

  const modelNotFound = /^Model\s+(\S+)\s+not found$/i.exec(raw);
  if (modelNotFound) {
    return new NotFoundError(
      `The data type "${modelNotFound[1]}" is not defined in the application schema, so it cannot be queried.`,
      { originalError: raw }
    );
  }

  const relationNotFound = /^Relation\s+(\S+)\s+not found in model\s+(\S+)$/i.exec(raw);
  if (relationNotFound) {
    return new NotFoundError(
      `The relation "${relationNotFound[1]}" does not exist on model "${relationNotFound[2]}". Check the API path or metadata configuration.`,
      { originalError: raw }
    );
  }

  if (lower.includes('unique constraint') || lower.includes('p2002')) {
    return new ConflictError(
      'This change would conflict with existing data (for example a duplicate value where only one is allowed). Adjust the values and try again.',
      { originalError: raw }
    );
  }

  if (
    lower.startsWith('invalid ') ||
    lower.includes('invalid argument') ||
    lower.includes('validation') ||
    lower.includes('required field') ||
    lower.includes('expected ') ||
    lower.includes('bad request')
  ) {
    return new ValidationError(
      raw.length > 240
        ? `${raw.slice(0, 240)}…`
        : raw,
      { originalError: raw }
    );
  }

  return new ApiError(
    500,
    'Something went wrong while processing your request. If the problem continues, contact support with the time of the request.',
    'UNHANDLED_SERVICE_ERROR',
    { originalError: raw }
  );
}

/**
 * Normalizes any thrown value from a controller into an {@link ApiError}.
 */
export function toApiError(error: unknown, fallbackMessage: string): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return mapServiceMessageToApiError(error.message);
  }
  return new ApiError(500, fallbackMessage, 'INTERNAL_ERROR', {
    originalError: String(error)
  });
}

export function handleRestControllerError(
  error: unknown,
  req: Pick<Request, 'path'>,
  res: Response,
  operation: string,
  defaultFallbackMessage: string,
  options?: { logExtras?: Record<string, unknown> }
): void {
  const api = toApiError(error, defaultFallbackMessage);

  const meta: Record<string, unknown> = {
    error: api.message,
    path: req.path,
    ...(options?.logExtras ?? {})
  };
  meta.statusCode = api.statusCode;
  if (api.code) {
    meta.code = api.code;
  }

  // 404 is routine for optional lookups (e.g. draft chat threads not yet persisted).
  if (api instanceof NotFoundError || api.statusCode === 404) {
    logger.debug(`Not found in ${operation}`, meta);
  } else {
    logger.error(`Error in ${operation}`, meta);
  }

  sendApiErrorResponse(res, api);
}

/**
 * For handlers that return early on `success: false` without throwing.
 */
export function respondWithMappedServiceFailure(
  res: Response,
  errorMessage: string | undefined | null
): void {
  const api = mapServiceMessageToApiError(errorMessage);
  sendApiErrorResponse(res, api);
}
