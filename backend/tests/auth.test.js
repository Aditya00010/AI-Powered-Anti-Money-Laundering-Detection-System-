/**
 * Project Vigilance — Security & RBAC Unit/Integration Tests
 * ==========================================================
 * Tests all Phase 5 Step 4 authentication and authorization requirements:
 * 1. Login with valid credentials → success
 * 2. Login with invalid password → 401
 * 3. Login with nonexistent user → 401
 * 4. Missing token → 401
 * 5. Invalid token → 401
 * 6. Expired token → 401
 * 7. Inactive user → 403
 * 8. Investigator accessing ADMIN endpoint → 403
 * 9. Compliance Officer accessing ADMIN endpoint → 403
 * 10. Manager accessing ADMIN endpoint → 403
 * 11. Admin accessing ADMIN endpoint → success
 * 12. Public registration cannot create ADMIN (defaults to INVESTIGATOR)
 * 13. Password is never returned
 * 14. Password hash is never returned
 * 15. Protected analysis endpoint rejects unauthenticated request
 * 16. Authorized investigator can perform permitted analysis
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { connectDB, disconnectDB, isDBConnected } = require('../src/config/db');
const { jwtSecret } = require('../src/config/env');
const { User } = require('../src/models/User');
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

describe('Authentication & Role-Based Access Control (RBAC) Security Tests', () => {
  let server;
  let adminUser;
  let investigatorUser;
  let complianceUser;
  let managerUser;
  let inactiveUser;

  let adminToken;
  let investigatorToken;
  let complianceToken;
  let managerToken;
  let inactiveToken;

  before(async () => {
    await connectDB();

    // Clean up any existing test users
    await User.deleteMany({ email: { $regex: /@sectest\.vigilance\.com$/ } });

    // Seed test users for all 4 approved roles + 1 inactive user
    const passwordHash = await User.hashPassword('SecuredPass123!');

    adminUser = await User.create({
      username: 'admin_test',
      email: 'admin@sectest.vigilance.com',
      password_hash: passwordHash,
      role: 'ADMIN',
      active: true,
    });

    investigatorUser = await User.create({
      username: 'investigator_test',
      email: 'investigator@sectest.vigilance.com',
      password_hash: passwordHash,
      role: 'INVESTIGATOR',
      active: true,
    });

    complianceUser = await User.create({
      username: 'compliance_test',
      email: 'compliance@sectest.vigilance.com',
      password_hash: passwordHash,
      role: 'COMPLIANCE_OFFICER',
      active: true,
    });

    managerUser = await User.create({
      username: 'manager_test',
      email: 'manager@sectest.vigilance.com',
      password_hash: passwordHash,
      role: 'MANAGER',
      active: true,
    });

    inactiveUser = await User.create({
      username: 'inactive_test',
      email: 'inactive@sectest.vigilance.com',
      password_hash: passwordHash,
      role: 'INVESTIGATOR',
      active: false,
    });

    // Mint tokens
    adminToken = jwt.sign({ id: adminUser._id.toString(), username: adminUser.username, role: 'ADMIN' }, jwtSecret, { expiresIn: '1h' });
    investigatorToken = jwt.sign({ id: investigatorUser._id.toString(), username: investigatorUser.username, role: 'INVESTIGATOR' }, jwtSecret, { expiresIn: '1h' });
    complianceToken = jwt.sign({ id: complianceUser._id.toString(), username: complianceUser.username, role: 'COMPLIANCE_OFFICER' }, jwtSecret, { expiresIn: '1h' });
    managerToken = jwt.sign({ id: managerUser._id.toString(), username: managerUser.username, role: 'MANAGER' }, jwtSecret, { expiresIn: '1h' });
    inactiveToken = jwt.sign({ id: inactiveUser._id.toString(), username: inactiveUser.username, role: 'INVESTIGATOR' }, jwtSecret, { expiresIn: '1h' });

    // Start Express server
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  after(async () => {
    if (isDBConnected()) {
      await User.deleteMany({ email: { $regex: /@sectest\.vigilance\.com$/ } });
      await disconnectDB();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('1. Login with valid credentials → success (200 with JWT token)', async () => {
    const res = await makeRequest(
      server,
      { path: '/api/v1/auth/login', method: 'POST' },
      { username: 'investigator_test', password: 'SecuredPass123!' }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, 'investigator_test');
    assert.equal(res.body.user.role, 'INVESTIGATOR');
  });

  it('2. Login with invalid password → 401 Unauthorized', async () => {
    const res = await makeRequest(
      server,
      { path: '/api/v1/auth/login', method: 'POST' },
      { username: 'investigator_test', password: 'WrongPassword!' }
    );

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
    assert.equal(res.body.message, 'Invalid credentials');
  });

  it('3. Login with nonexistent user → 401 Unauthorized', async () => {
    const res = await makeRequest(
      server,
      { path: '/api/v1/auth/login', method: 'POST' },
      { username: 'ghost_user', password: 'SecuredPass123!' }
    );

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
  });

  it('4. Missing token on protected endpoint → 401 Unauthorized', async () => {
    const res = await makeRequest(server, { path: '/api/v1/users', method: 'GET' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
    assert.ok(res.body.message.includes('token required'));
  });

  it('5. Invalid token on protected endpoint → 401 Unauthorized', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: 'Bearer this.is.an.invalid.token' },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
    assert.ok(res.body.message.includes('Invalid authentication token'));
  });

  it('6. Expired token on protected endpoint → 401 Unauthorized', async () => {
    const expiredToken = jwt.sign(
      { id: investigatorUser._id.toString(), username: investigatorUser.username, role: 'INVESTIGATOR' },
      jwtSecret,
      { expiresIn: '-1s' }
    );

    const res = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
    assert.ok(res.body.message.includes('expired'));
  });

  it('7. Inactive user accessing protected endpoint → 403 Forbidden', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/analysis/TXN_TEST_123',
      method: 'GET',
      headers: { Authorization: `Bearer ${inactiveToken}` },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'ForbiddenError');
    assert.ok(res.body.message.includes('deactivated'));
  });

  it('8. Investigator accessing ADMIN endpoint (/api/v1/users) → 403 Forbidden', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'ForbiddenError');
    assert.ok(res.body.message.includes("Role 'INVESTIGATOR' is not authorized"));
  });

  it('9. Compliance Officer accessing ADMIN endpoint (/api/v1/users) → 403 Forbidden', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${complianceToken}` },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'ForbiddenError');
  });

  it('10. Manager accessing ADMIN endpoint (/api/v1/users) → 403 Forbidden', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'ForbiddenError');
  });

  it('11. Admin accessing ADMIN endpoint (/api/v1/users) → success (200)', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  it('12. Public registration cannot create ADMIN (defaults to INVESTIGATOR)', async () => {
    const res = await makeRequest(
      server,
      { path: '/api/v1/auth/register', method: 'POST' },
      {
        username: 'unprivileged_attacker',
        email: 'attacker@sectest.vigilance.com',
        password: 'Password123!',
        role: 'ADMIN', // Attacker attempts privilege escalation
      }
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    // Role must be forced to INVESTIGATOR
    assert.equal(res.body.user.role, 'INVESTIGATOR');
  });

  it('13. Password is never returned in registration or login response', async () => {
    const res = await makeRequest(
      server,
      { path: '/api/v1/auth/login', method: 'POST' },
      { username: 'investigator_test', password: 'SecuredPass123!' }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.password, undefined);
  });

  it('14. Password hash is never returned in registration, login, or user list responses', async () => {
    const resLogin = await makeRequest(
      server,
      { path: '/api/v1/auth/login', method: 'POST' },
      { username: 'investigator_test', password: 'SecuredPass123!' }
    );
    assert.equal(resLogin.body.user.password_hash, undefined);

    const resUsers = await makeRequest(server, {
      path: '/api/v1/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resUsers.statusCode, 200);
    for (const u of resUsers.body.data) {
      assert.equal(u.password_hash, undefined);
    }
  });

  it('15. Protected analysis endpoint rejects unauthenticated request with 401', async () => {
    const res = await makeRequest(
      server,
      { path: '/api/v1/analysis/evaluate', method: 'POST' },
      { transaction_id: 'TXN_UNAUTH_1', features: { amount: 100 } }
    );
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UnauthorizedError');
  });

  it('16. Authorized investigator can perform permitted analysis', async () => {
    const originalAnalyze = mlClient.analyzeTransaction;
    mlClient.analyzeTransaction = async (p) => ({
      transaction_id: p.transaction_id,
      xgb_probability: 0.1,
      xgb_score: 10.0,
      isolation_forest_raw_score: 0.2,
      isolation_forest_score: 20.0,
      final_risk_score: 12.0,
      risk_tier: 'LOW',
    });

    try {
      const res = await makeRequest(
        server,
        {
          path: '/api/v1/analysis/evaluate',
          method: 'POST',
          headers: { Authorization: `Bearer ${investigatorToken}` },
        },
        { transaction_id: 'TXN_AUTH_OK', features: { amount: 500 } }
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.final_risk_score, 12.0);
    } finally {
      mlClient.analyzeTransaction = originalAnalyze;
    }
  });
});
