import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskScoreCard from '../src/components/risk/RiskScoreCard';
import RiskTierBadge from '../src/components/risk/RiskTierBadge';

describe('Risk Visualization Tests', () => {
  it('renders Operational Risk Score without implying probability', () => {
    render(
      <RiskScoreCard
        finalRiskScore={89.58}
        riskTier="CRITICAL"
        xgbScore={96.35}
        ifScore={62.50}
        transactionId="TX-V2-242571"
      />
    );

    // Verify clear label
    expect(screen.getByText('Operational Risk Score')).toBeInTheDocument();
    expect(screen.getByText('89.58')).toBeInTheDocument();
    expect(screen.getByText(/Transaction: TX-V2-242571/i)).toBeInTheDocument();

    // Verify dual model breakdown
    expect(screen.getByText('96.35')).toBeInTheDocument();
    expect(screen.getByText('62.50')).toBeInTheDocument();
  });

  it('renders all risk tiers with accessible icons and text labels', () => {
    const tiers = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const expectedLabels = ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'];

    tiers.forEach((tier, i) => {
      const { unmount } = render(<RiskTierBadge tier={tier} showDescription />);
      expect(screen.getByText(expectedLabels[i])).toBeInTheDocument();
      unmount();
    });
  });
});
