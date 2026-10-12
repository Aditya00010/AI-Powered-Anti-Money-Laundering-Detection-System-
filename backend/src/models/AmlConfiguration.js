/**
 * Project Vigilance — Operational AML Configuration Model
 * ========================================================
 * Stores operational risk-tier thresholds and compliance parameter settings.
 *
 * Invariants:
 * 0 <= low_max < medium_max < high_max <= critical_max <= 100
 */

const mongoose = require('mongoose');

const amlConfigurationSchema = new mongoose.Schema(
  {
    low_max: {
      type: Number,
      required: true,
      default: 30.0,
      min: 0.0,
      max: 100.0,
    },
    medium_max: {
      type: Number,
      required: true,
      default: 60.0,
      min: 0.0,
      max: 100.0,
    },
    high_max: {
      type: Number,
      required: true,
      default: 80.0,
      min: 0.0,
      max: 100.0,
    },
    critical_max: {
      type: Number,
      required: true,
      default: 100.0,
      min: 0.0,
      max: 100.0,
    },
    alert_threshold: {
      type: Number,
      required: true,
      default: 60.0,
      min: 0.0,
      max: 100.0,
    },
    near_regulatory_threshold_ratio: {
      type: Number,
      required: true,
      default: 0.90,
      min: 0.0,
      max: 1.0,
    },
    regulatory_ctr_boundary: {
      type: Number,
      required: true,
      default: 1000000.0,
      min: 0.0,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updated_by_username: {
      type: String,
      default: 'system_default',
    },
    previous_configuration: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    change_notes: {
      type: String,
      default: 'Initial baseline configuration',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Strict threshold invariant validation hook
amlConfigurationSchema.pre('validate', function (next) {
  const { low_max, medium_max, high_max, critical_max } = this;

  if (
    typeof low_max !== 'number' ||
    typeof medium_max !== 'number' ||
    typeof high_max !== 'number' ||
    typeof critical_max !== 'number' ||
    isNaN(low_max) ||
    isNaN(medium_max) ||
    isNaN(high_max) ||
    isNaN(critical_max) ||
    !isFinite(low_max) ||
    !isFinite(medium_max) ||
    !isFinite(high_max) ||
    !isFinite(critical_max)
  ) {
    return next(new Error('All threshold maximums must be valid finite numbers.'));
  }

  if (low_max < 0 || critical_max > 100) {
    return next(new Error('Thresholds must be strictly between 0 and 100.'));
  }

  if (low_max >= medium_max) {
    return next(new Error(`Validation failed: low_max (${low_max}) must be strictly less than medium_max (${medium_max}).`));
  }

  if (medium_max >= high_max) {
    return next(new Error(`Validation failed: medium_max (${medium_max}) must be strictly less than high_max (${high_max}).`));
  }

  if (high_max > critical_max) {
    return next(new Error(`Validation failed: high_max (${high_max}) cannot exceed critical_max (${critical_max}).`));
  }

  next();
});

const AmlConfiguration = mongoose.model('AmlConfiguration', amlConfigurationSchema);

module.exports = AmlConfiguration;
