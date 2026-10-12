/**
 * Project Vigilance — Investigation Case Mongoose Model
 * ====================================================
 * Captures lifecycle, assignment, and status of AML suspicious activity investigations.
 *
 * Invariants:
 * - case_id is globally unique and indexed.
 * - Preserves immutable snapshots of risk score and risk tier at case creation.
 * - Tracks opening investigator, assignee, current triage status, and priority.
 */

const mongoose = require('mongoose');

const CASE_STATUSES = ['OPEN', 'INVESTIGATING', 'ESCALATED', 'CLOSED'];
const CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const noteSchema = new mongoose.Schema(
  {
    note_id: {
      type: String,
      required: true,
      default: () => `NOTE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    author: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const investigationCaseSchema = new mongoose.Schema(
  {
    case_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    analysis_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AmlAnalysis',
      required: true,
      index: true,
    },
    transaction_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    risk_score_snapshot: {
      type: Number,
      required: true,
      min: 0.0,
      max: 100.0,
    },
    risk_tier_snapshot: {
      type: String,
      required: true,
      enum: CASE_PRIORITIES,
      index: true,
    },
    xgb_score_snapshot: {
      type: Number,
      min: 0.0,
      max: 100.0,
      default: null,
    },
    isolation_forest_score_snapshot: {
      type: Number,
      min: 0.0,
      max: 100.0,
      default: null,
    },
    assigned_to: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: CASE_STATUSES,
      default: 'OPEN',
      index: true,
    },
    priority: {
      type: String,
      required: true,
      enum: CASE_PRIORITIES,
      default: 'MEDIUM',
      index: true,
    },
    opened_by: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: [noteSchema],
      default: [],
    },
    closed_at: {
      type: Date,
      default: null,
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

// Compound indexes for case queries & sorting
investigationCaseSchema.index({ status: 1, created_at: -1 });
investigationCaseSchema.index({ assigned_to: 1, status: 1 });
investigationCaseSchema.index({ transaction_id: 1, status: 1 });

const InvestigationCase = mongoose.model('InvestigationCase', investigationCaseSchema);

module.exports = {
  InvestigationCase,
  CASE_STATUSES,
  CASE_PRIORITIES,
};
