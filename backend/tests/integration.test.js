/**
 * Project Vigilance - End-to-End Integration Tests
 * ================================================
 * Validates the full service-to-service flow:
 * Express Backend -> Python FastAPI ML Service -> AMLInferenceEngine -> MongoDB Persistence
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
const app = require('../src/app');
const { connectDB, disconnectDB, isDBConnected } = require('../src/config/db');
const { jwtSecret } = require('../src/config/env');
const AmlAnalysis = require('../src/models/AmlAnalysis');
const { User } = require('../src/models/User');

const sampleTx = require('./fixtures/sample_transaction.json');
const criticalTx = require('./fixtures/critical_transaction.json');

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

function isServiceUp(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode === 200);
      })
      .on('error', () => {
        resolve(false);
      });
  });
}

function waitForService(url, maxAttempts = 60, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error(`Service at ${url} returned status ${res.statusCode}`));
          } else {
            setTimeout(check, intervalMs);
          }
        })
        .on('error', () => {
          if (attempts >= maxAttempts) {
            reject(new Error(`Service at ${url} not reachable after ${maxAttempts} attempts`));
          } else {
            setTimeout(check, intervalMs);
          }
        });
    };
    check();
  });
}

describe('End-to-End MERN + Python ML Integration Tests', () => {
  let uvicornProc = null;
  let expressServer = null;
  let authHeaders = null;

  before(async () => {
    const isAlreadyRunning = await isServiceUp('http://127.0.0.1:8000/health');
    if (!isAlreadyRunning) {
      // Launch FastAPI ML service via uvicorn
      const projectRoot = path.resolve(__dirname, '../../');
      uvicornProc = spawn(
        'python',
        ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
        {
          cwd: path.resolve(projectRoot, 'ml-service'),
          stdio: 'ignore',
          detached: false,
          shell: true,
        }
      );
      console.log('[Integration Test] Waiting for Python FastAPI ML service to initialize...');
      await waitForService('http://127.0.0.1:8000/health');
    }
    console.log('[Integration Test] FastAPI ML service is ready!');

    // 2. Connect to MongoDB
    await connectDB();

    // Provision integration test investigator user
    const testUser = await User.findOneAndUpdate(
      { username: 'integration_investigator' },
      {
        username: 'integration_investigator',
        email: 'integration@vigilance.com',
        password_hash: await User.hashPassword('Password123!'),
        role: 'INVESTIGATOR',
        active: true,
      },
      { upsert: true, new: true }
    );

    const testToken = jwt.sign(
      { id: testUser._id.toString(), username: testUser.username, role: testUser.role },
      jwtSecret,
      { expiresIn: '1h' }
    );
    authHeaders = { Authorization: `Bearer ${testToken}` };

    // 3. Start Express server on random port
    await new Promise((resolve) => {
      expressServer = app.listen(0, resolve);
    });
    console.log(`[Integration Test] Express server listening on port ${expressServer.address().port}`);
  });

  after(async () => {
    // Clean up test documents in MongoDB
    if (isDBConnected()) {
      await AmlAnalysis.deleteMany({
        transaction_id: { $in: [sampleTx.input.transaction_id, criticalTx.input.transaction_id] },
      });
      await User.deleteOne({ username: 'integration_investigator' });
      await disconnectDB();
    }

    // Close Express
    if (expressServer) {
      await new Promise((resolve) => expressServer.close(resolve));
    }

    // Kill Uvicorn process
    if (uvicornProc) {
      try {
        process.kill(uvicornProc.pid);
      } catch (_) {}
    }
  });

  it('1. GET /health checks Express backend operational status', async () => {
    const res = await makeRequest(expressServer, { path: '/health', method: 'GET' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'project-vigilance-backend');
    assert.equal(res.body.database_connected, true);
  });

  it('2. GET /health/ml tests Express -> FastAPI connectivity', async () => {
    const res = await makeRequest(expressServer, { path: '/health/ml', method: 'GET' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.ml_service.status, 'ok');
    assert.equal(res.body.ml_service.models_loaded.xgboost, true);
    assert.equal(res.body.ml_service.models_loaded.isolation_forest, true);
  });

  it('3. POST /api/v1/analysis/evaluate correctly evaluates and reproduces LOW-tier transaction', async () => {
    const res = await makeRequest(
      expressServer,
      { path: '/api/v1/analysis/evaluate', method: 'POST', headers: authHeaders },
      sampleTx.input
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const data = res.body.data;

    // Verify against approved AMLInferenceEngine reference values
    assert.equal(data.transaction_id, sampleTx.expected_output.transaction_id);
    assert.equal(data.risk_tier, sampleTx.expected_output.risk_tier);
    assert.ok(Math.abs(data.final_risk_score - sampleTx.expected_output.final_risk_score) < 1e-4);
    assert.ok(Math.abs(data.xgb_probability - sampleTx.expected_output.xgb_probability) < 1e-4);
    assert.ok(Math.abs(data.xgb_score - sampleTx.expected_output.xgb_score) < 1e-4);
    assert.ok(Math.abs(data.isolation_forest_raw_score - sampleTx.expected_output.isolation_forest_raw_score) < 1e-4);
    assert.ok(Math.abs(data.isolation_forest_score - sampleTx.expected_output.isolation_forest_score) < 1e-4);
    assert.equal(data.persisted, true);
  });

  it('4. GET /api/v1/analysis/:transactionId retrieves persisted MongoDB record', async () => {
    const txId = sampleTx.input.transaction_id;
    const res = await makeRequest(
      expressServer,
      { path: `/api/v1/analysis/${txId}`, method: 'GET', headers: authHeaders }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.transaction_id, txId);
    assert.equal(res.body.data.risk_tier, 'LOW');
    assert.ok(Math.abs(res.body.data.final_risk_score - sampleTx.expected_output.final_risk_score) < 1e-4);
  });

  it('5. POST /api/v1/analysis/evaluate correctly evaluates and persists CRITICAL-tier transaction', async () => {
    const res = await makeRequest(
      expressServer,
      { path: '/api/v1/analysis/evaluate', method: 'POST', headers: authHeaders },
      criticalTx.input
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const data = res.body.data;

    assert.equal(data.transaction_id, criticalTx.expected_output.transaction_id);
    assert.equal(data.risk_tier, 'CRITICAL');
    assert.ok(Math.abs(data.final_risk_score - criticalTx.expected_output.final_risk_score) < 1e-4);
    assert.equal(data.persisted, true);

    // Verify persistence in MongoDB directly
    const doc = await AmlAnalysis.findOne({ transaction_id: criticalTx.input.transaction_id });
    assert.ok(doc !== null);
    assert.equal(doc.risk_tier, 'CRITICAL');
  });

  it('6. POST /api/v1/analysis/evaluate propagates 400 when missing features are submitted', async () => {
    const invalidInput = {
      transaction_id: 'TXN_INVALID_MISSING',
      features: {
        amount: 1000.0, // missing 83 features
      },
    };

    const res = await makeRequest(
      expressServer,
      { path: '/api/v1/analysis/evaluate', method: 'POST', headers: authHeaders },
      invalidInput
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'MLServiceValidationError');
    assert.ok(res.body.message.includes('Missing'));
  });

  it('7. POST /api/v1/analysis/evaluate propagates 400 when raw identifiers are submitted', async () => {
    const corruptedFeatures = { ...sampleTx.input.features, sender_account: 'ACC_RAW_123' };
    const invalidInput = {
      transaction_id: 'TXN_INVALID_RAW',
      features: corruptedFeatures,
    };

    const res = await makeRequest(
      expressServer,
      { path: '/api/v1/analysis/evaluate', method: 'POST', headers: authHeaders },
      invalidInput
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'MLServiceValidationError');
    assert.ok(res.body.message.includes('Raw identifier'));
  });
});
