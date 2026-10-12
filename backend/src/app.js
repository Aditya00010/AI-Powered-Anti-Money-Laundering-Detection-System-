/**
 * Project Vigilance - Express Application
 * =======================================
 * Configures Express middleware, security headers, routes, and error handling.
 */

const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const configurationRoutes = require('./routes/configurationRoutes');
const investigationRoutes = require('./routes/investigationRoutes');
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./utils/errors');

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount health and API routes
app.use('/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/configuration', configurationRoutes);
app.use('/api/v1/analysis', analysisRoutes);
app.use('/api/v1/investigations', investigationRoutes);

// Catch-all for undefined routes
app.use((req, res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
});

// Central error handler
app.use(errorHandler);

module.exports = app;
