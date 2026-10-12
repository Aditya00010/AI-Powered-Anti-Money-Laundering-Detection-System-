import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../src/pages/Dashboard';
import * as healthApi from '../src/api/healthApi';

describe('Dashboard Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dashboard with healthy status when backend and ML service are up', async () => {
    vi.spyOn(healthApi, 'getBackendHealth').mockResolvedValue({
      status: 'ok',
      service: 'project-vigilance-backend',
      uptime_seconds: 120,
      database_connected: true,
    });

    vi.spyOn(healthApi, 'getMLHealth').mockResolvedValue({
      status: 'ok',
      ml_service: {
        status: 'ok',
        models_loaded: {
          xgboost: true,
          isolation_forest: true,
        },
      },
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('AML Surveillance Operations')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Active & Healthy')).toBeInTheDocument();
      expect(screen.getByText('FastAPI Operational')).toBeInTheDocument();
      expect(screen.getByText('Connected (Local)')).toBeInTheDocument();
    });
  });

  it('handles backend unavailable state gracefully', async () => {
    const networkError = new Error('Unable to connect to the backend server. Please verify backend is running.');
    networkError.statusCode = 503;
    vi.spyOn(healthApi, 'getBackendHealth').mockRejectedValue(networkError);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to connect to the backend server/i)).toBeInTheDocument();
    });
  });
});
