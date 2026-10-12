import React from 'react';
import Badge from '../common/Badge';

const TIER_CONFIG = {
  LOW: {
    label: 'Low Risk',
    variant: 'low',
    icon: '🛡️',
    description: 'Automated clearing / passive monitoring',
  },
  MEDIUM: {
    label: 'Medium Risk',
    variant: 'medium',
    icon: '⚠️',
    description: 'Secondary compliance queue / watchlist',
  },
  HIGH: {
    label: 'High Risk',
    variant: 'high',
    icon: '🚨',
    description: 'Priority investigation / enhanced review',
  },
  CRITICAL: {
    label: 'Critical Risk',
    variant: 'critical',
    icon: '⛔',
    description: 'Highest-priority compliance investigation',
  },
};

export function RiskTierBadge({ tier = 'LOW', showDescription = false, className = '' }) {
  const normalizedTier = tier?.toUpperCase() || 'LOW';
  const config = TIER_CONFIG[normalizedTier] || TIER_CONFIG.LOW;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <Badge variant={config.variant} className={className}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </Badge>
      {showDescription && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          ({config.description})
        </span>
      )}
    </div>
  );
}

export default RiskTierBadge;
