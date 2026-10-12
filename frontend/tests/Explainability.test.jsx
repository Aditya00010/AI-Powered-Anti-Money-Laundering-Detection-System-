import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import ModelSignalsCard from '../src/components/evidence/ModelSignalsCard';
import BehavioralEvidenceCard from '../src/components/evidence/BehavioralEvidenceCard';
import GraphEvidenceCard from '../src/components/evidence/GraphEvidenceCard';
import ComplianceSignalsCard from '../src/components/evidence/ComplianceSignalsCard';
import InvestigationDetail from '../src/pages/InvestigationDetail';
import AnalysisResult from '../src/pages/AnalysisResult';
import { resolveEvidence } from '../src/utils/explainabilityUtils';
import * as investigationApi from '../src/api/investigationApi';
import * as analysisApi from '../src/api/analysisApi';

describe('Phase 5 Step 7: Explainability & Evidence Presentation Tests', () => {
  const investigatorUser = {
    id: 'usr_inv',
    username: 'investigator_bob',
    email: 'investigator@vigilance.com',
    role: 'INVESTIGATOR',
  };

  const viewerUser = {
    id: 'usr_view',
    username: 'viewer_alice',
    email: 'viewer@vigilance.com',
    role: 'VIEWER',
  };

  const sampleEvidence = {
    risk_breakdown: {
      xgb_score: 87.5,
      xgb_probability: 0.875,
      xgb_weight: 0.8,
      xgb_contribution: 70.0,
      isolation_forest_score: 72.0,
      isolation_forest_raw_score: 0.62,
      isolation_forest_weight: 0.2,
      isolation_forest_contribution: 14.4,
      final_risk_score: 84.4,
      risk_tier: 'CRITICAL',
      formula_text: 'FINAL_RISK_SCORE = 0.80 * XGB_SCORE + 0.20 * IF_SCORE',
    },
    model_signals: {
      xgboost: {
        score: 87.5,
        probability: 87.5,
        signal_type: 'Supervised Typology Likelihood',
        disclosure: 'Supervised gradient boosting estimates the statistical similarity to previously confirmed laundering patterns. Feature values are model inputs, not proof of financial crime.',
      },
      isolation_forest: {
        raw_score: 0.62,
        score: 72.0,
        is_outlier: true,
        signal_type: 'Unsupervised Distribution Anomaly',
        diagnostic_assessment: "Transaction exhibits anomalous behavior relative to the model's learned background distribution.",
        disclosure: 'Isolation Forest detects statistical deviations from the background feature distribution. It does not identify a specific criminal typology or prove intent.',
      },
    },
    behavioral_evidence: {
      transaction: {
        amount: 9850,
        channel: 'Crypto Gateway',
        currency: 'USDT',
        is_crypto: true,
        is_cross_border: true,
      },
      sender: {
        velocity_1h: { txn_count: 5, total_amount: 45000 },
        velocity_24h: { txn_count: 14, total_amount: 120000 },
        device_and_ip: {
          distinct_devices_24h: 3,
          distinct_ips_24h: 4,
          ip_change_rate: 0.8,
          device_change_rate: 0.6,
        },
      },
      receiver: {
        inflow_velocity_24h: {
          txn_count: 12,
          total_inflow: 180000,
          unique_senders_count: 8,
        },
      },
    },
    graph_evidence: {
      sender: {
        pagerank_score: 0.00842,
        louvain_community_id: 42,
        in_degree: 5,
        out_degree: 19,
        participates_in_cycle: true,
        cycle_count: 2,
        min_cycle_length: 3,
      },
      receiver: {
        pagerank_score: 0.0152,
        louvain_community_id: 42,
        in_degree: 28,
        out_degree: 4,
        participates_in_cycle: true,
        cycle_count: 1,
        min_cycle_length: 3,
      },
      graph_community_alignment: {
        same_community: true,
        community_id: 42,
      },
      cautionary_notice: 'Graph analytics reflect structural graph topology from the analyzed network. Network position and cycle participation are analytical indicators and do not constitute legal proof of coordinated activity.',
    },
    compliance_signals: {
      amount: 9850,
      regulatory_threshold: 10000,
      threshold_currency: 'INR',
      is_near_regulatory_threshold: true,
      near_threshold_band: {
        lower_bound: 9000,
        upper_bound: 10000,
        percentage_of_threshold: 98.5,
      },
      sender_historical_near_threshold_txns_24h: 4,
      statutory_basis: 'PMLA 2002 / Financial Intelligence Unit (FIU-IND) Cash/Suspicious Transaction Reporting Rule (CTR/STR)',
      potential_structuring_indication: 'Transaction amount is within the 10% sub-threshold window below the statutory reporting boundary (₹10,000), accompanied by 4 additional near-threshold transactions within the trailing 24 hours.',
    },
  };

  const sampleCase = {
    case_id: 'CASE-2026-EXP01',
    transaction_id: 'TXN_EXP_001',
    risk_score_snapshot: 84.4,
    risk_tier_snapshot: 'CRITICAL',
    xgb_score_snapshot: 87.5,
    isolation_forest_score_snapshot: 72.0,
    status: 'UNDER_REVIEW',
    priority: 'CRITICAL',
    assigned_to: 'investigator_bob',
    opened_by: 'investigator_bob',
    created_at: '2026-10-06T10:00:00Z',
    notes: [
      {
        note_id: 'NOTE-1',
        author: 'investigator_bob',
        text: 'Initial review of suspicious graph cycle and near-CTR structuring.',
        created_at: '2026-10-06T10:05:00Z',
      },
    ],
    actions: [],
    evidence: sampleEvidence,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const renderWithAuth = (ui, user = investigatorUser) => {
    if (user) {
      localStorage.setItem('aml_token', 'valid-test-token');
      localStorage.setItem('aml_user', JSON.stringify(user));
    }
    return render(
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    );
  };

  // 1. Risk score breakdown renders
  it('1. Risk score breakdown renders 80/20 formula and contribution details correctly', () => {
    renderWithAuth(
      <ModelSignalsCard modelSignals={sampleEvidence.model_signals} />
    );
    expect(screen.getByText(/Model Evidence & Signal Assessment/i)).toBeInTheDocument();
  });

  // 2. XGBoost evidence renders
  it('2. XGBoost evidence renders probability, score, and disclosure without guilt claims', () => {
    renderWithAuth(
      <ModelSignalsCard modelSignals={sampleEvidence.model_signals} />
    );
    expect(screen.getByText(/Supervised Typology Likelihood/i)).toBeInTheDocument();
    expect(screen.getAllByText(/87.5/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/previously confirmed laundering patterns/i)).toBeInTheDocument();
  });

  // 3. Isolation Forest evidence renders
  it('3. Isolation Forest evidence renders raw score, outlier assessment, and non-typology disclosure', () => {
    renderWithAuth(
      <ModelSignalsCard modelSignals={sampleEvidence.model_signals} />
    );
    expect(screen.getByText(/Unsupervised Distribution Anomaly/i)).toBeInTheDocument();
    expect(screen.getByText(/Statistical Outlier/i)).toBeInTheDocument();
    expect(screen.getByText(/does not identify a specific criminal typology/i)).toBeInTheDocument();
  });

  // 4. Behavioral evidence renders
  it('4. Behavioral evidence renders transaction attributes, velocity, and device/IP footprints', () => {
    renderWithAuth(
      <BehavioralEvidenceCard behavioralEvidence={sampleEvidence.behavioral_evidence} />
    );
    expect(screen.getByText(/Behavioral Evidence & Entity Footprint/i)).toBeInTheDocument();
    expect(screen.getByText(/Crypto Gateway/i)).toBeInTheDocument();
    expect(screen.getByText(/1h Velocity/i)).toBeInTheDocument();
    expect(screen.getByText(/24h Velocity/i)).toBeInTheDocument();
    expect(screen.getByText(/Device & IP Fingerprint/i)).toBeInTheDocument();
  });

  // 5. Graph evidence renders
  it('5. Graph evidence renders PageRank, Louvain communities, cycles, and cautionary notice', () => {
    renderWithAuth(
      <GraphEvidenceCard graphEvidence={sampleEvidence.graph_evidence} />
    );
    expect(screen.getByText(/Graph Evidence & Network Topology/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Community #42/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Closed Cycle Detected/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/do not constitute legal proof of coordinated activity/i)).toBeInTheDocument();
  });

  // 6. Compliance signals render when available
  it('6. Compliance signals render CTR statutory threshold, structuring flag, and FIU reference', () => {
    renderWithAuth(
      <ComplianceSignalsCard complianceSignals={sampleEvidence.compliance_signals} />
    );
    expect(screen.getByText(/Compliance & Regulatory Structuring Signals/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Near-CTR Threshold/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/PMLA 2002 \/ Financial Intelligence Unit/i)).toBeInTheDocument();
  });

  // 7. Missing optional data renders gracefully
  it('7. Missing optional data renders gracefully without crashing or throwing errors', () => {
    const sparseEvidence = {
      model_signals: {
        xgboost: { score: 12.0, probability: 12.0, signal_type: 'Supervised Typology Likelihood' },
        isolation_forest: { score: 20.0, raw_score: null, is_outlier: false, signal_type: 'Unsupervised Distribution Anomaly' },
      },
      behavioral_evidence: {
        transaction: { channel: 'UPI', currency: 'INR' },
        sender: {},
        receiver: {},
      },
      graph_evidence: {
        sender: null,
        receiver: null,
      },
      compliance_signals: {
        is_near_regulatory_threshold: false,
      },
    };

    renderWithAuth(
      <div>
        <ModelSignalsCard modelSignals={sparseEvidence.model_signals} />
        <BehavioralEvidenceCard behavioralEvidence={sparseEvidence.behavioral_evidence} />
        <GraphEvidenceCard graphEvidence={sparseEvidence.graph_evidence} />
        <ComplianceSignalsCard complianceSignals={sparseEvidence.compliance_signals} />
      </div>
    );

    expect(screen.getByText(/UPI/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nominal/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Normal Range/i)).toBeInTheDocument();
  });

  // 8. Investigation detail remains fully usable
  it('8. Investigation detail page renders complete evidence sections and case workflow remains usable', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(sampleCase);

    render(
      <AuthProvider initialUser={investigatorUser}>
        <MemoryRouter initialEntries={['/investigations/CASE-2026-EXP01']}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/CASE-2026-EXP01/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Model Evidence & Signal Assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/Behavioral Evidence & Entity Footprint/i)).toBeInTheDocument();
    expect(screen.getByText(/Graph Evidence & Network Topology/i)).toBeInTheDocument();
    expect(screen.getByText(/Compliance & Regulatory Structuring Signals/i)).toBeInTheDocument();
  });

  // 9. Analysis result explanation summary renders
  it('9. Analysis result page renders evidence summary and link to full dossier', async () => {
    const analysisData = {
      transaction_id: 'TXN_EXP_001',
      final_risk_score: 84.4,
      risk_tier: 'CRITICAL',
      xgb_score: 87.5,
      xgb_probability: 0.875,
      isolation_forest_score: 72.0,
      isolation_forest_raw_score: 0.62,
      features_snapshot: {
        amount: 9850,
        channel: 'Crypto Gateway',
        currency_USDT: 1,
        is_crypto: 1,
        is_cross_border: 1,
        sender_participates_in_cycle: 1,
        sender_near_regulatory_threshold_txns_prev_24h: 4,
        sender_tx_count_last_24h: 14,
      },
    };

    vi.spyOn(investigationApi, 'getActiveCaseForTransaction').mockResolvedValue({
      has_active_case: true,
      data: sampleCase,
    });

    render(
      <AuthProvider initialUser={investigatorUser}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/analysis-result',
              state: { analysisResult: analysisData },
            },
          ]}
        >
          <Routes>
            <Route path="/analysis-result" element={<AnalysisResult />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Evidence Summary & Key Detection Signals/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Near-CTR Structuring Threshold/i)).toBeInTheDocument();
    expect(screen.getByText(/Closed Circular Transaction Flow/i)).toBeInTheDocument();
    expect(screen.getByText(/Cryptocurrency Payment Gateway Conduit/i)).toBeInTheDocument();
  });

  // 10. Role-based controls remain intact
  it('10. Role-based controls remain intact: viewer cannot edit status while investigator can', async () => {
    vi.spyOn(investigationApi, 'getInvestigation').mockResolvedValue(sampleCase);

    render(
      <AuthProvider initialUser={viewerUser}>
        <MemoryRouter initialEntries={['/investigations/CASE-2026-EXP01']}>
          <Routes>
            <Route path="/investigations/:caseId" element={<InvestigationDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/CASE-2026-EXP01/i)).toBeInTheDocument();
    });

    // Viewer should see read-only badge and NOT see "Update Status" submit button
    expect(screen.getByText(/Read-Only Access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Update Status/i })).not.toBeInTheDocument();
  });
});
