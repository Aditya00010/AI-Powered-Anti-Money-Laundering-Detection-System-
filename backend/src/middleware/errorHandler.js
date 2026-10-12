/**
 * Project Vigilance - Central Error Handler Middleware
 * ====================================================
 * Formats consistent error responses and shields internal errors/secrets from clients.
 */

const { nodeEnv } = require('../config/env');

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  // Server-side diagnostic log
  console.error(`[Error] [${req.method} ${req.originalUrl}] [${statusCode}] ${err.name}: ${err.message}`);
  if (statusCode === 500 && err.stack) {
    console.error(err.stack);
  }

  const responseBody = {
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
    statusCode: statusCode,
  };

  // Only include debug stack trace in non-production if specifically configured
  if (nodeEnv === 'development' && statusCode === 500) {
    responseBody.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
}

module.exports = errorHandler;
