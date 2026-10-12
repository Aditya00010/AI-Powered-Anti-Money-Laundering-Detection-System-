/**
 * Project Vigilance — Investigation Service
 * =========================================
 * Manages the lifecycle of AML suspicious transaction investigations,
 * action auditing, assignments, and notes.
 */

const mongoose = require('mongoose');
const { InvestigationCase, CASE_STATUSES, CASE_PRIORITIES } = require('../models/InvestigationCase');
const { InvestigationAction } = require('../models/InvestigationAction');
const AmlAnalysis = require('../models/AmlAnalysis');
const { User } = require('../models/User');
const { isDBConnected } = require('../config/db');
const { extractExplainabilityEvidence } = require('../utils/explainabilityHelper');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('../utils/errors');

/**
 * Sanitizes input object against MongoDB operator injection
 */
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) {
      throw new ValidationError(`MongoDB operator injection attempt detected with key '${key}'.`);
    }
  }
}

/**
 * Creates an investigation case from an existing analysis record.
 */
async function createCase(payload, user) {
  if (!isDBConnected()) {
    throw new ValidationError('Database connection is required to create an investigation case.');
  }

  sanitizeInput(payload);
  const { analysis_id, transaction_id, priority, assigned_to, initial_note } = payload;

  if (!analysis_id && !transaction_id) {
    throw new ValidationError('Either analysis_id or transaction_id must be provided to create a case.');
  }

  // 1. Locate existing analysis record
  let analysis = null;
  if (analysis_id) {
    if (!mongoose.Types.ObjectId.isValid(analysis_id)) {
      throw new ValidationError(`Invalid analysis_id format: '${analysis_id}'`);
    }
    analysis = await AmlAnalysis.findById(analysis_id).lean();
  } else if (transaction_id) {
    analysis = await AmlAnalysis.findOne({ transaction_id: String(transaction_id).trim() })
      .sort({ created_at: -1 })
      .lean();
  }

  if (!analysis) {
    throw new NotFoundError(
      `Analysis record not found for ${analysis_id ? `analysis_id '${analysis_id}'` : `transaction_id '${transaction_id}'`}.`
    );
  }

  // 2. Prevent duplicate active investigations for this transaction or analysis
  const existingActiveCase = await InvestigationCase.findOne({
    $or: [{ analysis_id: analysis._id }, { transaction_id: analysis.transaction_id }],
    status: { $in: ['OPEN', 'INVESTIGATING', 'ESCALATED'] },
  }).lean();

  if (existingActiveCase) {
    throw new ConflictError(
      `An active investigation case ('${existingActiveCase.case_id}') already exists for transaction '${analysis.transaction_id}'.`
    );
  }

  // 3. Validate optional priority
  let assignedPriority = analysis.risk_tier;
  if (priority) {
    const normPriority = String(priority).trim().toUpperCase();
    if (!CASE_PRIORITIES.includes(normPriority)) {
      throw new ValidationError(`Invalid priority '${priority}'. Allowed: ${CASE_PRIORITIES.join(', ')}`);
    }
    assignedPriority = normPriority;
  }

  // 4. Validate optional assignee
  let targetAssignee = null;
  if (assigned_to) {
    targetAssignee = String(assigned_to).trim();
    // Validate target assignee exists if DB connected
    const assigneeUser = await User.findOne({ username: targetAssignee.toLowerCase() }).lean();
    if (!assigneeUser) {
      throw new ValidationError(`Assignee user '${targetAssignee}' does not exist.`);
    }
    targetAssignee = assigneeUser.username;
  } else if (user.role === 'INVESTIGATOR') {
    // Default to assigning to opening investigator
    targetAssignee = user.username;
  }

  // 5. Generate unique case ID
  const caseId = `CASE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // 6. Build initial notes array
  const notes = [];
  if (initial_note && typeof initial_note === 'string' && initial_note.trim()) {
    notes.push({
      author: user.username,
      text: initial_note.trim(),
      created_at: new Date(),
    });
  }

  // 7. Persist InvestigationCase snapshot
  const newCase = await InvestigationCase.create({
    case_id: caseId,
    analysis_id: analysis._id,
    transaction_id: analysis.transaction_id,
    risk_score_snapshot: analysis.final_risk_score,
    risk_tier_snapshot: analysis.risk_tier,
    xgb_score_snapshot: analysis.xgb_score ?? null,
    isolation_forest_score_snapshot: analysis.isolation_forest_score ?? null,
    assigned_to: targetAssignee,
    status: 'OPEN',
    priority: assignedPriority,
    opened_by: user.username,
    notes,
    closed_at: null,
    features_snapshot: analysis.features_snapshot || null,
  });

  // 8. Record audit trail in InvestigationAction
  await InvestigationAction.create({
    case_id: caseId,
    action_type: 'CASE_CREATED',
    performed_by: user.username,
    description: `Investigation case opened for transaction ${analysis.transaction_id} with risk score ${analysis.final_risk_score} (${analysis.risk_tier}).`,
    metadata: {
      risk_score: analysis.final_risk_score,
      risk_tier: analysis.risk_tier,
      priority: assignedPriority,
      assigned_to: targetAssignee,
    },
  });

  if (targetAssignee) {
    await InvestigationAction.create({
      case_id: caseId,
      action_type: 'CASE_ASSIGNED',
      performed_by: user.username,
      description: `Case assigned to ${targetAssignee}.`,
      metadata: { assigned_to: targetAssignee },
    });
  }

  if (initial_note && typeof initial_note === 'string' && initial_note.trim()) {
    await InvestigationAction.create({
      case_id: caseId,
      action_type: 'NOTE_ADDED',
      performed_by: user.username,
      description: `Initial note recorded by ${user.username}.`,
      metadata: { text: initial_note.trim() },
    });
  }

  return newCase;
}

/**
 * Lists investigation cases with filters and pagination.
 */
async function listCases(query = {}) {
  if (!isDBConnected()) {
    return { cases: [], total: 0, page: 1, limit: 50 };
  }

  sanitizeInput(query);
  const filter = {};

  if (query.status) {
    const s = String(query.status).trim().toUpperCase();
    if (CASE_STATUSES.includes(s)) {
      filter.status = s;
    }
  }

  if (query.priority) {
    const p = String(query.priority).trim().toUpperCase();
    if (CASE_PRIORITIES.includes(p)) {
      filter.priority = p;
    }
  }

  if (query.risk_tier) {
    const rt = String(query.risk_tier).trim().toUpperCase();
    if (CASE_PRIORITIES.includes(rt)) {
      filter.risk_tier_snapshot = rt;
    }
  }

  if (query.assigned_to) {
    filter.assigned_to = String(query.assigned_to).trim();
  }

  if (query.transaction_id) {
    filter.transaction_id = String(query.transaction_id).trim();
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const [cases, total] = await Promise.all([
    InvestigationCase.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InvestigationCase.countDocuments(filter),
  ]);

  return {
    cases,
    total,
    page,
    limit,
  };
}

/**
 * Retrieves a single case by case_id along with its chronological audit actions.
 */
async function getCaseById(caseId) {
  if (!isDBConnected()) {
    throw new NotFoundError('Database unavailable for case lookup.');
  }

  const normalizedCaseId = String(caseId).trim().toUpperCase();
  const caseDoc = await InvestigationCase.findOne({ case_id: normalizedCaseId }).lean();

  if (!caseDoc) {
    throw new NotFoundError(`Investigation case '${caseId}' not found.`);
  }

  const [actions, analysis] = await Promise.all([
    InvestigationAction.find({ case_id: normalizedCaseId })
      .sort({ timestamp: 1 })
      .lean(),
    caseDoc.analysis_id
      ? AmlAnalysis.findById(caseDoc.analysis_id).lean()
      : null,
  ]);

  const evidence = extractExplainabilityEvidence(
    caseDoc,
    analysis?.features_snapshot || caseDoc.features_snapshot
  );

  return {
    ...caseDoc,
    actions,
    analysis,
    evidence,
  };
}

/**
 * Updates case status and records audit action.
 */
async function updateCaseStatus(caseId, payload, user) {
  if (!isDBConnected()) {
    throw new ValidationError('Database connection required.');
  }

  sanitizeInput(payload);
  const { status, note } = payload;

  if (!status) {
    throw new ValidationError("Field 'status' is required.");
  }

  const normStatus = String(status).trim().toUpperCase();
  if (!CASE_STATUSES.includes(normStatus)) {
    throw new ValidationError(`Invalid status '${status}'. Allowed: ${CASE_STATUSES.join(', ')}`);
  }

  const normalizedCaseId = String(caseId).trim().toUpperCase();
  const caseDoc = await InvestigationCase.findOne({ case_id: normalizedCaseId });

  if (!caseDoc) {
    throw new NotFoundError(`Investigation case '${caseId}' not found.`);
  }

  // RBAC checks
  if (user.role === 'INVESTIGATOR') {
    // Investigators can manage their own cases or unassigned cases
    if (caseDoc.assigned_to && caseDoc.assigned_to !== user.username) {
      throw new ForbiddenError(
        `Investigators can only change status for cases assigned to them or unassigned cases (currently assigned to '${caseDoc.assigned_to}').`
      );
    }
  } else if (user.role === 'MANAGER') {
    throw new ForbiddenError('Managers have read-only oversight and cannot modify case status.');
  }

  const previousStatus = caseDoc.status;
  if (previousStatus === normStatus) {
    return caseDoc; // No-op
  }

  caseDoc.status = normStatus;
  if (normStatus === 'CLOSED') {
    caseDoc.closed_at = new Date();
  } else if (previousStatus === 'CLOSED') {
    caseDoc.closed_at = null; // Reopened
  }

  // Handle optional note
  if (note && typeof note === 'string' && note.trim()) {
    caseDoc.notes.push({
      author: user.username,
      text: note.trim(),
      created_at: new Date(),
    });
  }

  await caseDoc.save();

  // Determine action type
  let actionType = 'STATUS_CHANGED';
  if (normStatus === 'ESCALATED') {
    actionType = 'CASE_ESCALATED';
  } else if (normStatus === 'CLOSED') {
    actionType = 'CASE_CLOSED';
  }

  const description = `Status transitioned from ${previousStatus} to ${normStatus} by ${user.username}.${
    note ? ` Note: "${note.trim()}"` : ''
  }`;

  await InvestigationAction.create({
    case_id: normalizedCaseId,
    action_type: actionType,
    performed_by: user.username,
    description,
    metadata: {
      previous_status: previousStatus,
      new_status: normStatus,
      note: note ? note.trim() : null,
    },
  });

  return caseDoc;
}

/**
 * Assigns or reassigns case and records audit action.
 */
async function assignCase(caseId, payload, user) {
  if (!isDBConnected()) {
    throw new ValidationError('Database connection required.');
  }

  sanitizeInput(payload);
  const { assigned_to, note } = payload;

  const normalizedCaseId = String(caseId).trim().toUpperCase();
  const caseDoc = await InvestigationCase.findOne({ case_id: normalizedCaseId });

  if (!caseDoc) {
    throw new NotFoundError(`Investigation case '${caseId}' not found.`);
  }

  // RBAC checks
  if (user.role === 'MANAGER') {
    throw new ForbiddenError('Managers have read-only oversight and cannot reassign cases.');
  } else if (user.role === 'INVESTIGATOR') {
    // Investigator can only self-assign unassigned cases or transfer cases currently assigned to them
    if (caseDoc.assigned_to && caseDoc.assigned_to !== user.username) {
      throw new ForbiddenError(
        `Investigators cannot reassign cases assigned to other personnel (assigned to '${caseDoc.assigned_to}').`
      );
    }
  }

  let targetAssignee = null;
  if (assigned_to !== null && assigned_to !== undefined && String(assigned_to).trim() !== '') {
    targetAssignee = String(assigned_to).trim();
    const assigneeUser = await User.findOne({ username: targetAssignee.toLowerCase() }).lean();
    if (!assigneeUser) {
      throw new ValidationError(`Target assignee user '${targetAssignee}' does not exist.`);
    }
    targetAssignee = assigneeUser.username;
  }

  const previousAssignee = caseDoc.assigned_to;
  caseDoc.assigned_to = targetAssignee;

  if (note && typeof note === 'string' && note.trim()) {
    caseDoc.notes.push({
      author: user.username,
      text: note.trim(),
      created_at: new Date(),
    });
  }

  await caseDoc.save();

  await InvestigationAction.create({
    case_id: normalizedCaseId,
    action_type: 'CASE_ASSIGNED',
    performed_by: user.username,
    description: `Case assignment updated from '${previousAssignee || 'Unassigned'}' to '${targetAssignee || 'Unassigned'}' by ${user.username}.`,
    metadata: {
      previous_assignee: previousAssignee,
      new_assignee: targetAssignee,
    },
  });

  return caseDoc;
}

/**
 * Adds an investigator note to a case and records audit action.
 */
async function addCaseNote(caseId, payload, user) {
  if (!isDBConnected()) {
    throw new ValidationError('Database connection required.');
  }

  sanitizeInput(payload);
  const { text } = payload;

  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new ValidationError("Field 'text' is required and cannot be empty.");
  }

  if (user.role === 'MANAGER') {
    throw new ForbiddenError('Managers have read-only oversight and cannot append case notes.');
  }

  const normalizedCaseId = String(caseId).trim().toUpperCase();
  const caseDoc = await InvestigationCase.findOne({ case_id: normalizedCaseId });

  if (!caseDoc) {
    throw new NotFoundError(`Investigation case '${caseId}' not found.`);
  }

  const trimmedText = text.trim();
  caseDoc.notes.push({
    author: user.username,
    text: trimmedText,
    created_at: new Date(),
  });

  await caseDoc.save();

  await InvestigationAction.create({
    case_id: normalizedCaseId,
    action_type: 'NOTE_ADDED',
    performed_by: user.username,
    description: `Investigation note added by ${user.username}.`,
    metadata: {
      note_preview: trimmedText.length > 80 ? trimmedText.substring(0, 80) + '...' : trimmedText,
    },
  });

  return caseDoc;
}

/**
 * Helper to check whether an active case exists for a transaction ID
 */
async function getActiveCaseForTransaction(transactionId) {
  if (!isDBConnected() || !transactionId) {
    return null;
  }
  return InvestigationCase.findOne({
    transaction_id: String(transactionId).trim(),
    status: { $in: ['OPEN', 'INVESTIGATING', 'ESCALATED'] },
  }).lean();
}

module.exports = {
  createCase,
  listCases,
  getCaseById,
  updateCaseStatus,
  assignCase,
  addCaseNote,
  getActiveCaseForTransaction,
};
