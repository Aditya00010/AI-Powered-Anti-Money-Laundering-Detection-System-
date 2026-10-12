import React from 'react';
import Card from '../common/Card';

export function ComponentBreakdown({
  xgbProbability = 0.0,
  xgbScore = 0.0,
  ifRawScore = 0.0,
  ifScore = 0.0,
  finalRiskScore = 0.0,
  riskTier = 'LOW',
}) {
  return (
    <Card title="Model Attribution & Mathematical Breakdown">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.5rem 0' }}>Model Component</th>
              <th style={{ padding: '0.5rem 0' }}>Raw Metric</th>
              <th style={{ padding: '0.5rem 0' }}>Normalized (0–100)</th>
              <th style={{ padding: '0.5rem 0' }}>Weight</th>
              <th style={{ padding: '0.5rem 0' }}>Contribution</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>Supervised XGBoost</td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)' }}>
                {(xgbProbability * 100).toFixed(2)}% probability
              </td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)' }}>{xgbScore.toFixed(2)}</td>
              <td style={{ padding: '0.75rem 0' }}>80%</td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)', fontWeight: 600 }}>
                {(0.8 * xgbScore).toFixed(2)} pts
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>Unsupervised Isolation Forest</td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)' }}>
                {ifRawScore.toFixed(4)} anomaly index
              </td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)' }}>{ifScore.toFixed(2)}</td>
              <td style={{ padding: '0.75rem 0' }}>20%</td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)', color: '#a78bfa', fontWeight: 600 }}>
                {(0.2 * ifScore).toFixed(2)} pts
              </td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ padding: '0.75rem 0' }}>Total Combined Score</td>
              <td style={{ padding: '0.75rem 0' }}>—</td>
              <td style={{ padding: '0.75rem 0' }}>—</td>
              <td style={{ padding: '0.75rem 0' }}>100%</td>
              <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
                {finalRiskScore.toFixed(2)} / 100
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.775rem', color: 'var(--text-muted)' }}>
          <strong>Compliance Protocol Note:</strong> This assessment provides operational queue prioritization for investigation. Final SAR filing determinations remain subject to investigator evaluation.
        </div>
      </div>
    </Card>
  );
}

export default ComponentBreakdown;
