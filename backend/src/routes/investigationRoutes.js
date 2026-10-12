/**
 * Project Vigilance — Investigation Case Routes
 * =============================================
 * Route definitions for AML case management and audit logging.
 *
 * RBAC Rules:
 * - ADMIN: Full access (view, create, mutate, assign, reassign, status).
 * - INVESTIGATOR: View, create, update status/assignee for assigned cases, add notes.
 * - COMPLIANCE_OFFICER: View, create, review/escalate status, reassign, add notes.
 * - MANAGER: Read-only access to cases and details (mutations return 403).
 */

const express = require('express');
const router = express.Router();
const investigationController = require('../controllers/investigationController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// All investigation endpoints require valid JWT authentication
router.use(authenticateToken);

// List cases (all surveillance roles can view)
router.get(
  '/',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER', 'MANAGER'),
  investigationController.listCases
);

// Active investigation lookup for a transaction
router.get(
  '/transaction/:transactionId/active',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER', 'MANAGER'),
  investigationController.getActiveCaseForTransaction
);

// Get case details & history
router.get(
  '/:caseId',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER', 'MANAGER'),
  investigationController.getCase
);

// Create case from analysis (ADMIN, INVESTIGATOR, COMPLIANCE_OFFICER)
router.post(
  '/',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER'),
  investigationController.createCase
);

// Update case status
router.patch(
  '/:caseId/status',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER'),
  investigationController.updateStatus
);

// Assign or reassign case
router.patch(
  '/:caseId/assignee',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER'),
  investigationController.assignCase
);

// Add investigation note
router.post(
  '/:caseId/notes',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER'),
  investigationController.addNote
);

module.exports = router;
