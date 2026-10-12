import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import { getBackendHealth, getMLHealth } from '../api/healthApi';

export function Dashboard() {
  const [backendHealth, setBackendHealth] = useState(null);
  const [mlHealth, setMlHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const be = await getBackendHealth();
      setBackendHealth(be);

      try {
        const ml = await getMLHealth();
        setMlHealth(ml.ml_service || ml);
      } catch (mlErr) {
        console.warn('ML health check notice:', mlErr.message);
        setMlHealth({ status: 'offline', error: mlErr.message });
      }
    } catch (beErr) {
      setError(beErr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            AML Surveillance Operations
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Multi-paradigm AI transaction risk scoring and network anomaly monitoring.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={fetchHealth} isLoading={loading}>
            <span>🔄</span> Refresh Status
          </Button>
          <Link to="/analyze">
            <Button variant="primary">
              <span>⚡</span> Analyze Transaction
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* System Status Cards */}
      <div className="grid-3">
        <Card title="Express Application Layer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status:</span>
              {backendHealth ? (
                <Badge variant="low">Active & Healthy</Badge>
              ) : (
                <Badge variant="critical">Offline</Badge>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Service:</span>
              <span className="font-mono" style={{ fontSize: '0.85rem' }}>
                {backendHealth?.service || 'backend-api'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Uptime:</span>
              <span className="font-mono">
                {backendHealth?.uptime_seconds ? `${backendHealth.uptime_seconds}s` : '—'}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Python ML Inference Engine">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status:</span>
              {mlHealth?.status === 'ok' ? (
                <Badge variant="low">FastAPI Operational</Badge>
              ) : (
                <Badge variant="critical">Unavailable</Badge>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>XGBoost Classifier:</span>
              <span style={{ fontWeight: 600, color: mlHealth?.models_loaded?.xgboost ? '#34d399' : '#f87171' }}>
                {mlHealth?.models_loaded?.xgboost ? '✓ Loaded (84 features)' : '✗ Offline'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Isolation Forest:</span>
              <span style={{ fontWeight: 600, color: mlHealth?.models_loaded?.isolation_forest ? '#34d399' : '#f87171' }}>
                {mlHealth?.models_loaded?.isolation_forest ? '✓ Loaded (80 features)' : '✗ Offline'}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Application Persistence (MongoDB)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Database State:</span>
              {backendHealth?.database_connected ? (
                <Badge variant="low">Connected (Local)</Badge>
              ) : (
                <Badge variant="medium">Disconnected</Badge>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Collection:</span>
              <span className="font-mono" style={{ fontSize: '0.85rem' }}>AmlAnalysis</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Graph Database:</span>
              <span className="font-mono" style={{ fontSize: '0.85rem' }}>Neo4j (Local)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Surveillance Transactions Queue */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>⚡ Active Surveillance Feed — Transactions Pending AI Evaluation</span>
            <Link to="/analyze" style={{ fontSize: '0.8rem', color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 600 }}>
              Go to Full Evaluator →
            </Link>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Select any live transaction across inlier, velocity surge, structuring, circular flow, or mule typologies to generate an AI risk score, explainability breakdown, and network graph.
          </p>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Transaction ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Channel</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Suspected Typology</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Expected Tier</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: 'TX-V2-242571', amt: '₹4,90,000', ch: 'RTGS', typ: 'Circular Flow & 10-Hop Graph Cycles', tier: 'CRITICAL', badge: 'critical' },
                  { id: 'TX-V2-310849', amt: '850,000 USDT', ch: 'Crypto Gateway', typ: 'Mule Account / Rapid Crypto Drain', tier: 'CRITICAL', badge: 'critical' },
                  { id: 'TX-V2-184912', amt: '₹9,850', ch: 'UPI', typ: 'Structuring / Smurfing Near CTR Limit', tier: 'HIGH', badge: 'high' },
                  { id: 'TX-V2-149201', amt: '₹1,20,000', ch: 'IMPS', typ: 'Cross-Border Velocity Surge', tier: 'MEDIUM', badge: 'medium' },
                  { id: 'TX-V2-200586', amt: '₹4,500', ch: 'UPI', typ: 'Nominal Consumer Inlier (Clean)', tier: 'LOW', badge: 'low' },
                ].map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {row.id}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{row.amt}</td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--text-muted)' }}>{row.ch}</td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--text-main)', fontWeight: 500 }}>{row.typ}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Badge variant={row.badge}>{row.tier}</Badge>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      <Link to="/analyze">
                        <Button variant="primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}>
                          ⚡ Analyze AI Score →
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Operational Protocol Information */}
      <Card title="Approved Scoring Architecture & Queue Prioritization">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <p>
            Project Vigilance deploys a dual-model scoring engine combining supervised typologies (80% XGBoost) with structural eccentricity (20% Isolation Forest), standardizing outputs to an operational 0–100 risk score.
          </p>
          <div className="grid-4" style={{ marginTop: '0.5rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--tier-low-bg)', border: '1px solid var(--tier-low-border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontWeight: 700, color: 'var(--tier-low-text)' }}>LOW (0 – 30)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>Automated clearing or passive monitoring</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--tier-med-bg)', border: '1px solid var(--tier-med-border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontWeight: 700, color: 'var(--tier-med-text)' }}>MEDIUM (&gt;30 – 60)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>Secondary compliance review / watchlist</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--tier-high-bg)', border: '1px solid var(--tier-high-border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontWeight: 700, color: 'var(--tier-high-text)' }}>HIGH (&gt;60 – 80)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>Priority investigation / enhanced review</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--tier-crit-bg)', border: '1px solid var(--tier-crit-border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontWeight: 700, color: 'var(--tier-crit-text)' }}>CRITICAL (&gt;80 – 100)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>Highest-priority compliance investigation</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default Dashboard;
