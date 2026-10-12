/**
 * Project Vigilance — Investigation Action Audit Model
 * ====================================================
 * Captures chronological, tamper-resistant audit events for all case lifecycle mutations.
 *
 * Invariants:
 * - Read-only once written: normal APIs cannot mutate or delete past history.
 * - Records actor, timestamp, action type, description, and metadata.
 */

const mongoose = require('mongoose');

const ACTION_TYPES = [
  'CASE_CREATED',
  'CASE_ASSIGNED',
  'STATUS_CHANGED',
  'NOTE_ADDED',
  'CASE_ESCALATED',
  'CASE_CLOSED',
];

const investigationActionSchema = new mongoose.Schema(
  {
    case_id: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    action_type: {
      type: String,
      required: true,
      enum: ACTION_TYPES,
      index: true,
    },
    performed_by: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

investigationActionSchema.index({ case_id: 1, timestamp: -1 });

const InvestigationAction = mongoose.model('InvestigationAction', investigationActionSchema);

module.exports = {
  InvestigationAction,
  ACTION_TYPES,
};
