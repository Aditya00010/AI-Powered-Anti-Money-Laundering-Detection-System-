/**
 * Project Vigilance — Investigation & Case Management API Services
 * ================================================================
 * Dispatches requests to backend investigation endpoints using centralized Axios client.
 */

import apiClient from './client';

/**
 * Lists investigation cases with optional filters (status, priority, risk_tier, etc.)
 */
export async function listInvestigations(params = {}) {
  const response = await apiClient.get('/api/v1/investigations', { params });
  return response.data || response;
}

/**
 * Retrieves a single investigation case by its case_id, including action history
 */
export async function getInvestigation(caseId) {
  const response = await apiClient.get(`/api/v1/investigations/${encodeURIComponent(caseId)}`);
  return response.data || response;
}

/**
 * Creates a new investigation case from an existing analysis record
 */
export async function createInvestigation(payload) {
  const response = await apiClient.post('/api/v1/investigations', payload);
  return response.data || response;
}

/**
 * Updates the triage status of an investigation case
 */
export async function updateInvestigationStatus(caseId, payload) {
  const response = await apiClient.patch(
    `/api/v1/investigations/${encodeURIComponent(caseId)}/status`,
    payload
  );
  return response.data || response;
}

/**
 * Assigns or reassigns an investigation case to an investigator
 */
export async function assignInvestigation(caseId, payload) {
  const response = await apiClient.patch(
    `/api/v1/investigations/${encodeURIComponent(caseId)}/assignee`,
    payload
  );
  return response.data || response;
}

/**
 * Adds an investigator note to a case
 */
export async function addInvestigationNote(caseId, payload) {
  const response = await apiClient.post(
    `/api/v1/investigations/${encodeURIComponent(caseId)}/notes`,
    payload
  );
  return response.data || response;
}

/**
 * Checks whether an active investigation case already exists for a transaction ID
 */
export async function getActiveCaseForTransaction(transactionId) {
  const response = await apiClient.get(
    `/api/v1/investigations/transaction/${encodeURIComponent(transactionId)}/active`
  );
  return response;
}
