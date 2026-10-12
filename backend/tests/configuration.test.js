/**
 * Project Vigilance — Configuration Management Tests
 * ===================================================
 * Validates operational AML risk-tier thresholds, admin mutation controls,
 * strict validation invariants, audit logging, and dynamic risk-tier integration.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { connectDB, disconnectDB, isDBConnected } = require('../src/config/db');
const { jwtSecret } = require('../src/config/env');
const { User } = require('../src/models/User');
const AmlConfiguration = require('../src/models/AmlConfiguration');
const { mlClient } = require('../src/services/mlClient');

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

describe('Configurable Risk Threshold Management Tests', () => {
  let server;
  let adminUser;
  let investigatorUser;
  let complianceUser;
  let managerUser;

  let adminToken;
  let investigatorToken;
  let complianceToken;
  let managerToken;

  before(async () => {
    await connectDB();

    // Clean test data
    await User.deleteMany({ email: { $regex: /@cfgtest\.vigilance\.com$/ } });
    await AmlConfiguration.deleteMany({});

    const passwordHash = await User.hashPassword('Pass12345!');

    adminUser = await User.create({
      username: 'cfg_admin',
      email: 'admin@cfgtest.vigilance.com',
      password_hash: passwordHash,
      role: 'ADMIN',
      active: true,
    });

    investigatorUser = await User.create({
      username: 'cfg_investigator',
      email: 'investigator@cfgtest.vigilance.com',
      password_hash: passwordHash,
      role: 'INVESTIGATOR',
      active: true,
    });

    complianceUser = await User.create({
      username: 'cfg_compliance',
      email: 'compliance@cfgtest.vigilance.com',
      password_hash: passwordHash,
      role: 'COMPLIANCE_OFFICER',
      active: true,
    });

    managerUser = await User.create({
      username: 'cfg_manager',
      email: 'manager@cfgtest.vigilance.com',
      password_hash: passwordHash,
      role: 'MANAGER',
      active: true,
    });

    adminToken = jwt.sign({ id: adminUser._id.toString(), username: adminUser.username, role: 'ADMIN' }, jwtSecret, { expiresIn: '1h' });
    investigatorToken = jwt.sign({ id: investigatorUser._id.toString(), username: investigatorUser.username, role: 'INVESTIGATOR' }, jwtSecret, { expiresIn: '1h' });
    complianceToken = jwt.sign({ id: complianceUser._id.toString(), username: complianceUser.username, role: 'COMPLIANCE_OFFICER' }, jwtSecret, { expiresIn: '1h' });
    managerToken = jwt.sign({ id: managerUser._id.toString(), username: managerUser.username, role: 'MANAGER' }, jwtSecret, { expiresIn: '1h' });

    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  after(async () => {
    if (isDBConnected()) {
      await User.deleteMany({ email: { $regex: /@cfgtest\.vigilance\.com$/ } });
      await AmlConfiguration.deleteMany({});
      await disconnectDB();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('1. GET /api/v1/configuration returns default approved baseline on first run', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/configuration',
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.low_max, 30.0);
    assert.equal(res.body.data.medium_max, 60.0);
    assert.equal(res.body.data.high_max, 80.0);
    assert.equal(res.body.data.critical_max, 100.0);
    assert.equal(res.body.data.alert_threshold, 60.0);
  });

  it('2. Unauthenticated GET /api/v1/configuration is rejected with 401', async () => {
    const res = await makeRequest(server, { path: '/api/v1/configuration', method: 'GET' });
    assert.equal(res.statusCode, 401);
  });

  it('3. ADMIN can successfully update operational thresholds via PUT', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      {
        low_max: 25.0,
        medium_max: 55.0,
        high_max: 75.0,
        critical_max: 100.0,
        change_notes: 'Tightening medium/high boundaries for quarterly audit',
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.low_max, 25.0);
    assert.equal(res.body.data.medium_max, 55.0);
    assert.equal(res.body.data.high_max, 75.0);
    assert.equal(res.body.data.updated_by_username, 'cfg_admin');
  });

  it('4. Investigator is forbidden from mutating configuration via PUT (403)', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${investigatorToken}` },
      },
      { low_max: 20.0, medium_max: 50.0, high_max: 70.0, critical_max: 100.0 }
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'ForbiddenError');
  });

  it('5. Compliance Officer is forbidden from mutating configuration via PUT (403)', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${complianceToken}` },
      },
      { low_max: 20.0, medium_max: 50.0, high_max: 70.0, critical_max: 100.0 }
    );

    assert.equal(res.statusCode, 403);
  });

  it('6. Manager is forbidden from mutating configuration via PUT (403)', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${managerToken}` },
      },
      { low_max: 20.0, medium_max: 50.0, high_max: 70.0, critical_max: 100.0 }
    );

    assert.equal(res.statusCode, 403);
  });

  it('7. Rejects invalid threshold ordering (low_max >= medium_max) with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { low_max: 65.0, medium_max: 60.0, high_max: 80.0, critical_max: 100.0 }
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('ordering violation'));
  });

  it('8. Rejects negative thresholds with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { low_max: -5.0, medium_max: 60.0, high_max: 80.0, critical_max: 100.0 }
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('between 0.0 and 100.0'));
  });

  it('9. Rejects thresholds greater than 100 with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { low_max: 30.0, medium_max: 60.0, high_max: 80.0, critical_max: 105.0 }
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('between 0.0 and 100.0'));
  });

  it('10. Rejects non-numeric/NaN/Infinity thresholds with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { low_max: 'thirty', medium_max: 60.0, high_max: 80.0, critical_max: 100.0 }
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('finite number'));
  });

  it('11. Rejects arbitrary MongoDB operator injection ($set) with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/configuration',
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { $set: { is_active: false } }
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('injection attempt'));
  });

  it('12. Reset endpoint (POST /reset) restores approved baseline for ADMIN', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/configuration/reset',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.low_max, 30.0);
    assert.equal(res.body.data.medium_max, 60.0);
    assert.equal(res.body.data.high_max, 80.0);
    assert.equal(res.body.data.critical_max, 100.0);
    assert.equal(res.body.data.updated_by_username, 'cfg_admin');
  });

  it('13. Investigator is forbidden from calling /reset (403)', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/configuration/reset',
      method: 'POST',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });

    assert.equal(res.statusCode, 403);
  });

  it('14. Demonstrates operational tier change: score 75 shifts from HIGH to CRITICAL when high_max is lowered to 70', async () => {
    const originalAnalyze = mlClient.analyzeTransaction;
    // Mock ML output with score 75.0 (which falls between 60.01 and 80.0 -> baseline HIGH)
    mlClient.analyzeTransaction = async (p) => ({
      transaction_id: p.transaction_id,
      xgb_probability: 0.75,
      xgb_score: 75.0,
      isolation_forest_raw_score: -0.05,
      isolation_forest_score: 75.0,
      final_risk_score: 75.0, // Fixed mathematical ML score
      risk_tier: 'HIGH', // Model baseline tier
    });

    try {
      // 1. Reset to baseline (high_max = 80)
      await makeRequest(server, {
        path: '/api/v1/configuration/reset',
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // Evaluation with baseline: 75.0 <= 80.0 -> HIGH
      const resBaseline = await makeRequest(
        server,
        {
          path: '/api/v1/analysis/evaluate',
          method: 'POST',
          headers: { Authorization: `Bearer ${investigatorToken}` },
        },
        { transaction_id: 'TXN_TIER_DEMO_1', features: { amount: 50000 } }
      );

      assert.equal(resBaseline.statusCode, 200);
      assert.equal(resBaseline.body.data.final_risk_score, 75.0);
      assert.equal(resBaseline.body.data.risk_tier, 'HIGH');

      // 2. Admin lowers high_max to 70.0
      const resConfigUpdate = await makeRequest(
        server,
        {
          path: '/api/v1/configuration',
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { low_max: 30.0, medium_max: 60.0, high_max: 70.0, critical_max: 100.0 }
      );
      assert.equal(resConfigUpdate.statusCode, 200);

      // Evaluation with new thresholds: 75.0 > 70.0 -> CRITICAL
      // But final_risk_score remains EXACTLY 75.0!
      const resShifted = await makeRequest(
        server,
        {
          path: '/api/v1/analysis/evaluate',
          method: 'POST',
          headers: { Authorization: `Bearer ${investigatorToken}` },
        },
        { transaction_id: 'TXN_TIER_DEMO_2', features: { amount: 50000 } }
      );

      assert.equal(resShifted.statusCode, 200);
      assert.equal(resShifted.body.data.final_risk_score, 75.0); // ML score strictly unchanged
      assert.equal(resShifted.body.data.risk_tier, 'CRITICAL'); // Operational tier shifted to CRITICAL
      assert.equal(resShifted.body.data.model_baseline_tier, 'HIGH'); // Model baseline preserved

      // Reset back to baseline for cleanup
      await makeRequest(server, {
        path: '/api/v1/configuration/reset',
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    } finally {
      mlClient.analyzeTransaction = originalAnalyze;
    }
  });
});
