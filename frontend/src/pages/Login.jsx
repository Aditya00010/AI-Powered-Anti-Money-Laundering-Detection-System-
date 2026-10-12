/**
 * Project Vigilance — Login Page
 * ===============================
 * Authenticates compliance and surveillance personnel via backend JWT endpoints.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import ErrorAlert from '../components/common/ErrorAlert';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);

    if (!username.trim() || !password) {
      setError(new Error('Please enter both username/email and password.'));
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '4rem auto', padding: '0 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🛡️</div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
          PROJECT VIGILANCE
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          AI-Powered AML Surveillance & Financial Intelligence Platform
        </p>
      </div>

      {location.search.includes('expired=true') && !error && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          borderRadius: 'var(--radius-md, 6px)',
          background: 'rgba(234, 179, 8, 0.15)',
          border: '1px solid rgba(234, 179, 8, 0.4)',
          color: '#eab308',
          fontSize: '0.875rem'
        }}>
          ⚠️ Your operational session has expired. Please log in again to resume.
        </div>
      )}
      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      <Card title="Personnel Authentication">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username or Email
            </label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="e.g. admin or investigator"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="current-password"
              required
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Log In to Surveillance Operations
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default Login;
