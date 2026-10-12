import React from 'react';
import Card from '../common/Card';
import Badge from '../common/Badge';

export function ModelSignalsCard({ modelSignals }) {
  if (!modelSignals) return null;

  const { xgboost, isolation_forest } = modelSignals;

  return (
    <Card title="Model Evidence & Signal Assessment">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Supervised XGBoost Evidence */}
        {xgboost && (
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1.25rem',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '4px solid var(--brand-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                🌲 Supervised XGBoost (80%)
              </div>
              <Badge variant="primary">{xgboost.signal_type || 'Supervised Typology Likelihood'}</Badge>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', margin: '0.25rem 0' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                {xgboost.probability !== undefined ? `${xgboost.probability.toFixed(1)}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                model likelihood score ({xgboost.score?.toFixed(1) || 'N/A'} pts)
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              {xgboost.disclosure}
            </div>
          </div>
        )}

        {/* Unsupervised Isolation Forest Evidence */}
        {isolation_forest && (
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1.25rem',
              borderRadius: 'var(--radius-sm)',
              borderLeft: `4px solid ${isolation_forest.is_outlier ? 'var(--tier-crit-border)' : '#10b981'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                🌲 Unsupervised Isolation Forest (20%)
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: isolation_forest.is_outlier ? 'var(--tier-crit-bg)' : 'rgba(16, 185, 129, 0.1)',
                  color: isolation_forest.is_outlier ? 'var(--tier-crit-text)' : '#34d399',
                  border: `1px solid ${isolation_forest.is_outlier ? 'var(--tier-crit-border)' : 'rgba(16, 185, 129, 0.3)'}`,
                }}
              >
                {isolation_forest.is_outlier ? '⚠️ Anomalous Outlier (Statistical Outlier)' : '✓ Nominal Distribution'}
              </span>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
              {isolation_forest.signal_type || 'Unsupervised Distribution Anomaly'}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', margin: '0.25rem 0' }}>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color: isolation_forest.is_outlier ? '#f87171' : '#34d399',
                }}
              >
                {isolation_forest.score?.toFixed(1) || '0.0'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                normalized anomaly score {isolation_forest.raw_score !== null && `(raw: ${isolation_forest.raw_score?.toFixed(4)})`}
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500 }}>
              {isolation_forest.diagnostic_assessment}
            </div>

            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              {isolation_forest.disclosure}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default ModelSignalsCard;
