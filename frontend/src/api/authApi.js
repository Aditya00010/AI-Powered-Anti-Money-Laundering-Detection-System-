/**
 * Project Vigilance — Authentication & User Management API Service
 * =================================================================
 * Communicates with Express backend auth and user management endpoints.
 */

import apiClient from './client';

export async function login(credentials) {
  return apiClient.post('/api/v1/auth/login', credentials);
}

export async function register(userData) {
  return apiClient.post('/api/v1/auth/register', userData);
}

export async function getCurrentUser() {
  return apiClient.get('/api/v1/auth/me');
}

export async function listUsers() {
  return apiClient.get('/api/v1/users');
}

export async function updateUserStatus(userId, active) {
  return apiClient.patch(`/api/v1/users/${userId}/status`, { active });
}

export async function updateUserRole(userId, role) {
  return apiClient.patch(`/api/v1/users/${userId}/role`, { role });
}
