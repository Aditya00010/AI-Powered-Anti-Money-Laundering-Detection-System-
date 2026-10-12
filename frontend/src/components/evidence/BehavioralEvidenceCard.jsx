import React from 'react';
import Card from '../common/Card';

export function BehavioralEvidenceCard({ behavioralEvidence }) {
  if (!behavioralEvidence) return null;

  const { transaction, sender, receiver, entities } = behavioralEvidence;
  const deviceAndIp = sender?.device_and_ip;

  return (
    <Card title="Behavioral Evidence & Entity Footprint">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', fontSize: '0.875rem' }}>
        {/* Transaction Summary Bar */}
        {transaction && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
              backgroundColor: 'var(--bg-secondary)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Amount</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {transaction.amount != null ? `₹${Number(transaction.amount).toLocaleString()}` : 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Channel</div>
              <div style={{ fontWeight: 600 }}>{transaction.channel || 'Unknown'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Currency</div>
              <div style={{ fontWeight: 600 }}>{transaction.currency || 'INR'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Crypto Rail</div>
              <div style={{ fontWeight: 600, color: transaction.is_crypto ? '#f87171' : 'var(--text-main)' }}>
                {transaction.is_crypto ? '⚠️ Crypto Asset' : 'Fiat Rail'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Cross-Border</div>
              <div style={{ fontWeight: 600, color: transaction.is_cross_border ? '#f87171' : 'var(--text-main)' }}>
                {transaction.is_cross_border ? '⚠️ International' : 'Domestic'}
              </div>
            </div>
          </div>
        )}

        {/* Sender & Receiver Comparison Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Sender Behavioral History */}
          {sender && (
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
                👤 Sender Velocity & History
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {sender.velocity_1h && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>1h Velocity:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {sender.velocity_1h.txn_count ?? 0} txns (₹{Number(sender.velocity_1h.amount_sum ?? sender.velocity_1h.total_amount ?? 0).toLocaleString()})
                    </span>
                  </div>
                )}
                {sender.velocity_24h && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>24h Velocity:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {sender.velocity_24h.txn_count ?? 0} txns (₹{Number(sender.velocity_24h.amount_sum ?? sender.velocity_24h.total_amount ?? 0).toLocaleString()})
                    </span>
                  </div>
                )}
                {sender.historical && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Historical Avg Amount:</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        ₹{Number(sender.historical.amount_avg ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {sender.historical.amount_to_avg_ratio != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Amount-to-Avg Ratio:</span>
                        <span style={{ fontWeight: 700, color: sender.historical.amount_to_avg_ratio > 3 ? '#fbbf24' : 'var(--text-main)' }}>
                          {Number(sender.historical.amount_to_avg_ratio).toFixed(2)}x
                        </span>
                      </div>
                    )}
                    {sender.historical.amount_zscore != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Amount Z-Score:</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {Number(sender.historical.amount_zscore).toFixed(2)} σ
                        </span>
                      </div>
                    )}
                  </>
                )}
                {!sender.velocity_1h && !sender.velocity_24h && !sender.historical && (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Nominal baseline history.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Receiver Behavioral History */}
          {receiver && (
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
                🏢 Receiver Velocity & History
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(receiver.velocity_1h || receiver.inflow_velocity_1h) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>1h Inflow:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {(receiver.velocity_1h || receiver.inflow_velocity_1h)?.txn_count ?? 0} txns (₹{Number((receiver.velocity_1h || receiver.inflow_velocity_1h)?.amount_sum ?? (receiver.velocity_1h || receiver.inflow_velocity_1h)?.total_inflow ?? 0).toLocaleString()})
                    </span>
                  </div>
                )}
                {(receiver.velocity_24h || receiver.inflow_velocity_24h) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>24h Inflow:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {(receiver.velocity_24h || receiver.inflow_velocity_24h)?.txn_count ?? 0} txns (₹{Number((receiver.velocity_24h || receiver.inflow_velocity_24h)?.amount_sum ?? (receiver.velocity_24h || receiver.inflow_velocity_24h)?.total_inflow ?? 0).toLocaleString()})
                    </span>
                  </div>
                )}
                {(receiver.velocity_24h?.unique_senders != null || receiver.inflow_velocity_24h?.unique_senders_count != null) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Unique Senders (24h):</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {receiver.velocity_24h?.unique_senders ?? receiver.inflow_velocity_24h?.unique_senders_count} senders
                    </span>
                  </div>
                )}
                {receiver.historical && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Historical Avg Inflow:</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        ₹{Number(receiver.historical.amount_avg ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {receiver.historical.amount_zscore != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Inflow Z-Score:</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {Number(receiver.historical.amount_zscore).toFixed(2)} σ
                        </span>
                      </div>
                    )}
                  </>
                )}
                {!receiver.velocity_1h && !receiver.velocity_24h && !receiver.inflow_velocity_1h && !receiver.inflow_velocity_24h && !receiver.historical && (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Nominal baseline history.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Entities (Device & IP) */}
        {(entities || deviceAndIp) && (
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              📱 Device & IP Fingerprint & Entity Multiplexing
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {entities?.device && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Device Activity</div>
                  <div>{entities.device.txn_count_24h ?? 0} txns in 24h</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    Linked: {entities.device.unique_accounts ?? 0} accounts, {entities.device.unique_customers ?? 0} customers
                  </div>
                </div>
              )}
              {entities?.ip && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>IP Activity</div>
                  <div>{entities.ip.txn_count_24h ?? 0} txns in 24h</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    Linked: {entities.ip.unique_accounts ?? 0} accounts, {entities.ip.unique_customers ?? 0} customers
                  </div>
                </div>
              )}
              {deviceAndIp && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Device & IP Footprint (24h)</div>
                  <div>{deviceAndIp.distinct_devices_24h ?? 1} devices, {deviceAndIp.distinct_ips_24h ?? 1} IPs</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    Change rates: IP {((deviceAndIp.ip_change_rate ?? 0) * 100).toFixed(0)}%, Device {((deviceAndIp.device_change_rate ?? 0) * 100).toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default BehavioralEvidenceCard;
