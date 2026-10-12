/**
 * Project Vigilance - AML Analysis Controller
 * ===========================================
 * Handles incoming client requests, delegates ML execution to MLClient service,
 * and persists results in MongoDB.
 */

const { mlClient } = require('../services/mlClient');
const configurationService = require('../services/configurationService');
const AmlAnalysis = require('../models/AmlAnalysis');
const { isDBConnected } = require('../config/db');
const { extractExplainabilityEvidence } = require('../utils/explainabilityHelper');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * Evaluates AML risk for a single transaction.
 * POST /api/v1/analysis/evaluate
 */
async function analyzeTransaction(req, res, next) {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      throw new ValidationError('Request body cannot be empty.');
    }

    // Security: Do not trust client-supplied risk scores or tiers
    // Extract only clean input attributes to forward to Python ML service
    const transactionId = payload.transaction_id || `TXN_${Date.now()}`;
    const sanitizedPayload = {
      transaction_id: transactionId,
      features: payload.features || payload,
    };

    // Remove any forged risk scores if accidentally passed in features
    if (sanitizedPayload.features && typeof sanitizedPayload.features === 'object') {
      delete sanitizedPayload.features.final_risk_score;
      delete sanitizedPayload.features.risk_tier;
      delete sanitizedPayload.features.xgb_probability;
      delete sanitizedPayload.features.xgb_score;
      delete sanitizedPayload.features.isolation_forest_raw_score;
      delete sanitizedPayload.features.isolation_forest_score;
    }

    // Call Python ML service
    const mlResult = await mlClient.analyzeTransaction(sanitizedPayload);

    // Apply authoritative operational configuration
    const activeConfig = await configurationService.getActiveConfiguration();
    const operationalTier = configurationService.determineOperationalTier(mlResult.final_risk_score, activeConfig);

    // Optional MongoDB persistence
    let isPersisted = false;
    let savedAnalysisId = null;
    if (isDBConnected()) {
      try {
        const savedRecord = await AmlAnalysis.create({
          transaction_id: mlResult.transaction_id,
          xgb_probability: mlResult.xgb_probability,
          xgb_score: mlResult.xgb_score,
          isolation_forest_raw_score: mlResult.isolation_forest_raw_score,
          isolation_forest_score: mlResult.isolation_forest_score,
          final_risk_score: mlResult.final_risk_score,
          risk_tier: operationalTier,
          features_snapshot: payload.features || null,
        });
        isPersisted = true;
        savedAnalysisId = savedRecord._id ? savedRecord._id.toString() : null;
      } catch (dbErr) {
        console.warn(`[AmlAnalysis] Could not persist to MongoDB: ${dbErr.message}`);
      }
    }

    const evidence = extractExplainabilityEvidence(
      {
        ...mlResult,
        risk_tier: operationalTier,
      },
      payload.features
    );

    res.status(200).json({
      success: true,
      data: {
        ...mlResult,
        analysis_id: savedAnalysisId,
        model_baseline_tier: mlResult.risk_tier,
        risk_tier: operationalTier,
        operational_thresholds: {
          low_max: activeConfig.low_max,
          medium_max: activeConfig.medium_max,
          high_max: activeConfig.high_max,
          critical_max: activeConfig.critical_max,
        },
        features_snapshot: payload.features || null,
        evidence,
        persisted: isPersisted,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves past analysis for a transaction.
 * GET /api/v1/analysis/:transactionId
 */
async function getAnalysis(req, res, next) {
  try {
    const { transactionId } = req.params;
    if (!isDBConnected()) {
      throw new NotFoundError('Database connection unavailable for historical lookup.');
    }

    const record = await AmlAnalysis.findOne({ transaction_id: transactionId })
      .sort({ created_at: -1 })
      .lean();

    if (!record) {
      throw new NotFoundError(`No analysis found for transaction ID: ${transactionId}`);
    }

    const evidence = extractExplainabilityEvidence(record, record.features_snapshot);

    res.status(200).json({
      success: true,
      data: {
        ...record,
        evidence,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  analyzeTransaction,
  getAnalysis,
};
