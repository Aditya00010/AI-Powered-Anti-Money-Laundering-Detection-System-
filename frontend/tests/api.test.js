import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../src/api/client';
import { getBackendHealth, getMLHealth } from '../src/api/healthApi';
import { analyzeTransaction, getAnalysisByTransactionId } from '../src/api/analysisApi';
import { login, getCurrentUser, listUsers, updateUserStatus, updateUserRole } from '../src/api/authApi';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../src/api/configurationApi';
import {
  listInvestigations,
  getInvestigation,
  createInvestigation,
  updateInvestigationStatus,
  assignInvestigation,
  addInvestigationNote,
  getActiveCaseForTransaction,
} from '../src/api/investigationApi';

describe('API Services & Error Normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getBackendHealth calls GET /health', async () => {
    const mockData = { status: 'ok', service: 'project-vigilance-backend' };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockData);

    const result = await getBackendHealth();
    expect(apiClient.get).toHaveBeenCalledWith('/health');
    expect(result).toEqual(mockData);
  });

  it('getMLHealth calls GET /health/ml', async () => {
    const mockData = { status: 'ok', ml_service: { status: 'ok' } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockData);

    const result = await getMLHealth();
    expect(apiClient.get).toHaveBeenCalledWith('/health/ml');
    expect(result).toEqual(mockData);
  });

  it('analyzeTransaction calls POST /api/v1/analysis/evaluate with payload', async () => {
    const payload = { transaction_id: 'TX-TEST-001', features: { amount: 100 } };
    const mockResponse = { success: true, data: { final_risk_score: 25.0 } };
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

    const result = await analyzeTransaction(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/analysis/evaluate', payload);
    expect(result).toEqual({ final_risk_score: 25.0 });
  });

  it('getAnalysisByTransactionId calls GET /api/v1/analysis/:id', async () => {
    const mockResponse = { success: true, data: { transaction_id: 'TX-TEST-001' } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockResponse);

    const result = await getAnalysisByTransactionId('TX-TEST-001');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/analysis/TX-TEST-001');
    expect(result).toEqual({ transaction_id: 'TX-TEST-001' });
  });

  it('login calls POST /api/v1/auth/login', async () => {
    const creds = { username: 'test_user', password: 'password123' };
    const mockRes = { success: true, token: 'jwt_123', user: { username: 'test_user' } };
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockRes);

    const result = await login(creds);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/login', creds);
    expect(result).toEqual(mockRes);
  });

  it('getCurrentUser calls GET /api/v1/auth/me', async () => {
    const mockRes = { success: true, user: { username: 'test_user', role: 'ADMIN' } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockRes);

    const result = await getCurrentUser();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/me');
    expect(result).toEqual(mockRes);
  });

  it('listUsers calls GET /api/v1/users', async () => {
    const mockRes = { success: true, data: [{ username: 'admin1' }] };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockRes);

    const result = await listUsers();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/users');
    expect(result).toEqual(mockRes);
  });

  it('updateUserStatus calls PATCH /api/v1/users/:id/status', async () => {
    const mockRes = { success: true, data: { active: false } };
    vi.spyOn(apiClient, 'patch').mockResolvedValue(mockRes);

    const result = await updateUserStatus('usr_1', false);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/users/usr_1/status', { active: false });
    expect(result).toEqual(mockRes);
  });

  it('updateUserRole calls PATCH /api/v1/users/:id/role', async () => {
    const mockRes = { success: true, data: { role: 'MANAGER' } };
    vi.spyOn(apiClient, 'patch').mockResolvedValue(mockRes);

    const result = await updateUserRole('usr_1', 'MANAGER');
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/users/usr_1/role', { role: 'MANAGER' });
    expect(result).toEqual(mockRes);
  });

  it('getConfiguration calls GET /api/v1/configuration', async () => {
    const mockRes = { success: true, data: { low_max: 30 } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockRes);

    const result = await getConfiguration();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/configuration');
    expect(result).toEqual({ low_max: 30 });
  });

  it('updateConfiguration calls PUT /api/v1/configuration', async () => {
    const payload = { low_max: 25 };
    const mockRes = { success: true, data: payload };
    vi.spyOn(apiClient, 'put').mockResolvedValue(mockRes);

    const result = await updateConfiguration(payload);
    expect(apiClient.put).toHaveBeenCalledWith('/api/v1/configuration', payload);
    expect(result).toEqual(payload);
  });

  it('resetConfiguration calls POST /api/v1/configuration/reset', async () => {
    const mockRes = { success: true, data: { low_max: 30 } };
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockRes);

    const result = await resetConfiguration();
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/configuration/reset');
    expect(result).toEqual({ low_max: 30 });
  });

  it('listInvestigations calls GET /api/v1/investigations with params', async () => {
    const params = { status: 'OPEN' };
    const mockRes = { success: true, data: [{ case_id: 'CASE-001' }] };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockRes);

    const result = await listInvestigations(params);
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/investigations', { params });
    expect(result).toEqual([{ case_id: 'CASE-001' }]);
  });

  it('getInvestigation calls GET /api/v1/investigations/:caseId', async () => {
    const mockRes = { success: true, data: { case_id: 'CASE-001' } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockRes);

    const result = await getInvestigation('CASE-001');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/investigations/CASE-001');
    expect(result).toEqual({ case_id: 'CASE-001' });
  });

  it('createInvestigation calls POST /api/v1/investigations with payload', async () => {
    const payload = { transaction_id: 'TXN-123' };
    const mockRes = { success: true, data: { case_id: 'CASE-001' } };
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockRes);

    const result = await createInvestigation(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/investigations', payload);
    expect(result).toEqual({ case_id: 'CASE-001' });
  });

  it('updateInvestigationStatus calls PATCH /api/v1/investigations/:caseId/status', async () => {
    const payload = { status: 'INVESTIGATING' };
    const mockRes = { success: true, data: { case_id: 'CASE-001', status: 'INVESTIGATING' } };
    vi.spyOn(apiClient, 'patch').mockResolvedValue(mockRes);

    const result = await updateInvestigationStatus('CASE-001', payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/investigations/CASE-001/status', payload);
    expect(result).toEqual({ case_id: 'CASE-001', status: 'INVESTIGATING' });
  });

  it('assignInvestigation calls PATCH /api/v1/investigations/:caseId/assignee', async () => {
    const payload = { assigned_to: 'analyst_bob' };
    const mockRes = { success: true, data: { case_id: 'CASE-001', assigned_to: 'analyst_bob' } };
    vi.spyOn(apiClient, 'patch').mockResolvedValue(mockRes);

    const result = await assignInvestigation('CASE-001', payload);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/investigations/CASE-001/assignee', payload);
    expect(result).toEqual({ case_id: 'CASE-001', assigned_to: 'analyst_bob' });
  });

  it('addInvestigationNote calls POST /api/v1/investigations/:caseId/notes', async () => {
    const payload = { text: 'New lead verified' };
    const mockRes = { success: true, data: { case_id: 'CASE-001' } };
    vi.spyOn(apiClient, 'post').mockResolvedValue(mockRes);

    const result = await addInvestigationNote('CASE-001', payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/investigations/CASE-001/notes', payload);
    expect(result).toEqual({ case_id: 'CASE-001' });
  });

  it('getActiveCaseForTransaction calls GET /api/v1/investigations/transaction/:id/active', async () => {
    const mockRes = { success: true, has_active_case: true, data: { case_id: 'CASE-001' } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockRes);

    const result = await getActiveCaseForTransaction('TXN-999');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/investigations/transaction/TXN-999/active');
    expect(result).toEqual(mockRes);
  });

  it('normalizes HTTP 401 unauthorized cleanly', async () => {
    const errorInterceptor = apiClient.interceptors.response.handlers[0].rejected;
    const axiosError = {
      response: {
        status: 401,
        data: { message: 'Authentication required' },
      },
    };

    await expect(errorInterceptor(axiosError)).rejects.toThrow('Authentication required');
  });

  it('normalizes HTTP 403 forbidden cleanly', async () => {
    const errorInterceptor = apiClient.interceptors.response.handlers[0].rejected;
    const axiosError = {
      response: {
        status: 403,
        data: { message: 'Access denied' },
      },
    };

    await expect(errorInterceptor(axiosError)).rejects.toThrow('Access denied');
  });

  it('normalizes HTTP 503 response cleanly', async () => {
    const errorInterceptor = apiClient.interceptors.response.handlers[0].rejected;
    const axiosError = {
      response: {
        status: 503,
        data: { message: 'FastAPI down' },
      },
    };

    await expect(errorInterceptor(axiosError)).rejects.toThrow(
      'AML analysis service is temporarily unavailable. Please try again.'
    );
  });

  it('normalizes HTTP 504 timeout cleanly', async () => {
    const errorInterceptor = apiClient.interceptors.response.handlers[0].rejected;
    const axiosError = {
      response: {
        status: 504,
        data: {},
      },
    };

    await expect(errorInterceptor(axiosError)).rejects.toThrow(
      'AML analysis service request timed out. Please try again.'
    );
  });

  it('normalizes HTTP 400 validation error cleanly', async () => {
    const errorInterceptor = apiClient.interceptors.response.handlers[0].rejected;
    const axiosError = {
      response: {
        status: 400,
        data: { message: 'Missing feature: sender_pagerank_score' },
      },
    };

    await expect(errorInterceptor(axiosError)).rejects.toThrow(
      'Missing feature: sender_pagerank_score'
    );
  });

  it('normalizes network connection failure cleanly', async () => {
    const errorInterceptor = apiClient.interceptors.response.handlers[0].rejected;
    const axiosError = {
      request: {}, // Request made but no response received
    };

    await expect(errorInterceptor(axiosError)).rejects.toThrow(
      'Unable to connect to the backend server. Please verify backend is running.'
    );
  });
});
