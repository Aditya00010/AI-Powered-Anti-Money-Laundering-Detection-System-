/**
 * Project Vigilance — Transaction Analysis API Services
 * =====================================================
 * Dispatches transaction feature payloads to Express backend for ML evaluation.
 */

import apiClient from './client';

/**
 * Submits a transaction feature set for AML risk evaluation
 * @param {Object} payload { transaction_id, features }
 */
export async function analyzeTransaction(payload) {
  // Uses POST /api/v1/analysis/evaluate (or alias POST /api/v1/analysis)
  const response = await apiClient.post('/api/v1/analysis/evaluate', payload);
  return response.data || response;
}

/**
 * Retrieves past analysis result by transaction ID
 * @param {string} transactionId
 */
export async function getAnalysisByTransactionId(transactionId) {
  const response = await apiClient.get(`/api/v1/analysis/${encodeURIComponent(transactionId)}`);
  return response.data || response;
}
