/**
 * Project Vigilance — Investigation & Case Management Tests
 * ========================================================
 * Tests case lifecycle, action history audits, RBAC permissions,
 * immutable risk snapshots, and duplicate active case prevention.
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
const { InvestigationAction } = require('../src/models/InvestigationAction');

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

describe('AML Investigation & Case Management Tests', () => {
  let server;
  let adminToken;
  let investigatorToken;
  let complianceToken;
  let managerToken;
  let sampleAnalysisId;
  const sampleTxnId = `TXN_TEST_CASE_${Date.now()}`;
  let createdCaseId;

  before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // Cleanup test collections
    if (isDBConnected()) {
      await User.deleteMany({ username: { $in: ['test_inv_admin', 'test_inv_analyst', 'test_inv_comp', 'test_inv_mgr'] } });
      await InvestigationCase.deleteMany({ transaction_id: { $regex: /^TXN_TEST_CASE_/ } });
      await InvestigationAction.deleteMany({});
      await AmlAnalysis.deleteMany({ transaction_id: { $regex: /^TXN_TEST_CASE_/ } });

      // Create test users
      const admin = await User.create({
        username: 'test_inv_admin',
        email: 'test_inv_admin@vigilance.internal',
        password_hash: 'mock_hash',
        role: 'ADMIN',
      });
      const investigator = await User.create({
        username: 'test_inv_analyst',
        email: 'test_inv_analyst@vigilance.internal',
        password_hash: 'mock_hash',
        role: 'INVESTIGATOR',
      });
      const compliance = await User.create({
        username: 'test_inv_comp',
        email: 'test_inv_comp@vigilance.internal',
        password_hash: 'mock_hash',
        role: 'COMPLIANCE_OFFICER',
      });
      const manager = await User.create({
        username: 'test_inv_mgr',
        email: 'test_inv_mgr@vigilance.internal',
        password_hash: 'mock_hash',
        role: 'MANAGER',
      });

      adminToken = jwt.sign(
        { id: admin._id.toString(), username: admin.username, role: admin.role, active: true },
        jwtSecret,
        { expiresIn: '1h' }
      );
      investigatorToken = jwt.sign(
        { id: investigator._id.toString(), username: investigator.username, role: investigator.role, active: true },
        jwtSecret,
        { expiresIn: '1h' }
      );
      complianceToken = jwt.sign(
        { id: compliance._id.toString(), username: compliance.username, role: compliance.role, active: true },
        jwtSecret,
        { expiresIn: '1h' }
      );
      managerToken = jwt.sign(
        { id: manager._id.toString(), username: manager.username, role: manager.role, active: true },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Create sample analysis record
      const analysisDoc = await AmlAnalysis.create({
        transaction_id: sampleTxnId,
        xgb_probability: 0.88,
        xgb_score: 88.0,
        isolation_forest_raw_score: -0.15,
        isolation_forest_score: 82.5,
        final_risk_score: 86.9,
        risk_tier: 'CRITICAL',
        features_snapshot: { log_amount: 11.2 },
      });
      sampleAnalysisId = analysisDoc._id.toString();
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (isDBConnected()) {
      await User.deleteMany({ username: { $in: ['test_inv_admin', 'test_inv_analyst', 'test_inv_comp', 'test_inv_mgr'] } });
      await InvestigationCase.deleteMany({ transaction_id: { $regex: /^TXN_TEST_CASE_/ } });
      await AmlAnalysis.deleteMany({ transaction_id: { $regex: /^TXN_TEST_CASE_/ } });
      await disconnectDB();
    }
  });

  it('1. Unauthenticated case access rejected with 401', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/investigations',
      method: 'GET',
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('2. Authenticated investigator can view cases (200)', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/investigations',
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  it('3. Nonexistent analysis cannot create a case (404)', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/investigations',
        method: 'POST',
        headers: { Authorization: `Bearer ${investigatorToken}` },
      },
      { analysis_id: fakeId }
    );
    assert.strictEqual(res.statusCode, 404);
  });

  it('4. Authorized investigator can create case from analysis (201)', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/investigations',
        method: 'POST',
        headers: { Authorization: `Bearer ${investigatorToken}` },
      },
      {
        analysis_id: sampleAnalysisId,
        initial_note: 'Flagged due to anomalous cross-border crypto gateway volume.',
      }
    );
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.case_id);
    createdCaseId = res.body.data.case_id;

    assert.strictEqual(res.body.data.transaction_id, sampleTxnId);
    assert.strictEqual(res.body.data.status, 'OPEN');
    assert.strictEqual(res.body.data.priority, 'CRITICAL');
    assert.strictEqual(res.body.data.opened_by, 'test_inv_analyst');
    assert.strictEqual(res.body.data.notes.length, 1);
  });

  it('5. Case snapshot preserves original risk score and risk tier accurately', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/investigations/${createdCaseId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const caseData = res.body.data;
    assert.strictEqual(caseData.risk_score_snapshot, 86.9);
    assert.strictEqual(caseData.risk_tier_snapshot, 'CRITICAL');
    assert.strictEqual(caseData.xgb_score_snapshot, 88.0);
    assert.strictEqual(caseData.isolation_forest_score_snapshot, 82.5);
  });

  it('6. Duplicate active case creation is rejected with 409 Conflict', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/investigations',
        method: 'POST',
        headers: { Authorization: `Bearer ${investigatorToken}` },
      },
      { analysis_id: sampleAnalysisId }
    );
    assert.strictEqual(res.statusCode, 409);
    assert.match(res.body.message, /already exists/i);
  });

  it('7. Manager cannot create case or mutate status (403 Forbidden)', async () => {
    // Attempt creation
    const resCreate = await makeRequest(
      server,
      {
        path: '/api/v1/investigations',
        method: 'POST',
        headers: { Authorization: `Bearer ${managerToken}` },
      },
      { transaction_id: 'TXN_ANY' }
    );
    assert.strictEqual(resCreate.statusCode, 403);

    // Attempt status mutation
    const resStatus = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${managerToken}` },
      },
      { status: 'INVESTIGATING' }
    );
    assert.strictEqual(resStatus.statusCode, 403);
  });

  it('8. Rejects invalid status transition with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { status: 'INVALID_STATUS' }
    );
    assert.strictEqual(res.statusCode, 400);
  });

  it('9. Valid status transition updates status and sets closed_at when CLOSED', async () => {
    // 1. OPEN -> INVESTIGATING
    const res1 = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${investigatorToken}` },
      },
      { status: 'INVESTIGATING', note: 'Commencing blockchain ego-net analysis.' }
    );
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.data.status, 'INVESTIGATING');
    assert.strictEqual(res1.body.data.closed_at, null);

    // 2. INVESTIGATING -> ESCALATED (by Compliance Officer)
    const res2 = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${complianceToken}` },
      },
      { status: 'ESCALATED', note: 'Escalated to ML compliance board.' }
    );
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.data.status, 'ESCALATED');

    // 3. ESCALATED -> CLOSED (by Admin)
    const res3 = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { status: 'CLOSED', note: 'SAR filing ref #SAR-2026-991 submitted. Case closed.' }
    );
    assert.strictEqual(res3.statusCode, 200);
    assert.strictEqual(res3.body.data.status, 'CLOSED');
    assert.ok(res3.body.data.closed_at);
  });

  it('10. Authorized assignment and reassignment works', async () => {
    // Admin reassigns case to test_inv_comp
    const res = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/assignee`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { assigned_to: 'test_inv_comp' }
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.assigned_to, 'test_inv_comp');
  });

  it('11. Note creation appends to case notes and creates audit action', async () => {
    const res = await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/notes`,
        method: 'POST',
        headers: { Authorization: `Bearer ${complianceToken}` },
      },
      { text: 'Auditor notes: Confirmed SAR submission with FIU.' }
    );
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    const lastNote = res.body.data.notes[res.body.data.notes.length - 1];
    assert.strictEqual(lastNote.author, 'test_inv_comp');
    assert.strictEqual(lastNote.text, 'Auditor notes: Confirmed SAR submission with FIU.');
  });

  it('12. Case details endpoint returns associated chronological action history', async () => {
    const res = await makeRequest(server, {
      path: `/api/v1/investigations/${createdCaseId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const caseData = res.body.data;
    assert.ok(Array.isArray(caseData.actions));
    assert.ok(caseData.actions.length >= 4); // CASE_CREATED, CASE_ASSIGNED, STATUS_CHANGED (x3), NOTE_ADDED

    const actionTypes = caseData.actions.map((a) => a.action_type);
    assert.ok(actionTypes.includes('CASE_CREATED'));
    assert.ok(actionTypes.includes('STATUS_CHANGED') || actionTypes.includes('CASE_ESCALATED'));
    assert.ok(actionTypes.includes('CASE_CLOSED'));
    assert.ok(actionTypes.includes('NOTE_ADDED'));
  });

  it('13. Active case for transaction lookup endpoint works accurately', async () => {
    // The previous case was CLOSED, so active lookup should report has_active_case: false
    const resInactive = await makeRequest(server, {
      path: `/api/v1/investigations/transaction/${sampleTxnId}/active`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    assert.strictEqual(resInactive.statusCode, 200);
    assert.strictEqual(resInactive.body.has_active_case, false);

    // Reopen case to test active lookup
    await makeRequest(
      server,
      {
        path: `/api/v1/investigations/${createdCaseId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { status: 'OPEN' }
    );

    const resActive = await makeRequest(server, {
      path: `/api/v1/investigations/transaction/${sampleTxnId}/active`,
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    assert.strictEqual(resActive.statusCode, 200);
    assert.strictEqual(resActive.body.has_active_case, true);
    assert.strictEqual(resActive.body.data.case_id, createdCaseId);
  });
});
