export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(401, message, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(403, message, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Not Found', details?: any) {
    super(404, message, 'NOT_FOUND', details);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string = 'Validation Error', details?: any) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Conflict', details?: any) {
    super(409, message, 'CONFLICT', details);
  }
} 