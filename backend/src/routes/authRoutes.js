/**
 * Project Vigilance — Authentication Routes
 * ==========================================
 * Route definitions for registration, login, and session profile.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Middleware that optionally parses token if provided (allowing ADMIN to provision privileged roles)
function optionalAuthenticateToken(req, res, next) {
  if (req.headers['authorization']) {
    return authenticateToken(req, res, next);
  }
  next();
}

router.post('/register', optionalAuthenticateToken, authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;
