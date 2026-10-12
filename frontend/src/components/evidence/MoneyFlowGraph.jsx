import React, { useState } from 'react';
import Card from '../common/Card';

/**
 * Project Vigilance — Interactive Money Flow & Network Topology Graph
 * ====================================================================
 * Renders a dynamic, SVG-based topological diagram illustrating:
 * - Originating Sender Entity Node
 * - Transaction Value Transfer Edge (Amount, Rail, Channel)
 * - Beneficiary Receiver Entity Node
 * - Closed Cycle Feedback Traversal (if circular laundering loops exist)
 * - Hardware Device & Network IP Entities
 * - Interactive node inspection panel
 */
export function MoneyFlowGraph({ evidence, features, transactionId }) {
  if (!evidence) return null;

  const beh = evidence?.behavioral_evidence || {};
  const graph = evidence?.graph_evidence || {};
  const comp = evidence?.compliance_signals || {};
  const feat = features || {};

  const [selectedEntity, setSelectedEntity] = useState(null);

  const amount = comp?.transaction_amount ?? feat?.amount ?? 0;
  const channel = beh?.transaction?.channel || 'Standard Banking Rail';
  const currency = beh?.transaction?.currency || 'INR';

  const senderCommunity = graph?.sender?.louvain_community_id || feat?.sender_louvain_community_id || 'N/A';
  const receiverCommunity = graph?.receiver?.louvain_community_id || feat?.receiver_louvain_community_id || 'N/A';

  const senderPageRank = graph?.sender?.pagerank ?? feat?.sender_pagerank_score ?? 0;
  const receiverPageRank = graph?.receiver?.pagerank ?? feat?.receiver_pagerank_score ?? 0;

  const senderOutDegree = graph?.sender?.out_degree ?? feat?.sender_out_degree ?? 0;
  const receiverInDegree = graph?.receiver?.in_degree ?? feat?.receiver_in_degree ?? 0;

  const hasCycle = graph?.sender?.participates_in_cycle ||
                   graph?.receiver?.participates_in_cycle ||
                   feat?.sender_participates_in_cycle === 1 ||
                   feat?.receiver_participates_in_cycle === 1;

  const cycleLength = graph?.sender?.shortest_cycle_length > 0
    ? graph?.sender?.shortest_cycle_length
    : (graph?.receiver?.shortest_cycle_length > 0 ? graph?.receiver?.shortest_cycle_length : 3);

  const totalCycles = (graph?.sender?.total_cycle_count ?? feat?.sender_total_cycle_count ?? 0) +
                      (graph?.receiver?.total_cycle_count ?? feat?.receiver_total_cycle_count ?? 0);

  const deviceAccounts = beh?.entities?.device?.unique_accounts ?? feat?.device_unique_accounts_historical ?? 1;
  const ipAccounts = beh?.entities?.ip?.unique_accounts ?? feat?.ip_unique_accounts_historical ?? 1;
  const hasSharedEntity = deviceAccounts > 1 || ipAccounts > 1;

  const isCritical = hasCycle || hasSharedEntity || (evidence?.risk_breakdown?.final_risk_score > 60);

  const entities = {
    sender: {
      type: 'Account (Originator)',
      id: 'ACC_SRC_' + (transactionId?.slice(-6) || 'SENDER'),
      community: senderCommunity,
      pagerank: Number(senderPageRank).toFixed(6),
      outDegree: senderOutDegree,
      velocity24h: beh?.sender?.velocity_24h?.txn_count ?? 0,
      amount24h: `₹${Number(beh?.sender?.velocity_24h?.amount_sum ?? 0).toLocaleString()}`,
      status: hasCycle ? 'Flagged (Cycle Node)' : 'Normal Originator',
    },
    receiver: {
      type: 'Account (Beneficiary)',
      id: 'ACC_DST_' + (transactionId?.slice(-6) || 'RECEIVER'),
      community: receiverCommunity,
      pagerank: Number(receiverPageRank).toFixed(6),
      inDegree: receiverInDegree,
      velocity24h: beh?.receiver?.velocity_24h?.txn_count ?? 0,
      amount24h: `₹${Number(beh?.receiver?.velocity_24h?.amount_sum ?? 0).toLocaleString()}`,
      status: hasCycle ? 'Flagged (Cycle Intermediary)' : 'Normal Beneficiary',
    },
    device: {
      type: 'Hardware Device / IP Fingerprint',
      id: 'DEV_FP_8892',
      uniqueAccounts: deviceAccounts,
      uniqueCustomers: beh?.entities?.device?.unique_customers ?? 1,
      ipAccounts: ipAccounts,
      status: hasSharedEntity ? 'High-Risk Shared Hardware' : 'Dedicated Hardware',
    },
    transaction: {
      type: 'Transaction Flow',
      id: transactionId || 'TXN_VAL_TRANSFER',
      amount: `${currency === 'INR' ? '₹' : ''}${Number(amount).toLocaleString()} ${currency !== 'INR' ? currency : ''}`,
      channel: channel,
      isCrypto: beh?.transaction?.is_crypto ? 'Yes (Cryptocurrency Conduits)' : 'No (Fiat Rail)',
      isCrossBorder: beh?.transaction?.is_cross_border ? 'Yes (Cross-Border Routing)' : 'Domestic',
      cycleDetected: hasCycle ? `Yes (${totalCycles} closed cycles detected)` : 'No',
    },
  };

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span>🌐 Interactive Transaction Money Flow & Relationship Network</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Click any node or link to inspect entity properties
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* SVG Canvas */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#0f172a',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #1e293b',
            overflow: 'hidden',
            padding: '1rem',
          }}
        >
          <svg
            viewBox="0 0 840 380"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            <defs>
              {/* Arrow marker for regular transfer */}
              <marker
                id="arrowhead-main"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill={isCritical ? '#ef4444' : '#3b82f6'} />
              </marker>

              {/* Arrow marker for circular cycle return */}
              <marker
                id="arrowhead-cycle"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
              </marker>

              {/* Arrow marker for device links */}
              <marker
                id="arrowhead-device"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" />
              </marker>
            </defs>

            {/* Background Grid Pattern */}
            <g opacity="0.15">
              {[50, 100, 150, 200, 250, 300, 350].map((y) => (
                <line key={`h-${y}`} x1="0" y1={y} x2="840" y2={y} stroke="#475569" strokeDasharray="4 4" />
              ))}
              {[100, 200, 300, 400, 500, 600, 700].map((x) => (
                <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="380" stroke="#475569" strokeDasharray="4 4" />
              ))}
            </g>

            {/* Main Money Flow Transfer Line */}
            <line
              x1="200"
              y1="190"
              x2="600"
              y2="190"
              stroke={isCritical ? '#ef4444' : '#3b82f6'}
              strokeWidth="4"
              markerEnd="url(#arrowhead-main)"
              cursor="pointer"
              onClick={() => setSelectedEntity(entities.transaction)}
            />

            {/* Value Badge on Transfer Line */}
            <g
              transform="translate(400, 175)"
              cursor="pointer"
              onClick={() => setSelectedEntity(entities.transaction)}
            >
              <rect
                x="-95"
                y="-18"
                width="190"
                height="36"
                rx="8"
                fill="#1e293b"
                stroke={isCritical ? '#ef4444' : '#3b82f6'}
                strokeWidth="2"
              />
              <text
                x="0"
                y="-2"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12"
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                {currency === 'INR' ? '₹' : ''}{Number(amount).toLocaleString()} {currency !== 'INR' ? currency : ''}
              </text>
              <text
                x="0"
                y="12"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
              >
                via {channel}
              </text>
            </g>

            {/* Circular Cycle Return Arc (if Cycle detected) */}
            {hasCycle && (
              <g cursor="pointer" onClick={() => setSelectedEntity(entities.transaction)}>
                <path
                  d="M 640 170 C 670 60, 170 60, 200 170"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                  markerEnd="url(#arrowhead-cycle)"
                />
                <rect
                  x="330"
                  y="55"
                  width="180"
                  height="26"
                  rx="6"
                  fill="#78350f"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <text
                  x="420"
                  y="72"
                  textAnchor="middle"
                  fill="#fef3c7"
                  fontSize="11"
                  fontWeight="700"
                >
                  🔄 Closed {cycleLength}-Hop Cycle Loop
                </text>
              </g>
            )}

            {/* Device / IP Hardware Node (Top or Left-Center) */}
            <g
              transform="translate(400, 310)"
              cursor="pointer"
              onClick={() => setSelectedEntity(entities.device)}
            >
              {/* Connector line to Sender */}
              <line
                x1="-140"
                y1="-80"
                x2="-30"
                y2="-10"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
              <rect
                x="-110"
                y="-25"
                width="220"
                height="50"
                rx="10"
                fill="#1e1b4b"
                stroke={hasSharedEntity ? '#ef4444' : '#8b5cf6'}
                strokeWidth="2"
              />
              <text
                x="0"
                y="-5"
                textAnchor="middle"
                fill="#c7d2fe"
                fontSize="12"
                fontWeight="700"
              >
                🖥️ Shared Device & IP Fingerprint
              </text>
              <text
                x="0"
                y="15"
                textAnchor="middle"
                fill="#a5b4fc"
                fontSize="11"
              >
                {deviceAccounts} Accounts on Device | {ipAccounts} on IP
              </text>
            </g>

            {/* SENDER NODE */}
            <g
              transform="translate(180, 190)"
              cursor="pointer"
              onClick={() => setSelectedEntity(entities.sender)}
            >
              <circle
                r="46"
                fill="#1e293b"
                stroke={hasCycle ? '#ef4444' : '#3b82f6'}
                strokeWidth="3.5"
              />
              <circle
                r="38"
                fill={hasCycle ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
              />
              <text
                x="0"
                y="-8"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12"
                fontWeight="800"
              >
                SENDER
              </text>
              <text
                x="0"
                y="10"
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                C#{senderCommunity}
              </text>
              <text
                x="0"
                y="24"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
              >
                Out-deg: {senderOutDegree}
              </text>
              <text
                x="0"
                y="62"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontWeight="600"
              >
                Originating Account
              </text>
            </g>

            {/* RECEIVER NODE */}
            <g
              transform="translate(640, 190)"
              cursor="pointer"
              onClick={() => setSelectedEntity(entities.receiver)}
            >
              <circle
                r="46"
                fill="#1e293b"
                stroke={hasCycle ? '#ef4444' : '#10b981'}
                strokeWidth="3.5"
              />
              <circle
                r="38"
                fill={hasCycle ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}
              />
              <text
                x="0"
                y="-8"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12"
                fontWeight="800"
              >
                RECEIVER
              </text>
              <text
                x="0"
                y="10"
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                C#{receiverCommunity}
              </text>
              <text
                x="0"
                y="24"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
              >
                In-deg: {receiverInDegree}
              </text>
              <text
                x="0"
                y="62"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontWeight="600"
              >
                Beneficiary Conduit
              </text>
            </g>
          </svg>
        </div>

        {/* Selected Entity Inspector Panel */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between' }}>
            <span>📋 Selected Topological Entity Details:</span>
            <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>
              {selectedEntity ? selectedEntity.type : 'Click any node above for forensic breakdown'}
            </span>
          </div>

          {selectedEntity ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {Object.entries(selectedEntity).map(([k, v]) => (
                <div key={k}>
                  <span style={{ color: 'var(--text-dim)', textTransform: 'capitalize', fontSize: '0.75rem' }}>
                    {k.replace(/([A-Z])/g, ' $1')}:
                  </span>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{String(v)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              The interactive topological graph traces the flow of capital from originating sender through payment rails to beneficiary accounts. Red nodes indicate active participation in circular laundering cycles or shared device fraud rings.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default MoneyFlowGraph;
