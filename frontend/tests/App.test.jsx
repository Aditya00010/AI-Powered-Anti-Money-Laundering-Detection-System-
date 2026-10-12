import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import AppRoutes from '../src/routes/AppRoutes';
import * as healthApi from '../src/api/healthApi';
import * as authApi from '../src/api/authApi';
import * as configurationApi from '../src/api/configurationApi';

describe('App Routing, Protected Routes & Role-Based Layout', () => {
  const investigatorUser = {
    id: 'usr_test_1',
    username: 'investigator_test',
    email: 'investigator@vigilance.com',
    role: 'INVESTIGATOR',
  };

  const adminUser = {
    id: 'usr_test_2',
    username: 'admin_test',
    email: 'admin@vigilance.com',
    role: 'ADMIN',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(healthApi, 'getBackendHealth').mockResolvedValue({
      status: 'ok',
      service: 'project-vigilance-backend',
      uptime_seconds: 100,
      database_connected: true,
    });
    vi.spyOn(healthApi, 'getMLHealth').mockResolvedValue({
      status: 'ok',
      ml_service: { status: 'ok', models_loaded: { xgboost: true, isolation_forest: true } },
    });
    vi.spyOn(authApi, 'listUsers').mockResolvedValue({
      success: true,
      data: [adminUser, investigatorUser],
    });
    vi.spyOn(configurationApi, 'getConfiguration').mockResolvedValue({
      success: true,
      data: {
        configuration_id: 'default_baseline_v1',
        description: 'Default baseline configuration',
        thresholds: { low_max: 30, medium_max: 60, high_max: 80, critical_max: 100 },
        compliance_rules: {
          alert_threshold: 60,
          near_regulatory_threshold_ratio: 0.9,
          regulatory_ctr_boundary: 10000.0,
        },
        version: 1,
        is_active: true,
        updated_by: 'SYSTEM',
        updated_at: '2026-10-06T20:00:00Z',
      },
    });
  });

  it('redirects unauthenticated user from protected route "/" to "/login"', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    // Unauthenticated user is redirected to Login
    expect(screen.getByText('Personnel Authentication')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log In to Surveillance Operations/i })).toBeInTheDocument();
  });

  it('renders Dashboard for authenticated INVESTIGATOR at root path "/"', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('AML Surveillance Operations')).toBeInTheDocument();
    expect(screen.getAllByText(/PROJECT VIGILANCE/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders AnalyzeTransaction page for authenticated INVESTIGATOR at "/analyze"', () => {
    render(
      <MemoryRouter initialEntries={['/analyze']}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Evaluate Transaction Risk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run AI Risk Evaluation/i })).toBeInTheDocument();
  });

  it('restricts non-admin INVESTIGATOR from "/configuration" via RoleGuard', () => {
    render(
      <MemoryRouter initialEntries={['/configuration']}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText(/requires the/i)).toBeInTheDocument();
  });

  it('allows authenticated ADMIN to access "/configuration"', async () => {
    render(
      <MemoryRouter initialEntries={['/configuration']}>
        <AuthProvider initialUser={adminUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('System Configuration & Risk Thresholds')).toBeInTheDocument();
    expect(screen.getByText(/Reset to Approved Baseline/i)).toBeInTheDocument();
  });

  it('allows authenticated ADMIN to access "/users" User Management', async () => {
    render(
      <MemoryRouter initialEntries={['/users']}>
        <AuthProvider initialUser={adminUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('System User Management')).toBeInTheDocument();
  });

  it('renders NotFound component for unknown routes when authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/some/non-existent/path']}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/404/i)).toBeInTheDocument();
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
  });

  it('renders Analysis page with empty state when navigated without record', () => {
    render(
      <MemoryRouter initialEntries={['/analysis']}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('No Analysis Available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Evaluate a Transaction/i })).toBeInTheDocument();
  });

  it('renders Analysis dossier when record is provided in navigation state', () => {
    const mockRecord = {
      transaction_id: 'TX-V2-242571',
      xgb_probability: 0.9635,
      xgb_score: 96.35,
      isolation_forest_raw_score: -0.15,
      isolation_forest_score: 62.5,
      final_risk_score: 89.58,
      risk_tier: 'CRITICAL',
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/analysis', state: { analysisResult: mockRecord } }]}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('AML Investigation Dossier')).toBeInTheDocument();
    expect(screen.getByText('Operational Risk Score')).toBeInTheDocument();
  });

  it('allows signing out and returns user to login view', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider initialUser={investigatorUser}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('AML Surveillance Operations')).toBeInTheDocument();

    const signOutBtn = screen.getByRole('button', { name: /Sign Out/i });
    fireEvent.click(signOutBtn);

    expect(screen.getByText('Personnel Authentication')).toBeInTheDocument();
  });
});
