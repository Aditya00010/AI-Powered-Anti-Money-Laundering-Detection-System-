/**
 * Project Vigilance — Investigation Case Controller
 * ==================================================
 * Handles HTTP requests for AML investigation case creation, retrieval,
 * status updates, assignee changes, and investigative notes.
 */

const investigationService = require('../services/investigationService');

/**
 * POST /api/v1/investigations
 * Opens a new investigation case from an existing analysis record.
 */
async function createCase(req, res, next) {
  try {
    const newCase = await investigationService.createCase(req.body, req.user);
    res.status(201).json({
      success: true,
      message: `Investigation case ${newCase.case_id} successfully created.`,
      data: newCase,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/investigations
 * Lists investigation cases with filtering and pagination.
 */
async function listCases(req, res, next) {
  try {
    const result = await investigationService.listCases(req.query);
    res.status(200).json({
      success: true,
      data: result.cases,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/investigations/:caseId
 * Retrieves detailed investigation dossier including audit history.
 */
async function getCase(req, res, next) {
  try {
    const caseData = await investigationService.getCaseById(req.params.caseId);
    res.status(200).json({
      success: true,
      data: caseData,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/investigations/:caseId/status
 * Updates case triage status.
 */
async function updateStatus(req, res, next) {
  try {
    const updatedCase = await investigationService.updateCaseStatus(
      req.params.caseId,
      req.body,
      req.user
    );
    res.status(200).json({
      success: true,
      message: `Case status successfully updated to ${updatedCase.status}.`,
      data: updatedCase,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/investigations/:caseId/assignee
 * Reassigns an investigation case.
 */
async function assignCase(req, res, next) {
  try {
    const updatedCase = await investigationService.assignCase(
      req.params.caseId,
      req.body,
      req.user
    );
    res.status(200).json({
      success: true,
      message: `Case successfully assigned to ${updatedCase.assigned_to || 'Unassigned'}.`,
      data: updatedCase,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/investigations/:caseId/notes
 * Adds a timestamped investigator note to a case.
 */
async function addNote(req, res, next) {
  try {
    const updatedCase = await investigationService.addCaseNote(
      req.params.caseId,
      req.body,
      req.user
    );
    res.status(201).json({
      success: true,
      message: 'Investigation note added successfully.',
      data: updatedCase,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/investigations/transaction/:transactionId/active
 * Checks if an active investigation case already exists for a transaction.
 */
async function getActiveCaseForTransaction(req, res, next) {
  try {
    const activeCase = await investigationService.getActiveCaseForTransaction(req.params.transactionId);
    res.status(200).json({
      success: true,
      has_active_case: !!activeCase,
      data: activeCase,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCase,
  listCases,
  getCase,
  updateStatus,
  assignCase,
  addNote,
  getActiveCaseForTransaction,
};
