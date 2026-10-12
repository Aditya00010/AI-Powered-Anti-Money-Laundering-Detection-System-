/**
 * Project Vigilance — Configuration Controller
 * ============================================
 * Handles endpoints for inspecting, modifying, and resetting operational
 * AML risk-tier thresholds and compliance parameter settings.
 */

const configurationService = require('../services/configurationService');
const { ValidationError } = require('../utils/errors');

/**
 * GET /api/v1/configuration
 * Retrieves active operational configuration
 */
async function getConfiguration(req, res, next) {
  try {
    const config = await configurationService.getActiveConfiguration();
    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/configuration
 * Updates operational thresholds (Admin only)
 */
async function updateConfiguration(req, res, next) {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length === 0) {
      throw new ValidationError('Request body must be a non-empty object containing configuration settings.');
    }

    const updatedConfig = await configurationService.updateConfiguration(payload, req.user);

    res.status(200).json({
      success: true,
      message: 'Operational AML configuration updated successfully.',
      data: updatedConfig,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/configuration/reset
 * Resets operational configuration to approved baseline (Admin only)
 */
async function resetConfiguration(req, res, next) {
  try {
    const resetConfig = await configurationService.resetConfiguration(req.user);

    res.status(200).json({
      success: true,
      message: 'Operational AML configuration reset to approved baseline successfully.',
      data: resetConfig,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getConfiguration,
  updateConfiguration,
  resetConfiguration,
};
