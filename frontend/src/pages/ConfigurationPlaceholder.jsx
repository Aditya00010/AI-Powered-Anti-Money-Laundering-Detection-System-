/**
 * Project Vigilance — Operational Risk Threshold Management
 * ==========================================================
 * Administrative interface for viewing, modifying, and resetting
 * operational AML risk-tier thresholds and regulatory parameters.
 */

import React, { useState, useEffect } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import RoleGuard from '../routes/RoleGuard';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../api/configurationApi';

export function ConfigurationContent() {
  const [config, setConfig] = useState(null);
  const [formData, setFormData] = useState({
    low_max: 30,
    medium_max: 60,
    high_max: 80,
    critical_max: 100,
    alert_threshold: 60,
    near_regulatory_threshold_ratio: 0.90,
    regulatory_ctr_boundary: 1000000,
    change_notes: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const fetchConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getConfiguration();
      const data = res.data || res;
      setConfig(data);
      setFormData({
        low_max: data.low_max ?? 30,
        medium_max: data.medium_max ?? 60,
        high_max: data.high_max ?? 80,
        critical_max: data.critical_max ?? 100,
        alert_threshold: data.alert_threshold ?? 60,
        near_regulatory_threshold_ratio: data.near_regulatory_threshold_ratio ?? 0.90,
        regulatory_ctr_boundary: data.regulatory_ctr_boundary ?? 1000000,
        change_notes: '',
      });
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setError(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    setError(null);
    setSuccessMessage(null);

    const low = Number(formData.low_max);
    const med = Number(formData.medium_max);
    const high = Number(formData.high_max);
    const crit = Number(formData.critical_max);
    const alertThresh = Number(formData.alert_threshold);
    const ratio = Number(formData.near_regulatory_threshold_ratio);
    const boundary = Number(formData.regulatory_ctr_boundary);

    // Frontend UX validation
    if (isNaN(low) || isNaN(med) || isNaN(high) || isNaN(crit)) {
      setError(new Error('All threshold maximums must be valid numbers.'));
      return;
    }

    if (low < 0 || crit > 100) {
      setError(new Error('Thresholds must be between 0.0 and 100.0.'));
      return;
    }

    if (low >= med) {
      setError(new Error(`LOW threshold (${low}) must be strictly less than MEDIUM threshold (${med}).`));
      return;
    }

    if (med >= high) {
      setError(new Error(`MEDIUM threshold (${med}) must be strictly less than HIGH threshold (${high}).`));
      return;
    }

    if (high > crit) {
      setError(new Error(`HIGH threshold (${high}) cannot exceed CRITICAL threshold (${crit}).`));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        low_max: low,
        medium_max: med,
        high_max: high,
        critical_max: crit,
        alert_threshold: alertThresh,
        near_regulatory_threshold_ratio: ratio,
        regulatory_ctr_boundary: boundary,
        change_notes: formData.change_notes || 'Updated via Admin Configuration UI',
      };

      const res = await updateConfiguration(payload);
      const updated = res.data || res;
      setConfig(updated);
      setSuccessMessage('Operational risk thresholds saved and applied successfully.');
    } catch (err) {
      setError(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await resetConfiguration();
      const resetData = res.data || res;
      setConfig(resetData);
      setFormData({
        low_max: resetData.low_max ?? 30,
        medium_max: resetData.medium_max ?? 60,
        high_max: resetData.high_max ?? 80,
        critical_max: resetData.critical_max ?? 100,
        alert_threshold: resetData.alert_threshold ?? 60,
        near_regulatory_threshold_ratio: resetData.near_regulatory_threshold_ratio ?? 0.90,
        regulatory_ctr_boundary: resetData.regulatory_ctr_boundary ?? 1000000,
        change_notes: '',
      });
      setShowResetConfirm(false);
      setSuccessMessage('Restored to approved baseline configuration (0–30, >30–60, >60–80, >80–100).');
    } catch (err) {
      setError(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading operational configuration..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            System Configuration & Risk Thresholds
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Authoritative administrative management of operational risk-tier boundaries and compliance rules.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={() => setShowResetConfirm(true)} disabled={isSaving}>
            ↺ Reset to Approved Baseline
          </Button>
          <Button variant="secondary" onClick={fetchConfig} disabled={isSaving}>
            🔄 Refresh
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Confirmation Modal / Banner for Reset */}
      {showResetConfirm && (
        <div className="alert alert-warning" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontWeight: 700 }}>
            ⚠️ Confirm Reset to Approved Baseline
          </div>
          <div>
            Are you sure you want to restore the default baseline thresholds?
            <br />
            <strong>LOW: 0–30 | MEDIUM: &gt;30–60 | HIGH: &gt;60–80 | CRITICAL: &gt;80–100</strong>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="primary" onClick={handleReset} isLoading={isSaving} disabled={isSaving}>
              Yes, Reset Configuration
            </Button>
            <Button variant="secondary" onClick={() => setShowResetConfirm(false)} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Threshold Configuration Form */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Card title="Operational Risk Tier Maximums">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Configures operational prioritization tiers. The underlying AI model scores (80% XGBoost, 20% Isolation Forest)
            remain mathematically immutable; these cutoffs dictate surveillance escalation tiers.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="low_max">
                🟢 LOW Risk Maximum (0.00 – {formData.low_max})
              </label>
              <input
                id="low_max"
                type="number"
                step="0.1"
                min="0"
                max="100"
                className="form-input font-mono"
                value={formData.low_max}
                onChange={(e) => handleInputChange('low_max', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved baseline: 30.00</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="medium_max">
                🟡 MEDIUM Risk Maximum (&gt;{formData.low_max} – {formData.medium_max})
              </label>
              <input
                id="medium_max"
                type="number"
                step="0.1"
                min="0"
                max="100"
                className="form-input font-mono"
                value={formData.medium_max}
                onChange={(e) => handleInputChange('medium_max', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved baseline: 60.00</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="high_max">
                🟠 HIGH Risk Maximum (&gt;{formData.medium_max} – {formData.high_max})
              </label>
              <input
                id="high_max"
                type="number"
                step="0.1"
                min="0"
                max="100"
                className="form-input font-mono"
                value={formData.high_max}
                onChange={(e) => handleInputChange('high_max', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved baseline: 80.00</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="critical_max">
                🔴 CRITICAL Risk (&gt;{formData.high_max} – {formData.critical_max})
              </label>
              <input
                id="critical_max"
                type="number"
                step="0.1"
                min="0"
                max="100"
                className="form-input font-mono"
                value={formData.critical_max}
                onChange={(e) => handleInputChange('critical_max', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved ceiling: 100.00</span>
            </div>
          </div>
        </Card>

        <Card title="Compliance Rule & Alerting Parameters">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="alert_threshold">
                🚨 Automatic Alert Trigger Score (0 – 100)
              </label>
              <input
                id="alert_threshold"
                type="number"
                step="1"
                min="0"
                max="100"
                className="form-input font-mono"
                value={formData.alert_threshold}
                onChange={(e) => handleInputChange('alert_threshold', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default: 60 (Alerts queue trigger)</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="regulatory_ctr_boundary">
                🏦 Regulatory CTR Currency Boundary (₹)
              </label>
              <input
                id="regulatory_ctr_boundary"
                type="number"
                step="10000"
                min="0"
                className="form-input font-mono"
                value={formData.regulatory_ctr_boundary}
                onChange={(e) => handleInputChange('regulatory_ctr_boundary', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default: ₹10,00,000</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="near_regulatory_threshold_ratio">
                📐 CTR Proximity Smurfing Ratio (0.00 – 1.00)
              </label>
              <input
                id="near_regulatory_threshold_ratio"
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="form-input font-mono"
                value={formData.near_regulatory_threshold_ratio}
                onChange={(e) => handleInputChange('near_regulatory_threshold_ratio', e.target.value)}
                disabled={isSaving}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default: 0.90 (90% of CTR threshold)</span>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" htmlFor="change_notes">
              Audit Change Log Notes
            </label>
            <input
              id="change_notes"
              type="text"
              className="form-input"
              placeholder="e.g. Adjusted boundaries for supervisory compliance review"
              value={formData.change_notes}
              onChange={(e) => handleInputChange('change_notes', e.target.value)}
              disabled={isSaving}
            />
          </div>
        </Card>

        {/* Audit Metadata Summary */}
        {config && (
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <strong>Active Audit Record:</strong> Last updated by <span className="font-mono">{config.updated_by_username || 'system_default'}</span>
            </div>
            <div>
              <strong>Timestamp:</strong> {config.updated_at ? new Date(config.updated_at).toLocaleString() : 'System Baseline'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <Button type="submit" variant="primary" isLoading={isSaving} disabled={isSaving}>
            Save Operational Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ConfigurationPlaceholder() {
  return (
    <RoleGuard requiredRole="ADMIN">
      <ConfigurationContent />
    </RoleGuard>
  );
}

export default ConfigurationPlaceholder;
