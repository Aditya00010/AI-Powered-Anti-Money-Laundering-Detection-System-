/**
 * Project Vigilance — Configuration API Service
 * =============================================
 * Communicates with Express backend operational threshold configuration endpoints.
 */

import apiClient from './client';

export async function getConfiguration() {
  const response = await apiClient.get('/api/v1/configuration');
  return response.data || response;
}

export async function updateConfiguration(payload) {
  const response = await apiClient.put('/api/v1/configuration', payload);
  return response.data || response;
}

export async function resetConfiguration() {
  const response = await apiClient.post('/api/v1/configuration/reset');
  return response.data || response;
}
