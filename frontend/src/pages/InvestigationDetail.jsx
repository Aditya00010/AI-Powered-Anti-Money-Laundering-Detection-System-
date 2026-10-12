/**
 * Project Vigilance — Investigation Case Detail & Evidence Dossier
 * ================================================================
 * Comprehensive case view featuring immutable risk snapshot, mathematical breakdown,
 * supervised & unsupervised model signals, behavioral velocity, graph topology,
 * compliance rules, lifecycle status transitions, investigator assignment, and audit history.
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import ComponentBreakdown from '../components/risk/ComponentBreakdown';
import ModelSignalsCard from '../components/evidence/ModelSignalsCard';
import BehavioralEvidenceCard from '../components/evidence/BehavioralEvidenceCard';
import GraphEvidenceCard from '../components/evidence/GraphEvidenceCard';
import ComplianceSignalsCard from '../components/evidence/ComplianceSignalsCard';
import AmlAnomaliesCard from '../components/evidence/AmlAnomaliesCard';
import MoneyFlowGraph from '../components/evidence/MoneyFlowGraph';
import { useAuth } from '../context/AuthContext';
import { resolveEvidence } from '../utils/explainabilityUtils';
import {
  getInvestigation,
  updateInvestigationStatus,
  assignInvestigation,
  addInvestigationNote,
} from '../api/investigationApi';

const STATUS_OPTIONS = ['OPEN', 'INVESTIGATING', 'ESCALATED', 'CLOSED'];

export function InvestigationDetail() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const role = user?.role || 'INVESTIGATOR';

  const isManager = role === 'MANAGER';
  const isAdmin = role === 'ADMIN';
  const canEditCase = role === 'INVESTIGATOR' || role === 'ADMIN' || role === 'COMPLIANCE_OFFICER';

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Status mutation state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Assignment mutation state
  const [assigneeInput, setAssigneeInput] = useState('');
  const [updatingAssignee, setUpdatingAssignee] = useState(false);

  // New Note state
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const fetchCaseDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInvestigation(caseId);
      const data = res.data || res;
      setCaseData(data);
      setSelectedStatus(data.status);
      setAssigneeInput(data.assigned_to || '');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      fetchCaseDetails();
    }
  }, [caseId]);

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (!selectedStatus || selectedStatus === caseData.status) return;

    setUpdatingStatus(true);
    setError(null);
    setActionSuccess(null);
    try {
      await updateInvestigationStatus(caseId, {
        status: selectedStatus,
        note: statusNote.trim() || undefined,
      });
      setStatusNote('');
      setActionSuccess(`Case status transitioned to ${selectedStatus}.`);
      await fetchCaseDetails();
    } catch (err) {
      setError(err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssigneeUpdate = async (e) => {
    e.preventDefault();
    setUpdatingAssignee(true);
    setError(null);
    setActionSuccess(null);
    try {
      await assignInvestigation(caseId, {
        assigned_to: assigneeInput.trim() || null,
      });
      setActionSuccess(`Assignment updated to ${assigneeInput.trim() || 'Unassigned'}.`);
      await fetchCaseDetails();
    } catch (err) {
      setError(err);
    } finally {
      setUpdatingAssignee(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    setAddingNote(true);
    setError(null);
    setActionSuccess(null);
    try {
      await addInvestigationNote(caseId, { text: newNoteText.trim() });
      setNewNoteText('');
      setActionSuccess('Investigation note recorded.');
      await fetchCaseDetails();
    } catch (err) {
      setError(err);
    } finally {
      setAddingNote(false);
    }
  };

  const getTierBadgeVariant = (tier) => {
    switch (tier?.toUpperCase()) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'medium';
      case 'LOW':
        return 'low';
      default:
        return 'default';
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'OPEN':
        return { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: '#3b82f6' };
      case 'INVESTIGATING':
        return { backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderColor: '#f59e0b' };
      case 'ESCALATED':
        return { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', borderColor: '#ef4444' };
      case 'CLOSED':
        return { backgroundColor: 'rgba(107, 114, 128, 0.2)', color: '#9ca3af', borderColor: '#6b7280' };
      default:
        return {};
    }
  };

  if (loading) {
    return <LoadingSpinner message={`Loading case dossier ${caseId}...`} />;
  }

  if (error && !caseData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <ErrorAlert error={error} />
        <Link to="/investigations">
          <Button variant="secondary">← Back to Investigations Queue</Button>
        </Link>
      </div>
    );
  }

  if (!caseData) {
    return (
      <Card title="Case Not Found">
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          No investigation record found for identifier {caseId}.
        </p>
        <Link to="/investigations">
          <Button variant="secondary">Back to Queue</Button>
        </Link>
      </Card>
    );
  }

  // Structured explainability evidence
  const evidence = resolveEvidence(caseData, caseData.analysis?.features_snapshot);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. Header & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <Link to="/investigations" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>
              ← Queue
            </Link>
            <span style={{ color: 'var(--text-dim)' }}>/</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Case: {caseData.case_id}
            </h1>
            <span
              style={{
                display: 'inline-block',
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: '1px solid transparent',
                ...getStatusBadgeStyle(caseData.status),
              }}
            >
              {caseData.status}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Originating Transaction:{' '}
            <Link
              to={`/analysis/${caseData.transaction_id}`}
              style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}
            >
              {caseData.transaction_id}
            </Link>{' '}
            | Opened by <strong style={{ color: 'var(--text-main)' }}>{caseData.opened_by}</strong> on{' '}
            {new Date(caseData.created_at).toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={fetchCaseDetails}>
            🔄 Refresh
          </Button>
          <Link to={`/analysis/${caseData.transaction_id}`}>
            <Button variant="secondary">📊 View AML Analysis</Button>
          </Link>
        </div>
      </div>

      {actionSuccess && (
        <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* 2. Case Summary Card */}
      <Card title="Case Information & Surveillance Overview">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Case ID</div>
            <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{caseData.case_id}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Transaction ID</div>
            <div style={{ fontFamily: 'var(--font-mono)' }}>{caseData.transaction_id}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Assigned Investigator</div>
            <div style={{ fontWeight: 600 }}>{caseData.assigned_to ? `👤 ${caseData.assigned_to}` : 'Unassigned'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Risk Scoring Snapshot</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
              {typeof caseData.risk_score_snapshot === 'number' ? caseData.risk_score_snapshot.toFixed(1) : 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Priority & Risk Tier</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
              <Badge variant={getTierBadgeVariant(caseData.risk_tier_snapshot)}>
                {caseData.risk_tier_snapshot}
              </Badge>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                ({caseData.priority} Priority)
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Mathematical Risk Score Breakdown (80/20 Formula) */}
      <ComponentBreakdown
        xgbProbability={evidence?.risk_breakdown?.xgb_probability ?? (caseData.xgb_score_snapshot / 100.0)}
        xgbScore={caseData.xgb_score_snapshot ?? 0.0}
        ifRawScore={evidence?.risk_breakdown?.isolation_forest_raw_score ?? 0.0}
        ifScore={caseData.isolation_forest_score_snapshot ?? 0.0}
        finalRiskScore={caseData.risk_score_snapshot ?? 0.0}
        riskTier={caseData.risk_tier_snapshot ?? 'LOW'}
      />

      {/* 4. The 6 Canonical AML Anomalies */}
      <AmlAnomaliesCard
        evidence={evidence}
        features={caseData.analysis?.features_snapshot || caseData.features_snapshot}
      />

      {/* 5. Interactive Visual Money Flow & Network Topology Diagram */}
      <MoneyFlowGraph
        evidence={evidence}
        features={caseData.analysis?.features_snapshot || caseData.features_snapshot}
        transactionId={caseData.transaction_id}
      />

      {/* 4. Model Evidence (XGBoost & Isolation Forest Signals) */}
      {evidence?.model_signals && (
        <ModelSignalsCard modelSignals={evidence.model_signals} />
      )}

      {/* 5. Behavioral Evidence (Velocity, History, Entities) */}
      {evidence?.behavioral_evidence && (
        <BehavioralEvidenceCard behavioralEvidence={evidence.behavioral_evidence} />
      )}

      {/* 6. Graph Evidence (Network Topology, Cycles, Louvain) */}
      {evidence?.graph_evidence && (
        <GraphEvidenceCard graphEvidence={evidence.graph_evidence} />
      )}

      {/* 7. Compliance & Regulatory Signals (CTR, Structuring, Rails) */}
      {evidence?.compliance_signals && (
        <ComplianceSignalsCard complianceSignals={evidence.compliance_signals} />
      )}

      {/* 8. Case Actions (Triage & Assignment) */}
      {canEditCase ? (
        <Card title="Investigation Triage & Case Actions">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* Status Transition Form */}
            <form onSubmit={handleStatusUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Transition Lifecycle Status</div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                disabled={updatingStatus}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Optional transition reason / note..."
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                disabled={updatingStatus}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                }}
              />

              <Button
                type="submit"
                variant="primary"
                isLoading={updatingStatus}
                disabled={updatingStatus || selectedStatus === caseData.status}
              >
                Update Status
              </Button>
            </form>

            {/* Assignment Form */}
            <form onSubmit={handleAssigneeUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Reassign Case Investigator</div>
              <input
                type="text"
                placeholder="Investigator username (or leave blank to unassign)..."
                value={assigneeInput}
                onChange={(e) => setAssigneeInput(e.target.value)}
                disabled={updatingAssignee}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                }}
              />

              <Button
                type="submit"
                variant="secondary"
                isLoading={updatingAssignee}
                disabled={updatingAssignee || assigneeInput.trim() === (caseData.assigned_to || '')}
              >
                Save Assignment
              </Button>
            </form>
          </div>
        </Card>
      ) : isManager ? (
        <Card>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            ℹ️ <strong>Managerial Oversight Mode:</strong> Case mutations and status updates are reserved for assigned investigators and compliance officers.
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            🔒 <strong>Read-Only Access:</strong> Viewing permissions only. Status transitions and assignment modifications require Investigator or Administrator credentials.
          </div>
        </Card>
      )}

      {/* 9. Investigation Notes Thread */}
      <Card title={`Investigation Notes (${caseData.notes?.length || 0})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {caseData.notes && caseData.notes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {caseData.notes.map((n, idx) => (
                <div
                  key={n.note_id || idx}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--brand-primary)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>👤 {n.author}</span>
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                    {n.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', fontStyle: 'italic' }}>
              No investigation notes recorded yet.
            </p>
          )}

          {!isManager && (
            <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <textarea
                rows={3}
                placeholder="Record investigative finding, evidence, or coordination note..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                disabled={addingNote}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" isLoading={addingNote} disabled={addingNote || !newNoteText.trim()}>
                  Add Investigation Note
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* 10. Activity & Audit History */}
      <Card title={`Chronological Activity & Audit History (${caseData.actions?.length || 0})`}>
        {caseData.actions && caseData.actions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {caseData.actions.map((act, idx) => (
              <div
                key={act._id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  padding: '0.65rem 0',
                  borderBottom: idx < caseData.actions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div
                  style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {act.action_type}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    {act.description}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    By <strong>{act.performed_by}</strong> • {new Date(act.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', fontStyle: 'italic' }}>
            No audit actions recorded.
          </p>
        )}
      </Card>
    </div>
  );
}

export default InvestigationDetail;
