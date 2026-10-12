/**
 * Project Vigilance — Configuration Routes
 * ========================================
 * Endpoints for retrieving, updating, and resetting operational AML thresholds.
 *
 * Security:
 * - All endpoints require valid JWT authentication.
 * - Mutation endpoints (PUT /, POST /reset) require ADMIN role.
 */

const express = require('express');
const router = express.Router();
const configurationController = require('../controllers/configurationController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Protect all configuration endpoints with authentication
router.use(authenticateToken);

// GET /api/v1/configuration — accessible to all authenticated surveillance roles
router.get(
  '/',
  authorizeRoles('ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER', 'MANAGER'),
  configurationController.getConfiguration
);

// PUT /api/v1/configuration — ADMIN ONLY
router.put('/', authorizeRoles('ADMIN'), configurationController.updateConfiguration);

// POST /api/v1/configuration/reset — ADMIN ONLY
router.post('/reset', authorizeRoles('ADMIN'), configurationController.resetConfiguration);

module.exports = router;
