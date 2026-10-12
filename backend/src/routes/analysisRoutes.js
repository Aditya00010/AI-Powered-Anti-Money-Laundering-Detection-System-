/**
 * Project Vigilance - AML Analysis Routes
 * =======================================
 * Route definitions for evaluating and querying transaction risk scores.
 *
 * Security:
 * - Requires authentication token (authenticateToken).
 * - Enforces role-based investigation access (authorizeRoles).
 */

const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Protect all analysis endpoints with authentication
router.use(authenticateToken);

// Transaction risk evaluation requires INVESTIGATOR, ADMIN, or COMPLIANCE_OFFICER
router.post(
  '/evaluate',
  authorizeRoles('INVESTIGATOR', 'ADMIN', 'COMPLIANCE_OFFICER'),
  analysisController.analyzeTransaction
);

router.post(
  '/',
  authorizeRoles('INVESTIGATOR', 'ADMIN', 'COMPLIANCE_OFFICER'),
  analysisController.analyzeTransaction
);

// Transaction analysis retrieval permitted for all authorized surveillance roles
router.get(
  '/:transactionId',
  authorizeRoles('INVESTIGATOR', 'ADMIN', 'COMPLIANCE_OFFICER', 'MANAGER'),
  analysisController.getAnalysis
);

module.exports = router;
