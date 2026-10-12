/**
 * Project Vigilance - Health Check Routes
 * =======================================
 * Route definitions for system health checks.
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

router.get('/', healthController.getHealth);
router.get('/ml', healthController.getMLHealth);

module.exports = router;
