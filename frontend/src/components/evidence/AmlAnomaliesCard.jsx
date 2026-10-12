import React from 'react';
import Card from '../common/Card';

/**
 * Project Vigilance — 6 Canonical AML Anomalies Dossier
 * ======================================================
 * Directly addresses the 6 core laundering scenarios specified in the
 * project definition of done & regulatory surveillance guidelines:
 * 1. Structuring (Smurfing)
 * 2. Layering (Multi-Hop Fund Movements)
 * 3. Circular Money Flow (Cycle Loops)
 * 4. Mule Account Behavior (High-Velocity Conduit)
 * 5. Shared Device / IP Network Fraud
 * 6. Crypto Off-Ramping (Digital Asset Conduits)
 */
export function AmlAnomaliesCard({ evidence, features }) {
  if (!evidence) return null;

  const beh = evidence?.behavioral_evidence || {};
  const graph = evidence?.graph_evidence || {};
  const comp = evidence?.compliance_signals || {};
  const feat = features || {};

  const txAmount = comp?.transaction_amount ?? feat?.amount ?? 0;
  const isNearCtr = comp?.is_near_regulatory_threshold || (txAmount >= 9000 && txAmount < 10000);
  const nearCtrCount = comp?.near_threshold_txns_prev_24h || feat?.sender_near_regulatory_threshold_txns_prev_24h || 0;

  // 1. Structuring (Smurfing)
  const isStructuring = isNearCtr || nearCtrCount > 0;
  const structuringDetails = isStructuring
    ? `Amount ₹${Number(txAmount).toLocaleString()} is within 10% of statutory CTR reporting limit (₹10,000). ${nearCtrCount} sub-threshold transactions recorded in the past 24h.`
    : `Transaction amount ₹${Number(txAmount).toLocaleString()} is within standard bounds. No sub-threshold smurfing patterns observed.`;

  // 2. Layering (Multi-Hop Routing)
  const outDegree = graph?.sender?.out_degree ?? feat?.sender_out_degree ?? 0;
  const uniqueReceivers24h = beh?.sender?.velocity_24h?.unique_receivers ?? feat?.sender_unique_receivers_prev_24h ?? 0;
  const isLayering = outDegree >= 10 || uniqueReceivers24h >= 8;
  const layeringDetails = isLayering
    ? `Elevated account dispersion: sender counterparty out-degree is ${outDegree} with ${uniqueReceivers24h} unique beneficiaries targeted in 24h.`
    : `Counterparty dispersion is nominal (${outDegree} outgoing links, ${uniqueReceivers24h} recipients in 24h).`;

  // 3. Circular Money Flow (Cycle Loops)
  const senderCycle = graph?.sender?.participates_in_cycle || feat?.sender_participates_in_cycle === 1;
  const receiverCycle = graph?.receiver?.participates_in_cycle || feat?.receiver_participates_in_cycle === 1;
  const cycleCount = (graph?.sender?.total_cycle_count ?? feat?.sender_total_cycle_count ?? 0) +
                     (graph?.receiver?.total_cycle_count ?? feat?.receiver_total_cycle_count ?? 0);
  const shortestCycle = graph?.sender?.shortest_cycle_length > 0
    ? graph?.sender?.shortest_cycle_length
    : (graph?.receiver?.shortest_cycle_length > 0 ? graph?.receiver?.shortest_cycle_length : null);

  const isCircular = senderCycle || receiverCycle || cycleCount > 0;
  const circularDetails = isCircular
    ? `Closed topological cycle detected in transaction graph. Funds route across ${shortestCycle ? `${shortestCycle}-hop` : 'multi-hop'} chain and return to origin (${cycleCount} cyclic loop structures detected).`
    : 'No closed graph cycles detected. Transaction path is linear and non-circular.';

  // 4. Mule Account Behavior
  const sender1hCount = beh?.sender?.velocity_1h?.txn_count ?? feat?.sender_txn_count_prev_1h ?? 0;
  const receiver1hCount = beh?.receiver?.velocity_1h?.txn_count ?? feat?.receiver_txn_count_prev_1h ?? 0;
  const zScore = beh?.sender?.historical?.amount_zscore ?? feat?.sender_amount_zscore_historical ?? 0;
  const isMule = (sender1hCount >= 4 && receiver1hCount >= 3) || zScore >= 2.0;
  const muleDetails = isMule
    ? `Rapid pass-through conduit activity: high inflow/outflow velocity within 1 hour (${sender1hCount} sent, ${receiver1hCount} received) with statistical z-score deviation of ${Number(zScore).toFixed(2)}σ.`
    : `Velocity consistent with baseline account operating history (${sender1hCount} sent in 1h, z-score ${Number(zScore).toFixed(2)}σ).`;

  // 5. Shared Device / IP Fraud
  const devAccounts = beh?.entities?.device?.unique_accounts ?? feat?.device_unique_accounts_historical ?? 1;
  const ipAccounts = beh?.entities?.ip?.unique_accounts ?? feat?.ip_unique_accounts_historical ?? 1;
  const isSharedEntity = devAccounts > 1 || ipAccounts > 1;
  const sharedEntityDetails = isSharedEntity
    ? `Hardware fingerprint / network collision: ${devAccounts} distinct customer accounts operated from same device; ${ipAccounts} accounts linked to originating IP.`
    : `Single-tenant hardware identity: 1 account mapped to device fingerprint and originating IP address.`;

  // 6. Crypto Off-Ramping
  const isCrypto = beh?.transaction?.is_crypto || comp?.is_crypto || feat?.is_crypto === 1 || feat?.currency_USDT === 1 || feat?.channel_Crypto_Gateway === 1;
  const cryptoTxns = beh?.sender?.historical?.crypto_txns ?? feat?.sender_crypto_txn_count_historical ?? 0;
  const isCryptoOffRamp = isCrypto || cryptoTxns > 0;
  const cryptoDetails = isCryptoOffRamp
    ? `High-risk digital asset gateway utilized (${comp?.currency || feat?.currency_USDT ? 'USDT' : 'Crypto Rail'}). Immediate conversion into unregulated crypto conduits detected.`
    : 'Standard domestic banking rails (UPI/NEFT/RTGS) utilized without cryptocurrency off-ramp conduits.';

  const anomalies = [
    {
      id: 'structuring',
      title: 'Structuring (Smurfing)',
      detected: isStructuring,
      icon: '💵',
      badge: isStructuring ? 'DETECTED' : 'NORMAL',
      details: structuringDetails,
      statutory: 'PMLA 2002 / FIU-IND Rule 3',
    },
    {
      id: 'layering',
      title: 'Layering (Multi-Hop Flows)',
      detected: isLayering,
      icon: '🔀',
      badge: isLayering ? 'DETECTED' : 'NORMAL',
      details: layeringDetails,
      statutory: 'FATF Recommendation 10',
    },
    {
      id: 'circular',
      title: 'Circular Money Flow (Cycles)',
      detected: isCircular,
      icon: '🔄',
      badge: isCircular ? 'DETECTED' : 'NORMAL',
      details: circularDetails,
      statutory: 'Neo4j Graph Topology Cycle Traversal',
    },
    {
      id: 'mule',
      title: 'Mule Account Behavior',
      detected: isMule,
      icon: '⚡',
      badge: isMule ? 'DETECTED' : 'NORMAL',
      details: muleDetails,
      statutory: 'Rapid Transit Velocity Monitoring',
    },
    {
      id: 'shared_device',
      title: 'Shared Device / IP Fraud',
      detected: isSharedEntity,
      icon: '🖥️',
      badge: isSharedEntity ? 'DETECTED' : 'NORMAL',
      details: sharedEntityDetails,
      statutory: 'Cyber-Surveillance Entity Linkage',
    },
    {
      id: 'crypto_offramp',
      title: 'Crypto Off-Ramping',
      detected: isCryptoOffRamp,
      icon: '🪙',
      badge: isCryptoOffRamp ? 'DETECTED' : 'NORMAL',
      details: cryptoDetails,
      statutory: 'VDA / Cryptocurrency AML Mandate',
    },
  ];

  const detectedCount = anomalies.filter((a) => a.detected).length;

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span>🔍 6 Core AML Anomaly & Typology Detections (Use Case Standard)</span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              backgroundColor: detectedCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: detectedCount > 0 ? '#f87171' : '#34d399',
              border: `1px solid ${detectedCount > 0 ? '#ef4444' : '#10b981'}`,
            }}
          >
            {detectedCount} of 6 Typologies Flagged
          </span>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {anomalies.map((a) => (
          <div
            key={a.id}
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: a.detected ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg-secondary)',
              border: `1px solid ${a.detected ? 'rgba(239, 68, 68, 0.35)' : 'var(--border-subtle)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                <span>{a.icon}</span>
                <span>{a.title}</span>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: a.detected ? '#ef4444' : 'rgba(16, 185, 129, 0.15)',
                  color: a.detected ? '#ffffff' : '#34d399',
                  border: a.detected ? 'none' : '1px solid #10b981',
                }}
              >
                {a.badge}
              </span>
            </div>

            <p style={{ fontSize: '0.825rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.45 }}>
              {a.details}
            </p>

            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 'auto', paddingTop: '0.25rem' }}>
              Standard: {a.statutory}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default AmlAnomaliesCard;
