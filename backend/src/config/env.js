/**
 * Project Vigilance - Environment Configuration Module
 * ====================================================
 * Loads and validates environment variables from root or local .env
 */

const path = require('path');
const dotenv = require('dotenv');

// Prioritize root .env then local .env
const rootEnvPath = path.resolve(__dirname, '../../../.env');
const localEnvPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: localEnvPath });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/aml_detection',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  mlServiceTimeoutMs: parseInt(process.env.ML_SERVICE_TIMEOUT_MS, 10) || 5000,
  jwtSecret: process.env.JWT_SECRET || 'project_vigilance_jwt_secret_dev_key_secure_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
};

module.exports = config;
