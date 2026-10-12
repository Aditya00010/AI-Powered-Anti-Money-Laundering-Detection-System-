/**
 * Project Vigilance - MLClient Service Unit Tests
 * ===============================================
 * Validates MLClient error mapping, timeout handling, and contract validation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MLClient } = require('../src/services/mlClient');
const {
  MLServiceUnavailableError,
  MLServiceTimeoutError,
  MLServiceValidationError,
  MLServiceBadResponseError,
} = require('../src/utils/errors');

describe('MLClient Unit Tests', () => {
  it('validates response contract successfully when all 6 required fields are valid', () => {
    const client = new MLClient();
    const validResponse = {
      transaction_id: 'TXN_TEST_100',
      xgb_probability: 0.95,
      xgb_score: 95.0,
      isolation_forest_raw_score: 0.58,
      isolation_forest_score: 70.0,
      final_risk_score: 90.0,
      risk_tier: 'CRITICAL',
    };

    assert.doesNotThrow(() => {
      client._validateResponseContract(validResponse);
    });
  });

  it('rejects response when required field is missing', () => {
    const client = new MLClient();
    const missingField = {
      transaction_id: 'TXN_TEST_101',
      xgb_probability: 0.95,
      // missing xgb_score
      isolation_forest_raw_score: 0.58,
      isolation_forest_score: 70.0,
      final_risk_score: 90.0,
      risk_tier: 'CRITICAL',
    };

    assert.throws(
      () => client._validateResponseContract(missingField),
      MLServiceBadResponseError
    );
  });

  it('rejects response when risk_tier is invalid', () => {
    const client = new MLClient();
    const invalidTier = {
      transaction_id: 'TXN_TEST_102',
      xgb_probability: 0.95,
      xgb_score: 95.0,
      isolation_forest_raw_score: 0.58,
      isolation_forest_score: 70.0,
      final_risk_score: 90.0,
      risk_tier: 'UNKNOWN_TIER',
    };

    assert.throws(
      () => client._validateResponseContract(invalidTier),
      MLServiceBadResponseError
    );
  });

  it('rejects response when final_risk_score is out of bounds', () => {
    const client = new MLClient();
    const outOfBounds = {
      transaction_id: 'TXN_TEST_103',
      xgb_probability: 0.95,
      xgb_score: 95.0,
      isolation_forest_raw_score: 0.58,
      isolation_forest_score: 70.0,
      final_risk_score: 105.0,
      risk_tier: 'CRITICAL',
    };

    assert.throws(
      () => client._validateResponseContract(outOfBounds),
      MLServiceBadResponseError
    );
  });

  it('correctly maps ECONNABORTED to MLServiceTimeoutError (504)', () => {
    const client = new MLClient();
    const timeoutErr = new Error('timeout of 5000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';

    assert.throws(
      () => client._handleAxiosError(timeoutErr, 'Test context'),
      (err) => {
        assert(err instanceof MLServiceTimeoutError);
        assert.equal(err.statusCode, 504);
        return true;
      }
    );
  });

  it('correctly maps ECONNREFUSED to MLServiceUnavailableError (503)', () => {
    const client = new MLClient();
    const connErr = new Error('connect ECONNREFUSED 127.0.0.1:8000');
    connErr.code = 'ECONNREFUSED';

    assert.throws(
      () => client._handleAxiosError(connErr, 'Test context'),
      (err) => {
        assert(err instanceof MLServiceUnavailableError);
        assert.equal(err.statusCode, 503);
        return true;
      }
    );
  });

  it('correctly maps 400 Bad Request to MLServiceValidationError (400)', () => {
    const client = new MLClient();
    const badReqErr = new Error('Request failed with status code 400');
    badReqErr.response = {
      status: 400,
      data: { detail: 'Missing required feature: amount' },
    };

    assert.throws(
      () => client._handleAxiosError(badReqErr, 'Test context'),
      (err) => {
        assert(err instanceof MLServiceValidationError);
        assert.equal(err.statusCode, 400);
        assert(err.message.includes('Missing required feature: amount'));
        return true;
      }
    );
  });
});
