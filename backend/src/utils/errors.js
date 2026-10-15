/**
 * Custom operational error class for Balemuya
 */
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found.`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed.') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'A conflict occurred.') {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
};
