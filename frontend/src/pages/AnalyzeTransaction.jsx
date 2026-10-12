import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import ErrorAlert from '../components/common/ErrorAlert';
import RiskScoreCard from '../components/risk/RiskScoreCard';
import ComponentBreakdown from '../components/risk/ComponentBreakdown';
import ModelSignalsCard from '../components/evidence/ModelSignalsCard';
import BehavioralEvidenceCard from '../components/evidence/BehavioralEvidenceCard';
import GraphEvidenceCard from '../components/evidence/GraphEvidenceCard';
import ComplianceSignalsCard from '../components/evidence/ComplianceSignalsCard';
import AmlAnomaliesCard from '../components/evidence/AmlAnomaliesCard';
import MoneyFlowGraph from '../components/evidence/MoneyFlowGraph';
import { analyzeTransaction } from '../api/analysisApi';
import { createInvestigation, getActiveCaseForTransaction } from '../api/investigationApi';
import { resolveEvidence } from '../utils/explainabilityUtils';
import { SAMPLE_TRANSACTIONS } from '../data/sampleTransactions';

// Pre-packaged test transaction fixtures (for backwards compatibility with automated tests)
const DEMO_PRESETS = {
  CLEAN_LOW: SAMPLE_TRANSACTIONS[0],
  SUSPICIOUS_CRITICAL: SAMPLE_TRANSACTIONS[4],
};

export function AnalyzeTransaction() {
  const [transactionId, setTransactionId] = useState('');
  const [featuresJson, setFeaturesJson] = useState('');
  const [selectedTxnId, setSelectedTxnId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Transaction Registry filtering
  const [filterTier, setFilterTier] = useState('ALL');
  const [registrySearch, setRegistrySearch] = useState('');

  // Case management state
  const [createdCase, setCreatedCase] = useState(null);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [caseSuccessMsg, setCaseSuccessMsg] = useState(null);
  const [caseError, setCaseError] = useState(null);

  const loadPreset = (presetKey) => {
    const preset = DEMO_PRESETS[presetKey];
    if (preset) {
      setTransactionId(preset.id || preset.transaction_id);
      setSelectedTxnId(preset.id || preset.transaction_id);
      setFeaturesJson(JSON.stringify(preset.features, null, 2));
      setError(null);
      setAnalysisResult(null);
      setCreatedCase(null);
      setCaseSuccessMsg(null);
    }
  };

  const handleSelectTransaction = (item, autoEvaluate = false) => {
    setTransactionId(item.id);
    setSelectedTxnId(item.id);
    setFeaturesJson(JSON.stringify(item.features, null, 2));
    setError(null);
    setCreatedCase(null);
    setCaseSuccessMsg(null);

    if (autoEvaluate) {
      executeEvaluation(item.id, item.features);
    } else {
      setAnalysisResult(null);
    }
  };

  const executeEvaluation = async (id, features) => {
    setIsSubmitting(true);
    setError(null);
    setAnalysisResult(null);
    setCreatedCase(null);
    setCaseSuccessMsg(null);

    try {
      const payload = {
        transaction_id: (id || transactionId || '').trim() || undefined,
        features: features,
      };

      const result = await analyzeTransaction(payload);
      setAnalysisResult(result);

      // Check if an existing case exists for this transaction
      if (result.transaction_id) {
        try {
          const caseCheck = await getActiveCaseForTransaction(result.transaction_id);
          if (caseCheck?.has_active_case && caseCheck.data) {
            setCreatedCase(caseCheck.data);
          }
        } catch {
          // Non-blocking
        }
      }
    } catch (apiErr) {
      setError(apiErr);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!featuresJson.trim()) {
      setError(new Error('Feature payload is required. Please enter or paste the transaction features JSON.'));
      return;
    }

    let parsedFeatures;
    try {
      parsedFeatures = JSON.parse(featuresJson);
    } catch (parseErr) {
      setError(new Error(`Invalid JSON syntax in features payload: ${parseErr.message}`));
      return;
    }

    if (typeof parsedFeatures !== 'object' || Array.isArray(parsedFeatures)) {
      setError(new Error('Features must be a JSON object mapping feature names to numeric values.'));
      return;
    }

    executeEvaluation(transactionId, parsedFeatures);
  };

  const handleCreateInvestigationCase = async () => {
    if (!analysisResult || isCreatingCase || createdCase) return;

    setIsCreatingCase(true);
    setCaseError(null);
    try {
      const payload = {
        transaction_id: analysisResult.transaction_id,
        analysis_id: analysisResult._id || analysisResult.analysis_id || undefined,
        priority: analysisResult.risk_tier || 'MEDIUM',
        initial_note: `Automated case initiation from AML Risk Analysis (Score: ${Number(analysisResult.final_risk_score).toFixed(1)}, Tier: ${analysisResult.risk_tier}).`,
      };

      const res = await createInvestigation(payload);
      const newCase = res.data || res;
      setCreatedCase(newCase);
      setCaseSuccessMsg(`Investigation Case ${newCase.case_id} successfully created and registered into the active queue.`);
    } catch (err) {
      setCaseError(err);
    } finally {
      setIsCreatingCase(false);
    }
  };

  // Filtered transactions for registry table
  const filteredTransactions = SAMPLE_TRANSACTIONS.filter((t) => {
    const matchesTier = filterTier === 'ALL' || t.tier === filterTier;
    const term = registrySearch.toLowerCase();
    const matchesSearch =
      !term ||
      t.id.toLowerCase().includes(term) ||
      t.label.toLowerCase().includes(term) ||
      t.typology.toLowerCase().includes(term) ||
      t.channel.toLowerCase().includes(term);
    return matchesTier && matchesSearch;
  });

  const getTierBadgeVariant = (tier) => {
    switch (tier?.toUpperCase()) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'medium';
      case 'LOW':
        return 'low';
      default:
        return 'default';
    }
  };

  const evidence = analysisResult ? resolveEvidence(analysisResult, analysisResult.features_snapshot) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            Evaluate Transaction Risk
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Submit pre-engineered behavioral, velocity, and topological graph features to the AI inference engine.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/investigations" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">📁 View Active Cases</Button>
          </Link>
        </div>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* 1. Curated Transaction Registry Table */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span>📋 Curated Transaction Registry (Pick & Evaluate)</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Filter Tier:</span>
              {['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setFilterTier(tier)}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    backgroundColor: filterTier === tier ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                    color: filterTier === tier ? '#fff' : 'var(--text-main)',
                  }}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Quick search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="Search by Transaction ID, Typology, or Channel..."
              value={registrySearch}
              onChange={(e) => setRegistrySearch(e.target.value)}
              style={{
                flex: '1 1 300px',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
              }}
            />
            {/* Backward compatible quick buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                onClick={() => loadPreset('CLEAN_LOW')}
                disabled={isSubmitting}
              >
                🛡️ Load Inlier Transaction (LOW Risk)
              </Button>
              <Button
                variant="secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                onClick={() => loadPreset('SUSPICIOUS_CRITICAL')}
                disabled={isSubmitting}
              >
                🚨 Load Laundering Typology (CRITICAL Risk)
              </Button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Transaction ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount & Currency</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Channel</th>
                  <th style={{ padding: '0.75rem 1rem' }}>AML Typology / Surveillance Profile</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Expected Tier</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((item) => {
                  const isSelected = selectedTxnId === item.id;
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {item.id}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>
                        {item.currency === 'INR' ? '₹' : ''}{Number(item.amount).toLocaleString()} {item.currency !== 'INR' ? item.currency : ''}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: 'var(--text-muted)' }}>
                        {item.channel}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.typology}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{item.description}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <Badge variant={getTierBadgeVariant(item.tier)}>{item.tier}</Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <Button
                            variant="secondary"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                            onClick={() => handleSelectTransaction(item, false)}
                            disabled={isSubmitting}
                          >
                            📝 Load Payload
                          </Button>
                          <Button
                            variant="primary"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                            onClick={() => handleSelectTransaction(item, true)}
                            isLoading={isSubmitting && selectedTxnId === item.id}
                            disabled={isSubmitting}
                          >
                            ⚡ Select & Evaluate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* 2. Payload Inspection & Custom Execution */}
      <Card title="Transaction Payload Inspection & Custom JSON Input">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="transaction_id">
              Transaction ID
            </label>
            <input
              id="transaction_id"
              type="text"
              className="form-input font-mono"
              placeholder="e.g. TX-V2-200586"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="features_json">
              Approved ML Features (84 Numeric Columns in JSON)
            </label>
            <textarea
              id="features_json"
              className="form-textarea font-mono"
              placeholder='{\n  "amount": 50000.0,\n  "log_amount": 10.819,\n  "sender_pagerank_score": 0.00012,\n  ...\n}'
              value={featuresJson}
              onChange={(e) => setFeaturesJson(e.target.value)}
              disabled={isSubmitting}
              rows={8}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFeaturesJson('');
                setTransactionId('');
                setSelectedTxnId(null);
                setError(null);
                setAnalysisResult(null);
                setCreatedCase(null);
              }}
              disabled={isSubmitting}
            >
              Clear Editor
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
              Run AI Risk Evaluation
            </Button>
          </div>
        </form>
      </Card>

      {/* 3. Comprehensive Evaluation Output & Explainable AI Suite */}
      {analysisResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Section Anchor & Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1.25rem',
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                Evaluation Output
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                AI Forensic Investigation Report & Explainability Output for transaction <span className="font-mono">{analysisResult.transaction_id}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {createdCase ? (
                <Link to={`/investigations/${createdCase.case_id}`} style={{ textDecoration: 'none' }}>
                  <Button variant="primary">
                    📁 Open Investigation Case Dossier ({createdCase.case_id}) →
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleCreateInvestigationCase}
                  isLoading={isCreatingCase}
                  disabled={isCreatingCase}
                >
                  🚨 Create Investigation Case
                </Button>
              )}
            </div>
          </div>

          {caseSuccessMsg && (
            <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✅ {caseSuccessMsg}</span>
              {createdCase && (
                <Link to={`/investigations/${createdCase.case_id}`} style={{ fontWeight: 700, color: '#fff', textDecoration: 'underline' }}>
                  View Case →
                </Link>
              )}
            </div>
          )}

          {caseError && <ErrorAlert error={caseError} onDismiss={() => setCaseError(null)} />}

          {/* 1. Overall Operational Risk Score Banner */}
          <RiskScoreCard
            finalRiskScore={analysisResult.final_risk_score}
            riskTier={analysisResult.risk_tier}
            xgbScore={analysisResult.xgb_score}
            ifScore={analysisResult.isolation_forest_score}
            transactionId={analysisResult.transaction_id}
          />

          {/* 2. Mathematical Breakdown (0.80 * XGB + 0.20 * IF) */}
          <ComponentBreakdown
            xgbProbability={analysisResult.xgb_probability}
            xgbScore={analysisResult.xgb_score}
            ifRawScore={analysisResult.isolation_forest_raw_score}
            ifScore={analysisResult.isolation_forest_score}
            finalRiskScore={analysisResult.final_risk_score}
            riskTier={analysisResult.risk_tier}
          />

          {/* 3. The 6 Core AML Anomaly & Typology Detections (Use Case Standard) */}
          <AmlAnomaliesCard
            evidence={evidence}
            features={analysisResult.features_snapshot || (featuresJson ? JSON.parse(featuresJson || '{}') : null)}
          />

          {/* 4. Interactive Visual Money Flow & Network Topology Diagram */}
          <MoneyFlowGraph
            evidence={evidence}
            features={analysisResult.features_snapshot || (featuresJson ? JSON.parse(featuresJson || '{}') : null)}
            transactionId={analysisResult.transaction_id}
          />

          {/* 5. Sub-Model Evidence (Supervised XGBoost Likelihood + Unsupervised Isolation Forest Anomaly) */}
          {evidence?.model_signals && (
            <ModelSignalsCard modelSignals={evidence.model_signals} />
          )}

          {/* 6. Behavioral Velocity & Historical Footprint */}
          {evidence?.behavioral_evidence && (
            <BehavioralEvidenceCard behavioralEvidence={evidence.behavioral_evidence} />
          )}

          {/* 7. Graph Evidence & Network Topology (PageRank, Louvain, Cycles) */}
          {evidence?.graph_evidence && (
            <GraphEvidenceCard graphEvidence={evidence.graph_evidence} />
          )}

          {/* 8. Compliance & Regulatory Signals (CTR Structuring & Rails) */}
          {evidence?.compliance_signals && (
            <ComplianceSignalsCard complianceSignals={evidence.compliance_signals} />
          )}

          {/* Bottom Case Creation CTA */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>Ready to document investigative findings?</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Creating a case freezes this risk snapshot, logs an immutable audit trail, and surfaces the dossier to compliance officers.
              </div>
            </div>

            {createdCase ? (
              <Link to={`/investigations/${createdCase.case_id}`} style={{ textDecoration: 'none' }}>
                <Button variant="primary">
                  📁 Open Case Dossier ({createdCase.case_id}) →
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                onClick={handleCreateInvestigationCase}
                isLoading={isCreatingCase}
                disabled={isCreatingCase}
              >
                🚨 Create Investigation Case
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalyzeTransaction;
