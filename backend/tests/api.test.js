/**
 * Project Vigilance - Express API Unit / Integration Tests
 * ========================================================
 * Validates Express routes, middleware, security rules, and error handling.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { jwtSecret } = require('../src/config/env');
const { mlClient } = require('../src/services/mlClient');

// Helper to make HTTP requests against the in-memory Express server
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

describe('Express API Tests', () => {
  let server;
  let investigatorToken;

  before(async () => {
    investigatorToken = jwt.sign(
      { id: 'test_investigator_id', username: 'investigator1', role: 'INVESTIGATOR' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    return new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  after(async () => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  it('GET /health returns 200 with status ok and service identifier', async () => {
    const res = await makeRequest(server, { path: '/health', method: 'GET' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'project-vigilance-backend');
    assert.ok(typeof res.body.uptime_seconds === 'number');
    assert.ok('database_connected' in res.body);
  });

  it('GET /non-existent-route returns 404', async () => {
    const res = await makeRequest(server, { path: '/api/v1/unknown-endpoint', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'NotFoundError');
  });

  it('POST /api/v1/analysis/evaluate rejects unauthenticated request with 401', async () => {
    const res = await makeRequest(server, { path: '/api/v1/analysis/evaluate', method: 'POST' }, { features: { amount: 100 } });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
    assert(res.body.message.includes('token required'));
  });

  it('POST /api/v1/analysis/evaluate rejects empty request body with 400', async () => {
    const res = await makeRequest(
      server,
      {
        path: '/api/v1/analysis/evaluate',
        method: 'POST',
        headers: { Authorization: `Bearer ${investigatorToken}` },
      },
      {}
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'ValidationError');
    assert(res.body.message.includes('empty'));
  });

  it('POST /api/v1/analysis/evaluate does NOT trust client risk scores', async () => {
    // Mock mlClient.analyzeTransaction to verify sanitized payload
    const originalAnalyze = mlClient.analyzeTransaction;
    let interceptedPayload = null;

    mlClient.analyzeTransaction = async (payload) => {
      interceptedPayload = payload;
      return {
        transaction_id: payload.transaction_id,
        xgb_probability: 0.1,
        xgb_score: 10.0,
        isolation_forest_raw_score: 0.4,
        isolation_forest_score: 20.0,
        final_risk_score: 12.0,
        risk_tier: 'LOW',
      };
    };

    try {
      const clientForgedPayload = {
        transaction_id: 'TXN_CLIENT_FORGED_1',
        features: {
          amount: 500.0,
          // Attacker attempts to forge clean score
          final_risk_score: 0.0,
          risk_tier: 'LOW',
        },
      };

      const res = await makeRequest(
        server,
        {
          path: '/api/v1/analysis/evaluate',
          method: 'POST',
          headers: { Authorization: `Bearer ${investigatorToken}` },
        },
        clientForgedPayload
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.final_risk_score, 12.0); // Real ML score returned, not 0.0

      // Ensure client-supplied score was deleted from features before passing to ML
      assert.equal(interceptedPayload.features.final_risk_score, undefined);
      assert.equal(interceptedPayload.features.risk_tier, undefined);
    } finally {
      mlClient.analyzeTransaction = originalAnalyze;
    }
  });

  it('POST /api/v1/analysis/evaluate returns 503 when ML service is unavailable', async () => {
    const originalAnalyze = mlClient.analyzeTransaction;
    const { MLServiceUnavailableError } = require('../src/utils/errors');

    mlClient.analyzeTransaction = async () => {
      throw new MLServiceUnavailableError('Connection refused to ML service');
    };

    try {
      const res = await makeRequest(
        server,
        {
          path: '/api/v1/analysis/evaluate',
          method: 'POST',
          headers: { Authorization: `Bearer ${investigatorToken}` },
        },
        { transaction_id: 'TXN_FAIL_1', features: { amount: 100 } }
      );

      assert.equal(res.statusCode, 503);
      assert.equal(res.body.error, 'MLServiceUnavailableError');
      assert(res.body.message.includes('Connection refused'));
    } finally {
      mlClient.analyzeTransaction = originalAnalyze;
    }
  });

  it('POST /api/v1/analysis/evaluate returns 504 when ML service times out', async () => {
    const originalAnalyze = mlClient.analyzeTransaction;
    const { MLServiceTimeoutError } = require('../src/utils/errors');

    mlClient.analyzeTransaction = async () => {
      throw new MLServiceTimeoutError('ML request timed out');
    };

    try {
      const res = await makeRequest(
        server,
        {
          path: '/api/v1/analysis/evaluate',
          method: 'POST',
          headers: { Authorization: `Bearer ${investigatorToken}` },
        },
        { transaction_id: 'TXN_TIMEOUT_1', features: { amount: 100 } }
      );

      assert.equal(res.statusCode, 504);
      assert.equal(res.body.error, 'MLServiceTimeoutError');
    } finally {
      mlClient.analyzeTransaction = originalAnalyze;
    }
  });
});
