/**
 * Project Vigilance — Configuration Service
 * =========================================
 * Manages operational AML risk thresholds and maps final ML scores
 * to operational surveillance tiers.
 */

const AmlConfiguration = require('../models/AmlConfiguration');
const { isDBConnected } = require('../config/db');
const { ValidationError } = require('../utils/errors');

const DEFAULT_CONFIGURATION = Object.freeze({
  low_max: 30.0,
  medium_max: 60.0,
  high_max: 80.0,
  critical_max: 100.0,
  alert_threshold: 60.0,
  near_regulatory_threshold_ratio: 0.90,
  regulatory_ctr_boundary: 1000000.0,
  change_notes: 'System default baseline thresholds',
  updated_by_username: 'system_default',
});

// In-memory cache for fast, offline-resilient access
let inMemoryActiveConfig = { ...DEFAULT_CONFIGURATION };

/**
 * Validates threshold invariants strictly
 * 0 <= low_max < medium_max < high_max <= critical_max <= 100
 */
function validateThresholds({ low_max, medium_max, high_max, critical_max }) {
  const vals = { low_max, medium_max, high_max, critical_max };

  for (const [key, val] of Object.entries(vals)) {
    if (val === undefined || val === null) {
      throw new ValidationError(`Field '${key}' is required.`);
    }
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      throw new ValidationError(`Field '${key}' must be a finite number.`);
    }
    if (val < 0.0 || val > 100.0) {
      throw new ValidationError(`Field '${key}' must be between 0.0 and 100.0.`);
    }
  }

  if (low_max >= medium_max) {
    throw new ValidationError(
      `Threshold ordering violation: low_max (${low_max}) must be strictly less than medium_max (${medium_max}).`
    );
  }

  if (medium_max >= high_max) {
    throw new ValidationError(
      `Threshold ordering violation: medium_max (${medium_max}) must be strictly less than high_max (${high_max}).`
    );
  }

  if (high_max > critical_max) {
    throw new ValidationError(
      `Threshold ordering violation: high_max (${high_max}) cannot exceed critical_max (${critical_max}).`
    );
  }
}

/**
 * Retrieves the active operational configuration
 */
async function getActiveConfiguration() {
  if (isDBConnected()) {
    try {
      let doc = await AmlConfiguration.findOne({ is_active: true }).lean();
      if (!doc) {
        // Initialize default record
        const created = await AmlConfiguration.create({
          ...DEFAULT_CONFIGURATION,
          is_active: true,
        });
        doc = created.toObject();
      }
      inMemoryActiveConfig = sanitizeConfigDoc(doc);
      return inMemoryActiveConfig;
    } catch (err) {
      console.warn(`[ConfigService] MongoDB read failed (${err.message}). Using in-memory fallback.`);
    }
  }
  return inMemoryActiveConfig;
}

/**
 * Updates operational configuration (Admin only)
 */
async function updateConfiguration(inputPayload, user) {
  // Reject arbitrary MongoDB operator keys ($set, $where, etc.)
  for (const key of Object.keys(inputPayload || {})) {
    if (key.startsWith('$')) {
      throw new ValidationError(`MongoDB operator injection attempt detected with key '${key}'.`);
    }
  }

  const currentConfig = await getActiveConfiguration();

  // Whitelist configurable fields
  const low_max = inputPayload.low_max !== undefined ? Number(inputPayload.low_max) : currentConfig.low_max;
  const medium_max = inputPayload.medium_max !== undefined ? Number(inputPayload.medium_max) : currentConfig.medium_max;
  const high_max = inputPayload.high_max !== undefined ? Number(inputPayload.high_max) : currentConfig.high_max;
  const critical_max = inputPayload.critical_max !== undefined ? Number(inputPayload.critical_max) : currentConfig.critical_max;

  const alert_threshold =
    inputPayload.alert_threshold !== undefined ? Number(inputPayload.alert_threshold) : currentConfig.alert_threshold;
  const near_regulatory_threshold_ratio =
    inputPayload.near_regulatory_threshold_ratio !== undefined
      ? Number(inputPayload.near_regulatory_threshold_ratio)
      : currentConfig.near_regulatory_threshold_ratio;
  const regulatory_ctr_boundary =
    inputPayload.regulatory_ctr_boundary !== undefined
      ? Number(inputPayload.regulatory_ctr_boundary)
      : currentConfig.regulatory_ctr_boundary;

  const change_notes = inputPayload.change_notes || 'Updated via Admin Configuration UI';

  // Validate invariants
  validateThresholds({ low_max, medium_max, high_max, critical_max });

  if (alert_threshold < 0 || alert_threshold > 100 || isNaN(alert_threshold) || !isFinite(alert_threshold)) {
    throw new ValidationError('alert_threshold must be a finite number between 0 and 100.');
  }

  if (
    near_regulatory_threshold_ratio < 0 ||
    near_regulatory_threshold_ratio > 1.0 ||
    isNaN(near_regulatory_threshold_ratio) ||
    !isFinite(near_regulatory_threshold_ratio)
  ) {
    throw new ValidationError('near_regulatory_threshold_ratio must be between 0.0 and 1.0.');
  }

  if (regulatory_ctr_boundary < 0 || isNaN(regulatory_ctr_boundary) || !isFinite(regulatory_ctr_boundary)) {
    throw new ValidationError('regulatory_ctr_boundary must be a positive finite number.');
  }

  const newConfigData = {
    low_max,
    medium_max,
    high_max,
    critical_max,
    alert_threshold,
    near_regulatory_threshold_ratio,
    regulatory_ctr_boundary,
    is_active: true,
    updated_by: user?.id || null,
    updated_by_username: user?.username || 'admin',
    previous_configuration: currentConfig,
    change_notes,
  };

  if (isDBConnected()) {
    // Atomically deactivate previous configurations and create the new active one
    await AmlConfiguration.updateMany({ is_active: true }, { is_active: false });
    const created = await AmlConfiguration.create(newConfigData);
    inMemoryActiveConfig = sanitizeConfigDoc(created.toObject());
  } else {
    inMemoryActiveConfig = {
      ...newConfigData,
      _id: 'in_memory_cfg',
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  return inMemoryActiveConfig;
}

/**
 * Resets configuration back to approved baseline (Admin only)
 */
async function resetConfiguration(user) {
  const currentConfig = await getActiveConfiguration();

  const resetData = {
    ...DEFAULT_CONFIGURATION,
    is_active: true,
    updated_by: user?.id || null,
    updated_by_username: user?.username || 'admin',
    previous_configuration: currentConfig,
    change_notes: 'Reset to approved baseline configuration by administrator',
  };

  if (isDBConnected()) {
    await AmlConfiguration.updateMany({ is_active: true }, { is_active: false });
    const created = await AmlConfiguration.create(resetData);
    inMemoryActiveConfig = sanitizeConfigDoc(created.toObject());
  } else {
    inMemoryActiveConfig = {
      ...resetData,
      _id: 'in_memory_reset',
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  return inMemoryActiveConfig;
}

/**
 * Determines operational surveillance tier from final ML risk score
 * @param {number} finalRiskScore - ML model output in [0, 100]
 * @param {Object} config - Active operational threshold config
 * @returns {string} 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 */
function determineOperationalTier(finalRiskScore, config = inMemoryActiveConfig) {
  if (typeof finalRiskScore !== 'number' || isNaN(finalRiskScore) || !isFinite(finalRiskScore)) {
    return 'LOW';
  }

  const lowMax = config.low_max !== undefined ? config.low_max : DEFAULT_CONFIGURATION.low_max;
  const medMax = config.medium_max !== undefined ? config.medium_max : DEFAULT_CONFIGURATION.medium_max;
  const highMax = config.high_max !== undefined ? config.high_max : DEFAULT_CONFIGURATION.high_max;

  if (finalRiskScore <= lowMax) {
    return 'LOW';
  } else if (finalRiskScore <= medMax) {
    return 'MEDIUM';
  } else if (finalRiskScore <= highMax) {
    return 'HIGH';
  } else {
    return 'CRITICAL';
  }
}

function sanitizeConfigDoc(doc) {
  return {
    _id: doc._id?.toString(),
    low_max: doc.low_max,
    medium_max: doc.medium_max,
    high_max: doc.high_max,
    critical_max: doc.critical_max,
    alert_threshold: doc.alert_threshold,
    near_regulatory_threshold_ratio: doc.near_regulatory_threshold_ratio,
    regulatory_ctr_boundary: doc.regulatory_ctr_boundary,
    is_active: doc.is_active,
    updated_by: doc.updated_by ? doc.updated_by.toString() : null,
    updated_by_username: doc.updated_by_username || 'system_default',
    change_notes: doc.change_notes || '',
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

module.exports = {
  DEFAULT_CONFIGURATION,
  validateThresholds,
  getActiveConfiguration,
  updateConfiguration,
  resetConfiguration,
  determineOperationalTier,
};
