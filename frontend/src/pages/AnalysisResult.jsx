import React, { useState, useEffect } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import RiskScoreCard from '../components/risk/RiskScoreCard';
import ComponentBreakdown from '../components/risk/ComponentBreakdown';
import ModelSignalsCard from '../components/evidence/ModelSignalsCard';
import BehavioralEvidenceCard from '../components/evidence/BehavioralEvidenceCard';
import GraphEvidenceCard from '../components/evidence/GraphEvidenceCard';
import ComplianceSignalsCard from '../components/evidence/ComplianceSignalsCard';
import AmlAnomaliesCard from '../components/evidence/AmlAnomaliesCard';
import MoneyFlowGraph from '../components/evidence/MoneyFlowGraph';
import { getAnalysisByTransactionId } from '../api/analysisApi';
import {
  getActiveCaseForTransaction,
  createInvestigation,
} from '../api/investigationApi';
import { resolveEvidence } from '../utils/explainabilityUtils';

export function AnalysisResult() {
  const { transactionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(location.state?.analysisResult || null);
  const [loading, setLoading] = useState(!location.state?.analysisResult && !!transactionId);
  const [error, setError] = useState(null);

  // Investigation case linkage state
  const [activeCase, setActiveCase] = useState(null);
  const [checkingCase, setCheckingCase] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const [caseActionError, setCaseActionError] = useState(null);

  useEffect(() => {
    // If not provided in state, fetch from historical MongoDB records
    if (!data && transactionId) {
      setLoading(true);
      getAnalysisByTransactionId(transactionId)
        .then((res) => {
          setData(res);
        })
        .catch((err) => {
          setError(err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [transactionId, data]);

  // Check whether an active investigation already exists for this transaction
  useEffect(() => {
    const txn = data?.transaction_id || transactionId;
    if (txn) {
      setCheckingCase(true);
      getActiveCaseForTransaction(txn)
        .then((res) => {
          if (res?.has_active_case && res.data) {
            setActiveCase(res.data);
          } else {
            setActiveCase(null);
          }
        })
        .catch(() => {
          // Non-blocking: leave activeCase null
        })
        .finally(() => {
          setCheckingCase(false);
        });
    }
  }, [data, transactionId]);

  const handleCreateCase = async () => {
    if (creatingCase || activeCase) return; // Prevent double click

    setCreatingCase(true);
    setCaseActionError(null);
    try {
      const payload = {
        transaction_id: data.transaction_id,
        analysis_id: data._id || data.analysis_id || undefined,
        priority: data.risk_tier || 'MEDIUM',
      };
      const res = await createInvestigation(payload);
      const newCase = res.data || res;
      setActiveCase(newCase);
      // Navigate to the newly created investigation case dossier
      navigate(`/investigations/${newCase.case_id}`);
    } catch (err) {
      setCaseActionError(err);
    } finally {
      setCreatingCase(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message={`Loading analysis for transaction ${transactionId}...`} />;
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <ErrorAlert error={error} />
        <Link to="/analyze">
          <Button variant="secondary">Back to Analyze Transaction</Button>
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <Card title="No Analysis Available">
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          No transaction assessment record was provided or found.
        </p>
        <Link to="/analyze">
          <Button variant="primary">Evaluate a Transaction</Button>
        </Link>
      </Card>
    );
  }

  const evidence = resolveEvidence(data, data.features_snapshot || data.features);
  const comp = evidence?.compliance_signals;
  const graph = evidence?.graph_evidence;
  const beh = evidence?.behavioral_evidence;

  // Extract concise top detection signals
  const topSignals = [];
  if (comp?.is_near_regulatory_threshold) {
    topSignals.push('Near-CTR Structuring Threshold (₹10,000 regulatory boundary)');
  }
  if (graph?.sender?.participates_in_cycle || graph?.receiver?.participates_in_cycle) {
    topSignals.push('Closed Circular Transaction Flow (Graph Cycle Detected)');
  }
  if (beh?.sender?.velocity_24h?.txn_count > 10) {
    topSignals.push(`Elevated 24h Velocity (${beh.sender.velocity_24h.txn_count} transactions)`);
  }
  if (beh?.transaction?.is_crypto) {
    topSignals.push('Cryptocurrency Payment Gateway Conduit');
  }
  if (beh?.transaction?.is_cross_border) {
    topSignals.push('International / Cross-Border Transfer Jurisdiction');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header & Quick Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            AML Investigation Dossier
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Multi-model risk assessment report for transaction <span className="font-mono">{data.transaction_id || 'N/A'}</span>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {activeCase ? (
            <Link to={`/investigations/${activeCase.case_id}`}>
              <Button variant="primary">
                📁 Open Full Case Dossier ({activeCase.case_id}) →
              </Button>
            </Link>
          ) : (
            <Button
              variant="primary"
              onClick={handleCreateCase}
              isLoading={creatingCase}
              disabled={creatingCase || checkingCase}
            >
              🚨 Create Investigation Case
            </Button>
          )}

          <Link to="/analyze">
            <Button variant="secondary">New Evaluation</Button>
          </Link>
        </div>
      </div>

      {caseActionError && (
        <ErrorAlert error={caseActionError} onDismiss={() => setCaseActionError(null)} />
      )}

      {/* 1. Overall Risk Score Banner */}
      <RiskScoreCard
        finalRiskScore={data.final_risk_score}
        riskTier={data.risk_tier}
        xgbScore={data.xgb_score}
        ifScore={data.isolation_forest_score}
        transactionId={data.transaction_id}
      />

      {/* 2. Mathematical Component Breakdown */}
      <ComponentBreakdown
        xgbProbability={data.xgb_probability}
        xgbScore={data.xgb_score}
        ifRawScore={data.isolation_forest_raw_score}
        ifScore={data.isolation_forest_score}
        finalRiskScore={data.final_risk_score}
        riskTier={data.risk_tier}
      />

      {/* 3. The 6 Core AML Anomaly & Typology Detections */}
      <AmlAnomaliesCard
        evidence={evidence}
        features={data.features_snapshot || data.features}
      />

      {/* 4. Interactive Visual Money Flow & Network Topology Diagram */}
      <MoneyFlowGraph
        evidence={evidence}
        features={data.features_snapshot || data.features}
        transactionId={data.transaction_id}
      />

      {/* 5. Sub-Model Explanations */}
      {evidence?.model_signals && (
        <ModelSignalsCard modelSignals={evidence.model_signals} />
      )}

      {/* 6. Behavioral Velocity Evidence */}
      {evidence?.behavioral_evidence && (
        <BehavioralEvidenceCard behavioralEvidence={evidence.behavioral_evidence} />
      )}

      {/* 7. Graph Topology Evidence */}
      {evidence?.graph_evidence && (
        <GraphEvidenceCard graphEvidence={evidence.graph_evidence} />
      )}

      {/* 8. Compliance & Regulatory Signals */}
      {evidence?.compliance_signals && (
        <ComplianceSignalsCard complianceSignals={evidence.compliance_signals} />
      )}

      {/* 9. Top Evidence Summary Card */}
      <Card title="Evidence Summary & Key Detection Signals">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
          {topSignals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                Primary Observed Risk Indicators:
              </div>
              <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {topSignals.map((signal, idx) => (
                  <li key={idx} style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>
              No critical non-standard risk thresholds exceeded. Nominal transaction characteristics observed.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem', backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Detailed behavioral metrics, network graph topology, and investigator case actions are consolidated in the full case dossier.
            </div>
            {activeCase ? (
              <Link to={`/investigations/${activeCase.case_id}`}>
                <Button variant="primary" style={{ fontSize: '0.85rem' }}>
                  Open Full Investigation Evidence →
                </Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                onClick={handleCreateCase}
                isLoading={creatingCase}
                disabled={creatingCase || checkingCase}
                style={{ fontSize: '0.85rem' }}
              >
                Create Case for Deep Evidence Analysis
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default AnalysisResult;
