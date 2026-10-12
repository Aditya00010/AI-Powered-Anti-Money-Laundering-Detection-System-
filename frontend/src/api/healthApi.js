/**
 * Project Vigilance — Health API Services
 * =======================================
 * Probes Express backend operational status and internal ML connectivity.
 */

import apiClient from './client';

export async function getBackendHealth() {
  return apiClient.get('/health');
}

export async function getMLHealth() {
  return apiClient.get('/health/ml');
}
