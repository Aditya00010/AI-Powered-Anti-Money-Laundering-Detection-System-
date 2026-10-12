/**
 * Project Vigilance — AML Investigations Queue
 * ============================================
 * Overview of suspicious transaction investigation cases, triage priorities,
 * assignee distribution, filtering, and manual case initiation.
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import { listInvestigations, createInvestigation } from '../api/investigationApi';
import { useAuth } from '../context/AuthContext';
import { SAMPLE_TRANSACTIONS } from '../data/sampleTransactions';

const STATUS_OPTIONS = ['ALL', 'OPEN', 'INVESTIGATING', 'ESCALATED', 'CLOSED'];
const TIER_OPTIONS = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PRIORITY_OPTIONS = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function Investigations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlStatus = searchParams.get('status');
  const urlTier = searchParams.get('risk_tier');

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState(urlStatus || 'ALL');
  const [tierFilter, setTierFilter] = useState(urlTier || 'ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // New Case Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCaseTxnId, setNewCaseTxnId] = useState('');
  const [newCasePriority, setNewCasePriority] = useState('CRITICAL');
  const [newCaseNote, setNewCaseNote] = useState('');
  const [isSubmittingNewCase, setIsSubmittingNewCase] = useState(false);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    if (urlStatus) setStatusFilter(urlStatus);
    if (urlTier) setTierFilter(urlTier);
  }, [urlStatus, urlTier]);

  const { user, isLoading: authLoading } = useAuth();

  const fetchCases = async () => {
    if (authLoading || !user) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (tierFilter !== 'ALL') params.risk_tier = tierFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;

      const res = await listInvestigations(params);
      const caseList = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setCases(caseList);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchCases();
    }
  }, [statusFilter, tierFilter, priorityFilter, authLoading, user]);

  const filteredCases = cases.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.case_id.toLowerCase().includes(term) ||
      c.transaction_id.toLowerCase().includes(term) ||
      (c.assigned_to && c.assigned_to.toLowerCase().includes(term))
    );
  });

  const handleCreateNewCase = async (e) => {
    e.preventDefault();
    if (!newCaseTxnId.trim()) {
      setModalError(new Error('Please specify a Transaction ID.'));
      return;
    }

    setIsSubmittingNewCase(true);
    setModalError(null);
    try {
      const payload = {
        transaction_id: newCaseTxnId.trim(),
        priority: newCasePriority,
        initial_note: newCaseNote.trim() || undefined,
      };

      const res = await createInvestigation(payload);
      const created = res.data || res;
      setIsModalOpen(false);
      setNewCaseTxnId('');
      setNewCaseNote('');
      navigate(`/investigations/${created.case_id}`);
    } catch (err) {
      setModalError(err);
    } finally {
      setIsSubmittingNewCase(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            AML Investigation Queue
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Active suspicious activity cases, assignee workload, compliance triage workflow, and case creation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={fetchCases} disabled={loading}>
            🔄 Refresh
          </Button>
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            ➕ Open New Case
          </Button>
          <Link to="/analyze">
            <Button variant="secondary">⚡ Analyze Transaction</Button>
          </Link>
        </div>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Filters Toolbar */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Search Case or Txn ID
            </label>
            <input
              type="text"
              placeholder="e.g. CASE-170 or TX-V2-242571..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
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
          </div>

          <div style={{ minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Risk Tier
            </label>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
              }}
            >
              {TIER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
              }}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Case List Table */}
      {loading ? (
        <LoadingSpinner message="Loading investigation cases..." />
      ) : filteredCases.length === 0 ? (
        <Card title="No Investigation Cases Found">
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            No investigation cases match your current filters. Open an investigation directly using the "Open New Case" button or from any transaction analysis report.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>➕ Open New Case</Button>
            <Link to="/analyze">
              <Button variant="secondary">Evaluate Transaction</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.875rem 1rem' }}>Case ID</th>
                <th style={{ padding: '0.875rem 1rem' }}>Transaction ID</th>
                <th style={{ padding: '0.875rem 1rem' }}>Risk Score</th>
                <th style={{ padding: '0.875rem 1rem' }}>Risk Tier</th>
                <th style={{ padding: '0.875rem 1rem' }}>Priority</th>
                <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                <th style={{ padding: '0.875rem 1rem' }}>Assignee</th>
                <th style={{ padding: '0.875rem 1rem' }}>Created At</th>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => (
                <tr
                  key={c.case_id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '1rem', fontWeight: 700 }}>
                    <Link
                      to={`/investigations/${c.case_id}`}
                      style={{ color: 'var(--brand-primary)', textDecoration: 'none' }}
                    >
                      {c.case_id}
                    </Link>
                  </td>
                  <td style={{ padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {c.transaction_id}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 700 }}>
                    {typeof c.risk_score_snapshot === 'number' ? c.risk_score_snapshot.toFixed(1) : 'N/A'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <Badge variant={getTierBadgeVariant(c.risk_tier_snapshot)}>
                      {c.risk_tier_snapshot}
                    </Badge>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-main)',
                      }}
                    >
                      {c.priority}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: '1px solid transparent',
                        ...getStatusBadgeStyle(c.status),
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: c.assigned_to ? 'var(--text-main)' : 'var(--text-dim)', fontStyle: c.assigned_to ? 'normal' : 'italic' }}>
                    {c.assigned_to ? `👤 ${c.assigned_to}` : 'Unassigned'}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleString() : 'N/A'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <Link to={`/investigations/${c.case_id}`}>
                      <Button variant="secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>
                        View Dossier →
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Open New Case Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              maxWidth: '540px',
              width: '100%',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                🚨 Open Investigation Case
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {modalError && <ErrorAlert error={modalError} onDismiss={() => setModalError(null)} />}

            {/* Quick Pick Reference Presets */}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                Quick Pick Analyzed Transaction:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {SAMPLE_TRANSACTIONS.slice(2).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setNewCaseTxnId(item.id);
                      setNewCasePriority(item.tier === 'CRITICAL' ? 'CRITICAL' : 'HIGH');
                      setNewCaseNote(`Case opened for ${item.typology} (${item.id}).`);
                    }}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                    }}
                  >
                    {item.id} ({item.tier})
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateNewCase} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="new_case_txn_id">
                  Transaction ID *
                </label>
                <input
                  id="new_case_txn_id"
                  type="text"
                  className="form-input font-mono"
                  placeholder="e.g. TX-V2-242571"
                  value={newCaseTxnId}
                  onChange={(e) => setNewCaseTxnId(e.target.value)}
                  disabled={isSubmittingNewCase}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new_case_priority">
                  Triage Priority *
                </label>
                <select
                  id="new_case_priority"
                  className="form-input"
                  value={newCasePriority}
                  onChange={(e) => setNewCasePriority(e.target.value)}
                  disabled={isSubmittingNewCase}
                >
                  <option value="CRITICAL">CRITICAL (Immediate Action)</option>
                  <option value="HIGH">HIGH (Priority Review)</option>
                  <option value="MEDIUM">MEDIUM (Standard Watchlist)</option>
                  <option value="LOW">LOW (Informational)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new_case_note">
                  Initial Hypothesis / Case Opening Note
                </label>
                <textarea
                  id="new_case_note"
                  className="form-textarea"
                  placeholder="Document initial reasoning or red flags..."
                  value={newCaseNote}
                  onChange={(e) => setNewCaseNote(e.target.value)}
                  disabled={isSubmittingNewCase}
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmittingNewCase}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmittingNewCase}
                  disabled={isSubmittingNewCase}
                >
                  Open Investigation Dossier
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Investigations;
