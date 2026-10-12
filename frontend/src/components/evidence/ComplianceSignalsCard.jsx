import React from 'react';
import Card from '../common/Card';

export function ComplianceSignalsCard({ complianceSignals }) {
  if (!complianceSignals) return null;

  const {
    regulatory_ctr_boundary,
    regulatory_threshold,
    transaction_amount,
    amount,
    is_near_regulatory_threshold,
    near_threshold_txns_prev_24h = 0,
    sender_historical_near_threshold_txns_24h = 0,
    is_cross_border,
    is_crypto,
    statutory_basis,
    potential_structuring_indication,
    summary_notes = [],
  } = complianceSignals;

  const boundary = regulatory_ctr_boundary ?? regulatory_threshold ?? 10000.0;
  const structuringCount = near_threshold_txns_prev_24h || sender_historical_near_threshold_txns_24h || 0;
  const statutoryText = statutory_basis || 'PMLA 2002 / Financial Intelligence Unit (FIU-IND) Cash/Suspicious Transaction Reporting Rule (CTR/STR)';

  return (
    <Card title="Compliance & Regulatory Structuring Signals">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.875rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* Regulatory Threshold Reference */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>CTR Reporting Boundary</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              ₹{Number(boundary).toLocaleString()}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Statutory threshold trigger
            </div>
          </div>

          {/* Near-Threshold Structuring Flag */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${is_near_regulatory_threshold ? 'var(--tier-med-border)' : 'var(--border-subtle)'}`,
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Structuring / Near-CTR Threshold</div>
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: is_near_regulatory_threshold ? '#fbbf24' : '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {is_near_regulatory_threshold ? '⚠️ Active Structuring Signal (Near-CTR Threshold)' : '✓ Normal Range'}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {structuringCount > 0
                ? `${structuringCount} structuring txns in last 24h`
                : 'No structuring clustering detected'}
            </div>
          </div>

          {/* Cross-Border Conduits */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>High-Risk Payment Rails</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {is_crypto ? '⚠️ Crypto Conduits Active' : 'Standard Banking Channels'}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {is_cross_border ? 'Cross-border jurisdictional routing' : 'Domestic routing'}
            </div>
          </div>
        </div>

        {/* Potential Structuring Indication Details */}
        {potential_structuring_indication && (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderLeft: '3px solid #f59e0b',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem',
              color: 'var(--text-main)',
            }}
          >
            <strong>Structuring Flag:</strong> {potential_structuring_indication}
          </div>
        )}

        {/* Statutory Basis Reference */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Statutory Framework: {statutoryText}
        </div>

        {/* Informative Summary Notes */}
        {summary_notes && summary_notes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Surveillance Observations:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {summary_notes.map((note, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderLeft: '3px solid #f59e0b',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    color: '#fef3c7',
                    fontSize: '0.8rem',
                  }}
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default ComplianceSignalsCard;
