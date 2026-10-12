/**
 * Project Vigilance — User Management Routes (Admin Only)
 * ========================================================
 * Protected routes for managing user accounts and roles.
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// All user management routes require valid authentication AND the ADMIN role
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

router.get('/', userController.listUsers);
router.patch('/:id/status', userController.updateUserStatus);
router.patch('/:id/role', userController.updateUserRole);

module.exports = router;
