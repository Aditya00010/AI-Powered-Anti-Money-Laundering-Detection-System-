import React from 'react';
import Card from '../common/Card';
import RiskTierBadge from './RiskTierBadge';

export function RiskScoreCard({
  finalRiskScore = 0.0,
  riskTier = 'LOW',
  xgbScore = 0.0,
  ifScore = 0.0,
  transactionId = null,
  className = '',
}) {
  const formattedFinal = Number(finalRiskScore).toFixed(2);
  const formattedXgb = Number(xgbScore).toFixed(2);
  const formattedIf = Number(ifScore).toFixed(2);

  // Border and accent styling based on tier
  const tierColor =
    riskTier === 'CRITICAL'
      ? 'var(--tier-crit-border)'
      : riskTier === 'HIGH'
      ? 'var(--tier-high-border)'
      : riskTier === 'MEDIUM'
      ? 'var(--tier-med-border)'
      : 'var(--tier-low-border)';

  return (
    <Card
      title={transactionId ? `Transaction: ${transactionId}` : 'Risk Assessment'}
      className={className}
      style={{ borderLeft: `4px solid ${tierColor}` }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Main Score Area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Operational Risk Score
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: tierColor, lineHeight: 1.1, margin: '0.25rem 0' }}>
              {formattedFinal}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Standardized scale: 0.00 – 100.00 (Prioritization Queue Metric)
            </div>
          </div>
          <div>
            <RiskTierBadge tier={riskTier} showDescription />
          </div>
        </div>

        {/* Dual-Model Component Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              XGBoost Likelihood Score (80%)
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)', margin: '0.25rem 0' }}>
              {formattedXgb}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Supervised typology matching
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Isolation Forest Score (20%)
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#a78bfa', margin: '0.25rem 0' }}>
              {formattedIf}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Unsupervised anomaly detection
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default RiskScoreCard;
