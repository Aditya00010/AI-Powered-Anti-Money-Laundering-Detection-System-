import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import Investigations from '../src/pages/Investigations';
import InvestigationDetail from '../src/pages/InvestigationDetail';
import AnalysisResult from '../src/pages/AnalysisResult';
import * as investigationApi from '../src/api/investigationApi';
import * as analysisApi from '../src/api/analysisApi';

describe('Investigations & Case Management Frontend Tests', () => {
  const investigatorUser = {
    id: 'usr_inv',
    username: 'investigator_bob',
    email: 'investigator@vigilance.com',
    role: 'INVESTIGATOR',
  };

  const managerUser = {
    id: 'usr_mgr',
    username: 'manager_dan',
    email: 'manager@vigilance.com',
    role: 'MANAGER',
  };

  const mockCase = {
    case_id: 'CASE-2026-001',
    transaction_id: 'TXN_TEST_999',
    risk_score_snapshot: 85.5,
    risk_tier_snapshot: 'CRITICAL',
    xgb_score_snapshot: 87.0,
    isolation_forest_score_snapshot: 79.5,
    status: 'OPEN',
    priority: 'CRITICAL',
    assigned_to: 'investigator_bob',
    opened_by: 'investigator_bob',
    created_at: '2026-10-06T12:00:00Z',
    notes: [
      {
        note_id: 'NOTE-1',
        author: 'investigator_bob',
        text: 'Initial review of suspicious transaction completed.',
        created_at: '2026-10-06T12:05:00Z',
      },
    ],
    actions: [
      {
        _id: 'ACT-1',
        action_type: 'CASE_CREATED',
        performed_by: 'investigator_bob',
        description: 'Investigation case opened for transaction TXN_TEST_999.',
        timestamp: '2026-10-06T12:00:00Z',
      },
      {
        _id: 'ACT-2',
        action_type: 'NOTE_ADDED',
        performed_by: 'investigator_bob',
        description: 'Initial review note recorded.',
        timestamp: '2026-10-06T12:05:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. renders Investigations queue page header and filter controls', async () => {
    vi.spyOn(investigationApi, 'listInvestigations').mockResolvedValue({
      data: [mockCase],
      total: 1,
    });

    render(
      <MemoryRouter>
        <AuthProvider initialUser={investigatorUser}>
          <Investigations />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('AML Investigation Queue')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/CASE-170/i)).toBeInTheDocument();
    expect(await screen.findByText('CASE-2026-001')).toBeInTheDocument();
  });

  it('2. renders case list table with accurate triage data', async () => {
    vi.spyOn(investigationApi, 'listInvestigations').mockResolvedValue({
      data: [mockCase],
      total: 1,
    });

    render(
      <MemoryRouter>
        <AuthProvider initialUser={investigatorUser}>
          <Investigations />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('TXN_TEST_999')).toBeInTheDocument();
    expect(screen.getByText('85.5')).toBeInTheDocument();
    expect(screen.getAllByText('CRITICAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OPEN').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/investigator_bob/i)).toBeInTheDocument();
  });

  it('3. renders case detail page with information, risk summary, and actions', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(mockCase);

    render(
      <MemoryRouter initialEntries={['/investigations/CASE-2026-001']}>
        <AuthProvider initialUser={investigatorUser}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Case: CASE-2026-001')).toBeInTheDocument();
    expect(screen.getByText(/Risk Scoring Snapshot/i)).toBeInTheDocument();
    expect(screen.getByText('85.5')).toBeInTheDocument();
    expect(screen.getByText('Investigation Triage & Case Actions')).toBeInTheDocument();
    expect(screen.getByText(/Initial review of suspicious transaction completed./i)).toBeInTheDocument();
    expect(screen.getByText('CASE_CREATED')).toBeInTheDocument();
  });

  it('4. executes create investigation case flow from AnalysisResult', async () => {
    vi.spyOn(investigationApi, 'getActiveCaseForTransaction').mockResolvedValue({
      has_active_case: false,
      data: null,
    });
    const createSpy = vi.spyOn(investigationApi, 'createInvestigation').mockResolvedValue({
      data: mockCase,
    });

    const analysisData = {
      transaction_id: 'TXN_TEST_999',
      final_risk_score: 85.5,
      risk_tier: 'CRITICAL',
      xgb_score: 87.0,
      isolation_forest_score: 79.5,
      xgb_probability: 0.87,
      isolation_forest_raw_score: -0.15,
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/analysis/TXN_TEST_999', state: { analysisResult: analysisData } }]}>
        <AuthProvider initialUser={investigatorUser}>
          <Routes>
            <Route path="/analysis/:transactionId" element={<AnalysisResult />} />
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const createBtn = (await screen.findAllByRole('button', { name: /Create Investigation Case/i }))[0];
    expect(createBtn).toBeInTheDocument();

    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_id: 'TXN_TEST_999',
          priority: 'CRITICAL',
        })
      );
    });
  });

  it('5. executes add note flow in case detail', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(mockCase);
    const noteSpy = vi.spyOn(investigationApi, 'addInvestigationNote').mockResolvedValue({
      data: {
        ...mockCase,
        notes: [
          ...mockCase.notes,
          { note_id: 'NOTE-2', author: 'investigator_bob', text: 'Second note submitted.' },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={['/investigations/CASE-2026-001']}>
        <AuthProvider initialUser={investigatorUser}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Case: CASE-2026-001')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Record investigative finding/i);
    fireEvent.change(textarea, { target: { value: 'Second note submitted.' } });

    const addBtn = screen.getByRole('button', { name: /Add Investigation Note/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(noteSpy).toHaveBeenCalledWith('CASE-2026-001', { text: 'Second note submitted.' });
    });
  });

  it('6. executes status update flow in case detail', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(mockCase);
    const statusSpy = vi.spyOn(investigationApi, 'updateInvestigationStatus').mockResolvedValue({
      data: { ...mockCase, status: 'INVESTIGATING' },
    });

    render(
      <MemoryRouter initialEntries={['/investigations/CASE-2026-001']}>
        <AuthProvider initialUser={investigatorUser}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Case: CASE-2026-001')).toBeInTheDocument();

    const select = screen.getByDisplayValue('OPEN');
    fireEvent.change(select, { target: { value: 'INVESTIGATING' } });

    const updateBtn = screen.getByRole('button', { name: /Update Status/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith('CASE-2026-001', { status: 'INVESTIGATING' });
    });
  });

  it('7. executes assignment flow in case detail', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(mockCase);
    const assignSpy = vi.spyOn(investigationApi, 'assignInvestigation').mockResolvedValue({
      data: { ...mockCase, assigned_to: 'compliance_officer_sue' },
    });

    render(
      <MemoryRouter initialEntries={['/investigations/CASE-2026-001']}>
        <AuthProvider initialUser={investigatorUser}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Case: CASE-2026-001')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Investigator username/i);
    fireEvent.change(input, { target: { value: 'compliance_officer_sue' } });

    const saveBtn = screen.getByRole('button', { name: /Save Assignment/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('CASE-2026-001', {
        assigned_to: 'compliance_officer_sue',
      });
    });
  });

  it('8. renders error state cleanly when case fetch fails', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockRejectedValue(
      new Error('Investigation case not found')
    );

    render(
      <MemoryRouter initialEntries={['/investigations/CASE-NONEXISTENT']}>
        <AuthProvider initialUser={investigatorUser}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Investigation case not found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Investigations Queue/i })).toBeInTheDocument();
  });

  it('9. renders loading state while fetching cases', () => {
    vi.spyOn(investigationApi, 'listInvestigations').mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <AuthProvider initialUser={investigatorUser}>
          <Investigations />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading investigation cases/i)).toBeInTheDocument();
  });

  it('10. enforces role-based controls: displays read-only oversight banner for MANAGER', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(mockCase);

    render(
      <MemoryRouter initialEntries={['/investigations/CASE-2026-001']}>
        <AuthProvider initialUser={managerUser}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Managerial Oversight Mode/i)).toBeInTheDocument();
    expect(screen.queryByText('Investigation Triage & Case Actions')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Record investigative finding/i)).not.toBeInTheDocument();
  });
});
