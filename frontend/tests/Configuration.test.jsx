import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import Configuration from '../src/pages/ConfigurationPlaceholder';
import * as configurationApi from '../src/api/configurationApi';

describe('Configuration Page Component Tests', () => {
  const adminUser = {
    id: 'usr_admin',
    username: 'admin_test',
    email: 'admin@vigilance.com',
    role: 'ADMIN',
  };

  const investigatorUser = {
    id: 'usr_inv',
    username: 'investigator_test',
    email: 'investigator@vigilance.com',
    role: 'INVESTIGATOR',
  };

  const mockConfig = {
    low_max: 30.0,
    medium_max: 60.0,
    high_max: 80.0,
    critical_max: 100.0,
    alert_threshold: 60.0,
    near_regulatory_threshold_ratio: 0.90,
    regulatory_ctr_boundary: 1000000.0,
    updated_by_username: 'system_default',
    updated_at: '2026-10-06T18:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('restricts non-admin user from viewing configuration controls', () => {
    render(
      <MemoryRouter>
        <AuthProvider initialUser={investigatorUser}>
          <Configuration />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText(/requires the/i)).toBeInTheDocument();
  });

  it('renders operational threshold form inputs for authenticated ADMIN', async () => {
    vi.spyOn(configurationApi, 'getConfiguration').mockResolvedValue(mockConfig);

    render(
      <MemoryRouter>
        <AuthProvider initialUser={adminUser}>
          <Configuration />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('System Configuration & Risk Thresholds')).toBeInTheDocument();
      expect(screen.getByLabelText(/LOW Risk Maximum/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/MEDIUM Risk Maximum/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/HIGH Risk Maximum/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/CRITICAL Risk/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save Operational Configuration/i })).toBeInTheDocument();
    });
  });

  it('validates threshold ordering on frontend before submitting', async () => {
    vi.spyOn(configurationApi, 'getConfiguration').mockResolvedValue(mockConfig);
    const updateSpy = vi.spyOn(configurationApi, 'updateConfiguration');

    render(
      <MemoryRouter>
        <AuthProvider initialUser={adminUser}>
          <Configuration />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/LOW Risk Maximum/i)).toBeInTheDocument();
    });

    // Make low_max greater than medium_max
    const lowInput = screen.getByLabelText(/LOW Risk Maximum/i);
    fireEvent.change(lowInput, { target: { value: '75' } });

    const submitBtn = screen.getByRole('button', { name: /Save Operational Configuration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/LOW threshold \(75\) must be strictly less than MEDIUM threshold/i)).toBeInTheDocument();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  it('successfully updates configuration when valid values are submitted', async () => {
    vi.spyOn(configurationApi, 'getConfiguration').mockResolvedValue(mockConfig);
    const updatedMock = { ...mockConfig, high_max: 75.0, updated_by_username: 'admin_test' };
    vi.spyOn(configurationApi, 'updateConfiguration').mockResolvedValue({ success: true, data: updatedMock });

    render(
      <MemoryRouter>
        <AuthProvider initialUser={adminUser}>
          <Configuration />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/HIGH Risk Maximum/i)).toBeInTheDocument();
    });

    const highInput = screen.getByLabelText(/HIGH Risk Maximum/i);
    fireEvent.change(highInput, { target: { value: '75' } });

    const submitBtn = screen.getByRole('button', { name: /Save Operational Configuration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(configurationApi.updateConfiguration).toHaveBeenCalled();
      expect(screen.getByText(/Operational risk thresholds saved and applied successfully/i)).toBeInTheDocument();
    });
  });

  it('prompts confirmation and resets configuration back to baseline', async () => {
    vi.spyOn(configurationApi, 'getConfiguration').mockResolvedValue(mockConfig);
    vi.spyOn(configurationApi, 'resetConfiguration').mockResolvedValue({ success: true, data: mockConfig });

    render(
      <MemoryRouter>
        <AuthProvider initialUser={adminUser}>
          <Configuration />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reset to Approved Baseline/i })).toBeInTheDocument();
    });

    // Click Reset
    fireEvent.click(screen.getByRole('button', { name: /Reset to Approved Baseline/i }));

    // Confirm warning banner appears
    expect(screen.getByText(/Confirm Reset to Approved Baseline/i)).toBeInTheDocument();

    // Click confirm
    fireEvent.click(screen.getByRole('button', { name: /Yes, Reset Configuration/i }));

    await waitFor(() => {
      expect(configurationApi.resetConfiguration).toHaveBeenCalled();
      expect(screen.getByText(/Restored to approved baseline configuration/i)).toBeInTheDocument();
    });
  });
});
