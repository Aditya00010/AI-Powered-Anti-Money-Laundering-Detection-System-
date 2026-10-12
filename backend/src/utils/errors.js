/**
 * Project Vigilance - Standardized Error Classes
 * ===============================================
 * Defines application-level and service-to-service errors with HTTP status codes.
 */

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class MLServiceUnavailableError extends AppError {
  constructor(message = 'Python ML inference service is unavailable or unreachable') {
    super(message, 503);
  }
}

class MLServiceTimeoutError extends AppError {
  constructor(message = 'Python ML inference service request timed out') {
    super(message, 504);
  }
}

class MLServiceValidationError extends AppError {
  constructor(message = 'Python ML service rejected the feature payload') {
    super(message, 400);
  }
}

class MLServiceBadResponseError extends AppError {
  constructor(message = 'Python ML service returned an invalid response structure') {
    super(message, 502);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  MLServiceUnavailableError,
  MLServiceTimeoutError,
  MLServiceValidationError,
  MLServiceBadResponseError,
};

