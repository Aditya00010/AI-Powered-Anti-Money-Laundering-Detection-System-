/**
 * Project Vigilance — AML Explainability & Evidence Presentation Tests
 * ====================================================================
 * Tests the structured extraction and presentation of ML model signals,
 * behavioral velocity, graph network topology, and compliance flags.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { connectDB, disconnectDB, isDBConnected } = require('../src/config/db');
const { jwtSecret } = require('../src/config/env');
const { User } = require('../src/models/User');
const AmlAnalysis = require('../src/models/AmlAnalysis');
const { InvestigationCase } = require('../src/models/InvestigationCase');
const { extractExplainabilityEvidence } = require('../src/utils/explainabilityHelper');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

describe('AML Explainability & Evidence Presentation Tests', () => {
  let server;
  let investigatorToken;
  const sampleTxnId = `TXN_EXP_TEST_${Date.now()}`;
  let sampleCaseId;

  const mockFeatures = {
    amount: 9850.0,
    log_amount: 9.195,
    currency_INR: 1,
    channel_UPI: 1,
    is_crypto: 0,
    is_cross_border: 0,
    transaction_hour: 14,
    is_weekend: 0,
    sender_txn_count_prev_1h: 4,
    sender_amount_sum_prev_1h: 38000.0,
    sender_unique_receivers_prev_1h: 3,
    sender_txn_count_prev_24h: 18,
    sender_amount_sum_prev_24h: 145000.0,
    sender_unique_receivers_prev_24h: 12,
    sender_amount_avg_historical: 4500.0,
    amount_to_sender_avg_ratio: 2.18,
    sender_amount_zscore_historical: 2.45,
    sender_near_regulatory_threshold_txns_prev_24h: 3,
    sender_pagerank_score: 0.0042,
    sender_louvain_community_id: 17,
    sender_in_degree: 5,
    sender_out_degree: 28,
    sender_participates_in_cycle: 1,
    sender_shortest_cycle_length: 3,
    sender_total_cycle_count: 4,
    receiver_pagerank_score: 0.0018,
    receiver_louvain_community_id: 17,
    receiver_in_degree: 19,
    receiver_out_degree: 2,
    receiver_participates_in_cycle: 0,
  };

  before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    if (isDBConnected()) {
      await User.deleteMany({ username: 'test_exp_analyst' });
      await AmlAnalysis.deleteMany({ transaction_id: sampleTxnId });
      await InvestigationCase.deleteMany({ transaction_id: sampleTxnId });

      const investigator = await User.create({
        username: 'test_exp_analyst',
        email: 'test_exp_analyst@vigilance.internal',
        password_hash: 'mock_hash',
        role: 'INVESTIGATOR',
      });

      investigatorToken = jwt.sign(
        { id: investigator._id.toString(), username: investigator.username, role: investigator.role, active: true },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Create sample analysis record with features_snapshot
      const analysisDoc = await AmlAnalysis.create({
        transaction_id: sampleTxnId,
        xgb_probability: 0.92,
        xgb_score: 92.0,
        isolation_forest_raw_score: 0.58,
        isolation_forest_score: 70.0,
        final_risk_score: 87.6, // 0.8 * 92 + 0.2 * 70 = 73.6 + 14 = 87.6
        risk_tier: 'CRITICAL',
        features_snapshot: mockFeatures,
      });

      // Create associated investigation case
      const caseDoc = await InvestigationCase.create({
        case_id: `CASE-EXP-${Date.now()}`,
        analysis_id: analysisDoc._id,
        transaction_id: sampleTxnId,
        risk_score_snapshot: 87.6,
        risk_tier_snapshot: 'CRITICAL',
        xgb_score_snapshot: 92.0,
        isolation_forest_score_snapshot: 70.0,
        status: 'OPEN',
        priority: 'CRITICAL',
        opened_by: 'test_exp_analyst',
        features_snapshot: mockFeatures,
      });
      sampleCaseId = caseDoc.case_id;
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (isDBConnected()) {
      await User.deleteMany({ username: 'test_exp_analyst' });
      await AmlAnalysis.deleteMany({ transaction_id: sampleTxnId });
      await InvestigationCase.deleteMany({ transaction_id: sampleTxnId });
      await disconnectDB();
    }
  });

  it('1. GET /api/v1/analysis/:transactionId returns structured explainability evidence', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/analysis/${sampleTxnId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    const evidence = res.body.data.evidence;
    assert.ok(evidence, 'Evidence object must be present in analysis response');

    assert.ok(evidence.risk_breakdown);
    assert.ok(evidence.model_signals);
    assert.ok(evidence.behavioral_evidence);
    assert.ok(evidence.graph_evidence);
    assert.ok(evidence.compliance_signals);
  });

  it('2. Risk score breakdown is mathematically consistent with approved formula', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/analysis/${sampleTxnId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    const breakdown = res.body.data.evidence.risk_breakdown;
    assert.strictEqual(breakdown.xgb_score, 92.0);
    assert.strictEqual(breakdown.xgb_weight, 0.80);
    assert.strictEqual(breakdown.xgb_contribution, 73.6);

    assert.strictEqual(breakdown.isolation_forest_score, 70.0);
    assert.strictEqual(breakdown.isolation_forest_weight, 0.20);
    assert.strictEqual(breakdown.isolation_forest_contribution, 14.0);

    const calculatedSum = Number((breakdown.xgb_contribution + breakdown.isolation_forest_contribution).toFixed(2));
    assert.strictEqual(calculatedSum, 87.6);
    assert.strictEqual(breakdown.final_risk_score, 87.6);
    assert.strictEqual(breakdown.mathematically_consistent, true);
  });

  it('3. GET /api/v1/investigations/:caseId returns complete explainability dossier', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/investigations/${sampleCaseId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    assert.strictEqual(res.statusCode, 200);
    const evidence = res.body.data.evidence;
    assert.ok(evidence);
    assert.strictEqual(evidence.risk_breakdown.final_risk_score, 87.6);
    assert.strictEqual(evidence.risk_breakdown.risk_tier, 'CRITICAL');
  });

  it('4. Graph network topology metrics are accurately extracted for sender and receiver', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/investigations/${sampleCaseId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    const graph = res.body.data.evidence.graph_evidence;
    assert.strictEqual(graph.sender.pagerank, 0.0042);
    assert.strictEqual(graph.sender.louvain_community_id, '17');
    assert.strictEqual(graph.sender.in_degree, 5);
    assert.strictEqual(graph.sender.out_degree, 28);
    assert.strictEqual(graph.sender.participates_in_cycle, true);
    assert.strictEqual(graph.sender.shortest_cycle_length, 3);
    assert.strictEqual(graph.sender.total_cycle_count, 4);

    assert.strictEqual(graph.receiver.pagerank, 0.0018);
    assert.strictEqual(graph.receiver.participates_in_cycle, false);
    assert.ok(graph.glossary);
    assert.ok(graph.cautionary_notice);
  });

  it('5. Compliance signals flag near-regulatory structuring boundary', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/investigations/${sampleCaseId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    const compliance = res.body.data.evidence.compliance_signals;
    assert.strictEqual(compliance.transaction_amount, 9850.0);
    assert.strictEqual(compliance.regulatory_ctr_boundary, 10000.0);
    assert.strictEqual(compliance.is_near_regulatory_threshold, true);
    assert.strictEqual(compliance.near_threshold_txns_prev_24h, 3);
    assert.ok(compliance.summary_notes.length >= 1);
  });

  it('6. Helper handles missing or sparse optional features gracefully without errors', () => {
    const sparseRecord = {
      final_risk_score: 22.5,
      risk_tier: 'LOW',
      xgb_score: 25.0,
      isolation_forest_score: 12.5,
    };

    const evidence = extractExplainabilityEvidence(sparseRecord, null);
    assert.ok(evidence);
    assert.strictEqual(evidence.risk_breakdown.final_risk_score, 22.5);
    assert.strictEqual(evidence.behavioral_evidence.transaction.channel, 'Unknown');
    assert.strictEqual(evidence.graph_evidence.sender.pagerank, 0.0);
    assert.strictEqual(evidence.graph_evidence.sender.participates_in_cycle, false);
  });

  it('7. No sensitive model internal parameters or secrets are exposed', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/investigations/${sampleCaseId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    const bodyStr = JSON.stringify(res.body);
    assert.strictEqual(bodyStr.includes('tree_dump'), false);
    assert.strictEqual(bodyStr.includes('base_estimator_'), false);
    assert.strictEqual(bodyStr.includes('estimators_samples_'), false);
    assert.strictEqual(bodyStr.includes('raw_weights'), false);
    assert.strictEqual(bodyStr.includes('password_hash'), false);
  });
});
