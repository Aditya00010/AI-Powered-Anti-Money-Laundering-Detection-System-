/**
 * Project Vigilance - ML Service Client Module
 * ============================================
 * HTTP client communicating with Python FastAPI AML inference service.
 * Handles timeouts, network retries/failures, and response contract validation.
 */

const axios = require('axios');
const { mlServiceUrl, mlServiceTimeoutMs } = require('../config/env');
const {
  MLServiceUnavailableError,
  MLServiceTimeoutError,
  MLServiceValidationError,
  MLServiceBadResponseError,
} = require('../utils/errors');

class MLClient {
  constructor(baseUrl = mlServiceUrl, timeoutMs = mlServiceTimeoutMs) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Checks ML service health and model readiness
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (err) {
      this._handleAxiosError(err, 'Health check failed');
    }
  }

  /**
   * Sends single transaction features to Python ML service for risk evaluation
   * @param {Object} payload { transaction_id, features } or flat { transaction_id, ...features }
   */
  async analyzeTransaction(payload) {
    try {
      const response = await this.client.post('/internal/v1/inference', payload);
      const data = response.data;
      this._validateResponseContract(data);
      return data;
    } catch (err) {
      this._handleAxiosError(err, 'Inference execution failed');
    }
  }

  /**
   * Sends batch of transactions to Python ML service
   * @param {Array<Object>} transactions
   */
  async analyzeBatch(transactions) {
    try {
      const response = await this.client.post('/internal/v1/inference/batch', {
        transactions,
      });
      const data = response.data;
      if (!Array.isArray(data)) {
        throw new MLServiceBadResponseError('Expected an array of inference responses from batch endpoint');
      }
      data.forEach((item, idx) => {
        try {
          this._validateResponseContract(item);
        } catch (e) {
          throw new MLServiceBadResponseError(`Batch item at index ${idx} failed response validation: ${e.message}`);
        }
      });
      return data;
    } catch (err) {
      this._handleAxiosError(err, 'Batch inference execution failed');
    }
  }

  /**
   * Validates that the Python ML service returned the required response contract
   * @private
   */
  _validateResponseContract(res) {
    if (!res || typeof res !== 'object') {
      throw new MLServiceBadResponseError('ML response must be an object');
    }

    const requiredFields = [
      'xgb_probability',
      'xgb_score',
      'isolation_forest_raw_score',
      'isolation_forest_score',
      'final_risk_score',
      'risk_tier',
    ];

    for (const field of requiredFields) {
      if (res[field] === undefined || res[field] === null) {
        throw new MLServiceBadResponseError(`ML response missing required field: '${field}'`);
      }
    }

    const validTiers = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validTiers.includes(res.risk_tier)) {
      throw new MLServiceBadResponseError(`ML response has invalid risk_tier: '${res.risk_tier}'`);
    }

    if (res.final_risk_score < 0 || res.final_risk_score > 100) {
      throw new MLServiceBadResponseError(`ML response final_risk_score out of bounds: ${res.final_risk_score}`);
    }
  }

  /**
   * Maps Axios error scenarios to application-level errors
   * @private
   */
  _handleAxiosError(err, defaultContext) {
    if (err instanceof MLServiceBadResponseError) {
      throw err;
    }

    // Timeout (ECONNABORTED)
    if (err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'))) {
      throw new MLServiceTimeoutError(`${defaultContext}: ML service request timed out after ${this.client.defaults.timeout}ms`);
    }

    // Connection failure / Service down
    if (err.code === 'ECONNREFUSED' || !err.response) {
      throw new MLServiceUnavailableError(`${defaultContext}: Unable to connect to ML service at ${this.client.defaults.baseURL}`);
    }

    // 400 Bad Request / 422 Unprocessable Entity
    if (err.response && (err.response.status === 400 || err.response.status === 422)) {
      const detail = err.response.data?.detail || err.response.data?.message || 'Feature schema validation error';
      throw new MLServiceValidationError(`ML validation error: ${detail}`);
    }

    // 500 or other errors from ML service
    const status = err.response ? err.response.status : 502;
    const detail = err.response?.data?.detail || err.message;
    const error = new Error(`${defaultContext}: ML service error (${status}): ${detail}`);
    error.statusCode = status;
    throw error;
  }
}

// Export singleton instance as well as Class
const defaultClient = new MLClient();

module.exports = {
  MLClient,
  mlClient: defaultClient,
};
