/**
 * Project Vigilance - AML Analysis Mongoose Model
 * ===============================================
 * Persists evaluated transaction risk scores and operational tiers in MongoDB.
 */

const mongoose = require('mongoose');

const amlAnalysisSchema = new mongoose.Schema(
  {
    transaction_id: {
      type: String,
      required: true,
      index: true,
    },
    xgb_probability: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    xgb_score: {
      type: Number,
      required: true,
      min: 0.0,
      max: 100.0,
    },
    isolation_forest_raw_score: {
      type: Number,
      required: true,
    },
    isolation_forest_score: {
      type: Number,
      required: true,
      min: 0.0,
      max: 100.0,
    },
    final_risk_score: {
      type: Number,
      required: true,
      min: 0.0,
      max: 100.0,
      index: true,
    },
    risk_tier: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      index: true,
    },
    features_snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Compound index for querying high/critical risks by date
amlAnalysisSchema.index({ risk_tier: 1, created_at: -1 });

const AmlAnalysis = mongoose.model('AmlAnalysis', amlAnalysisSchema);

module.exports = AmlAnalysis;
