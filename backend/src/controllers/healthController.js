/**
 * Project Vigilance - Health Controller Module
 * ============================================
 * Provides public health check for Express backend and internal connectivity check for ML service.
 */

const { isDBConnected } = require('../config/db');
const { mlClient } = require('../services/mlClient');

/**
 * Public backend health check endpoint (GET /health)
 * Does NOT execute ML prediction.
 */
function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'project-vigilance-backend',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    database_connected: isDBConnected(),
  });
}

/**
 * Internal ML service connectivity check (GET /health/ml)
 */
async function getMLHealth(req, res, next) {
  try {
    const mlHealth = await mlClient.checkHealth();
    res.status(200).json({
      status: 'ok',
      ml_service: mlHealth,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHealth,
  getMLHealth,
};
