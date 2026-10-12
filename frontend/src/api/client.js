/**
 * Project Vigilance — Centralized API Client
 * ==========================================
 * Configures Axios with base URL, timeout, request/response interceptors,
 * automatic JWT bearer token injection, and user-friendly error normalization.
 */

import axios from 'axios';

const baseURL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000';
const timeout = parseInt(import.meta.env?.VITE_API_TIMEOUT_MS, 10) || 10000;

export const apiClient = axios.create({
  baseURL,
  timeout,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor: attach JWT bearer token if stored
apiClient.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('vigilance_token');
      if (token) {
        if (!config.headers) {
          config.headers = {};
        }
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`);
        } else {
          config.headers.Authorization = `Bearer ${token}`;
          config.headers.authorization = `Bearer ${token}`;
        }
      }
    } catch (_) {
      // Ignore localStorage access failures (e.g. during some headless tests)
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for consistent, clean error normalization
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    let friendlyMessage = 'An unexpected error occurred. Please try again.';
    let statusCode = null;

    if (error.response) {
      statusCode = error.response.status;
      const data = error.response.data;

      if (statusCode === 401) {
        friendlyMessage = data?.message || 'Authentication required or session expired. Please log in.';
        try {
          if (typeof window !== 'undefined' && localStorage.getItem('vigilance_token')) {
            localStorage.removeItem('vigilance_token');
            // If the user is on a protected screen, smoothly redirect to login with notification
            if (window.location && !window.location.pathname.includes('/login')) {
              window.location.href = '/login?expired=true';
            }
          }
        } catch (_) {}
      } else if (statusCode === 403) {
        friendlyMessage = data?.message || 'Access denied. You do not have permission for this action.';
      } else if (statusCode === 503) {
        friendlyMessage = 'AML analysis service is temporarily unavailable. Please try again.';
      } else if (statusCode === 504) {
        friendlyMessage = 'AML analysis service request timed out. Please try again.';
      } else if (statusCode === 400) {
        friendlyMessage = data?.message || data?.detail || 'Invalid transaction feature payload submitted.';
      } else if (statusCode === 404) {
        friendlyMessage = data?.message || 'Requested resource not found.';
      } else if (statusCode >= 500) {
        friendlyMessage = 'A server error occurred while processing the request.';
      } else {
        friendlyMessage = data?.message || data?.detail || friendlyMessage;
      }
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      statusCode = 504;
      friendlyMessage = 'Request timed out waiting for backend response.';
    } else if (error.request) {
      statusCode = 503;
      friendlyMessage = 'Unable to connect to the backend server. Please verify backend is running.';
    }

    const normalizedError = new Error(friendlyMessage);
    normalizedError.statusCode = statusCode;
    normalizedError.originalError = error;

    return Promise.reject(normalizedError);
  }
);

export default apiClient;
