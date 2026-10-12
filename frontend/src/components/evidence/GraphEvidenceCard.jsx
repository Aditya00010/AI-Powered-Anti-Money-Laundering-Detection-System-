import React from 'react';
import Card from '../common/Card';

export function GraphEvidenceCard({ graphEvidence }) {
  if (!graphEvidence) return null;

  const { sender, receiver, glossary, cautionary_notice } = graphEvidence;

  return (
    <Card title="Graph Evidence & Network Topology">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', fontSize: '0.875rem' }}>
        {/* Cautionary banner */}
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            color: '#93c5fd',
            fontSize: '0.8rem',
            lineHeight: '1.4',
          }}
        >
          ℹ️ <strong>Investigation Indicator Notice:</strong> {cautionary_notice || 'Graph metrics reflect topological structural relationships within the transaction network. They are surveillance indicators, not proof of financial crime.'}
        </div>

        {/* Sender vs Receiver Comparative Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Sender Graph Account */}
          {sender && (
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
                🕸️ Sender Account Network Position
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>PageRank Centrality:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {typeof (sender.pagerank ?? sender.pagerank_score) === 'number'
                    ? (sender.pagerank ?? sender.pagerank_score).toFixed(6)
                    : 'N/A'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Louvain Community:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  Community #{sender.louvain_community_id} (Cluster #{sender.louvain_community_id})
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Observed Degree:</span>
                <span>
                  In: <strong style={{ fontFamily: 'var(--font-mono)' }}>{sender.in_degree ?? 0}</strong> | Out: <strong style={{ fontFamily: 'var(--font-mono)' }}>{sender.out_degree ?? 0}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Cycle Participation:</span>
                <span style={{ fontWeight: 700, color: sender.participates_in_cycle ? '#f87171' : 'var(--text-main)' }}>
                  {sender.participates_in_cycle ? '⚠️ Active Cycle Participant (Closed Cycle Detected)' : 'No Cycles Observed'}
                </span>
              </div>

              {sender.participates_in_cycle && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '0.75rem', borderLeft: '2px solid #ef4444' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Shortest Cycle:</span>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                    {sender.shortest_cycle_length ?? sender.min_cycle_length ?? 'N/A'} hops ({sender.total_cycle_count ?? sender.cycle_count ?? 'N/A'} total cycles)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Receiver Graph Account */}
          {receiver && (
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
                🕸️ Receiver Account Network Position
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>PageRank Centrality:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {typeof (receiver.pagerank ?? receiver.pagerank_score) === 'number'
                    ? (receiver.pagerank ?? receiver.pagerank_score).toFixed(6)
                    : 'N/A'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Louvain Community:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  Community #{receiver.louvain_community_id} (Cluster #{receiver.louvain_community_id})
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Observed Degree:</span>
                <span>
                  In: <strong style={{ fontFamily: 'var(--font-mono)' }}>{receiver.in_degree ?? 0}</strong> | Out: <strong style={{ fontFamily: 'var(--font-mono)' }}>{receiver.out_degree ?? 0}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Cycle Participation:</span>
                <span style={{ fontWeight: 700, color: receiver.participates_in_cycle ? '#f87171' : 'var(--text-main)' }}>
                  {receiver.participates_in_cycle ? '⚠️ Active Cycle Participant (Closed Cycle Detected)' : 'No Cycles Observed'}
                </span>
              </div>

              {receiver.participates_in_cycle && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '0.75rem', borderLeft: '2px solid #ef4444' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Shortest Cycle:</span>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                    {receiver.shortest_cycle_length ?? receiver.min_cycle_length ?? 'N/A'} hops ({receiver.total_cycle_count ?? receiver.cycle_count ?? 'N/A'} total cycles)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Graph Metric Educational Guide */}
        <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
            Graph Topology Interpretation Guide:
          </div>
          <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-dim)', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <li><strong>PageRank:</strong> Accounts with high PageRank channel transactions through high-volume hubs.</li>
            <li><strong>Louvain Community:</strong> Accounts sharing the same modularity partition exhibit dense intra-cluster connectivity.</li>
            <li><strong>Cycle Detection:</strong> Rapid closed loops (length 2-4) are primary indicators of circular fund pass-through.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

export default GraphEvidenceCard;
