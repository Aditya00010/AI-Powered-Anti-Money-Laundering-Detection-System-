import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyzeTransaction from '../src/pages/AnalyzeTransaction';
import * as analysisApi from '../src/api/analysisApi';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('AnalyzeTransaction Page Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders form inputs and quick load buttons', () => {
    renderWithRouter(<AnalyzeTransaction />);

    expect(screen.getByText('Evaluate Transaction Risk')).toBeInTheDocument();
    expect(screen.getByLabelText(/Transaction ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Approved ML Features/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load Inlier Transaction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load Laundering Typology/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run AI Risk Evaluation/i })).toBeInTheDocument();
  });

  it('validates empty features JSON before calling API', async () => {
    const analyzeSpy = vi.spyOn(analysisApi, 'analyzeTransaction');
    renderWithRouter(<AnalyzeTransaction />);

    const submitBtn = screen.getByRole('button', { name: /Run AI Risk Evaluation/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Feature payload is required/i)).toBeInTheDocument();
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it('validates malformed JSON syntax before calling API', async () => {
    const analyzeSpy = vi.spyOn(analysisApi, 'analyzeTransaction');
    renderWithRouter(<AnalyzeTransaction />);

    const textarea = screen.getByLabelText(/Approved ML Features/i);
    fireEvent.change(textarea, { target: { value: '{ invalid_json: ' } });

    const submitBtn = screen.getByRole('button', { name: /Run AI Risk Evaluation/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Invalid JSON syntax in features payload/i)).toBeInTheDocument();
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it('loads presets correctly into input fields', () => {
    renderWithRouter(<AnalyzeTransaction />);

    const loadCleanBtn = screen.getByRole('button', { name: /Load Inlier Transaction/i });
    fireEvent.click(loadCleanBtn);

    const txInput = screen.getByLabelText(/Transaction ID/i);
    const textarea = screen.getByLabelText(/Approved ML Features/i);

    expect(txInput.value).toBe('TX-V2-200586');
    expect(textarea.value).toContain('"amount": 4500');

    const loadCriticalBtn = screen.getByRole('button', { name: /Load Laundering Typology/i });
    fireEvent.click(loadCriticalBtn);

    expect(txInput.value).toBe('TX-V2-242571');
    expect(textarea.value).toContain('"amount": 490000');
  });

  it('successfully evaluates transaction and renders risk results', async () => {
    const mockResponse = {
      transaction_id: 'TX-V2-242571',
      xgb_probability: 0.9635,
      xgb_score: 96.35,
      isolation_forest_raw_score: -0.15,
      isolation_forest_score: 62.5,
      final_risk_score: 89.58,
      risk_tier: 'CRITICAL',
      rule_violations: [],
      timestamp: '2026-10-06T18:00:00Z',
    };

    vi.spyOn(analysisApi, 'analyzeTransaction').mockResolvedValue(mockResponse);

    renderWithRouter(<AnalyzeTransaction />);

    // Load suspicious preset
    fireEvent.click(screen.getByRole('button', { name: /Load Laundering Typology/i }));

    // Click submit
    fireEvent.click(screen.getByRole('button', { name: /Run AI Risk Evaluation/i }));

    // Verify loading / success
    await waitFor(() => {
      expect(screen.getByText('Evaluation Output')).toBeInTheDocument();
      expect(screen.getByText('Operational Risk Score')).toBeInTheDocument();
      expect(screen.getByText('89.58')).toBeInTheDocument();
      expect(screen.getByText('Critical Risk')).toBeInTheDocument();
    });
  });

  it('handles 503 ML Service Unavailable gracefully', async () => {
    const err = new Error('ML inference service is unavailable (503). Please verify FastAPI is running.');
    err.statusCode = 503;
    vi.spyOn(analysisApi, 'analyzeTransaction').mockRejectedValue(err);

    renderWithRouter(<AnalyzeTransaction />);
    fireEvent.click(screen.getByRole('button', { name: /Load Inlier Transaction/i }));
    fireEvent.click(screen.getByRole('button', { name: /Run AI Risk Evaluation/i }));

    await waitFor(() => {
      expect(screen.getByText(/ML inference service is unavailable/i)).toBeInTheDocument();
    });
  });

  it('handles 504 Gateway Timeout gracefully', async () => {
    const err = new Error('Request to AML backend timed out. ML service may be experiencing high load.');
    err.statusCode = 504;
    vi.spyOn(analysisApi, 'analyzeTransaction').mockRejectedValue(err);

    renderWithRouter(<AnalyzeTransaction />);
    fireEvent.click(screen.getByRole('button', { name: /Load Inlier Transaction/i }));
    fireEvent.click(screen.getByRole('button', { name: /Run AI Risk Evaluation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Request to AML backend timed out/i)).toBeInTheDocument();
    });
  });

  it('handles 400 Bad Request validation error gracefully', async () => {
    const err = new Error('Invalid request payload. Missing required features.');
    err.statusCode = 400;
    vi.spyOn(analysisApi, 'analyzeTransaction').mockRejectedValue(err);

    renderWithRouter(<AnalyzeTransaction />);
    fireEvent.click(screen.getByRole('button', { name: /Load Inlier Transaction/i }));
    fireEvent.click(screen.getByRole('button', { name: /Run AI Risk Evaluation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Missing required features/i)).toBeInTheDocument();
    });
  });
});
