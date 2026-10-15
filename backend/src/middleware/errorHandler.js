const logger = require('../config/logger');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} | ${req.method} ${req.path}`, { stack: err.stack });

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this information already exists.',
      code: 'DUPLICATE_ENTRY',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found.',
      code: 'NOT_FOUND',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
      code: 'INVALID_TOKEN',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication token has expired.',
      code: 'TOKEN_EXPIRED',
    });
  }

  // Multer / file errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File is too large. Maximum size is 5MB.',
      code: 'FILE_TOO_LARGE',
    });
  }

  // Validation errors (Zod)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      code: 'VALIDATION_ERROR',
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // Custom app errors
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      code: err.code || 'APP_ERROR',
    });
  }

  // Unexpected errors — don't leak details in production
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again.'
      : err.message,
    code: 'INTERNAL_ERROR',
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
};

module.exports = { errorHandler, notFoundHandler };
