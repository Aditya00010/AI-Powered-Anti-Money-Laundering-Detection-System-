/**
 * Project Vigilance — Role-Based Access Guard
 * ===========================================
 * Protects specific views based on authenticated user roles.
 *
 * IMPORTANT SECURITY NOTICE:
 * Client-side route guards are UX protection, NOT actual security boundaries.
 * True security is enforced by Express backend middleware at the API layer.
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';

export function RoleGuard({ requiredRole, allowedRoles, fallback = null, children }) {
  const { hasRole, user } = useAuth();

  const isAuthorized = (() => {
    if (requiredRole) {
      return hasRole(requiredRole);
    }
    if (allowedRoles && Array.isArray(allowedRoles)) {
      return allowedRoles.includes(user?.role);
    }
    return true;
  })();

  if (!isAuthorized) {
    const roleLabel = requiredRole || (allowedRoles ? allowedRoles.join(', ') : 'Privileged');
    return (
      fallback || (
        <Card title="Access Restricted">
          <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            This section requires the <strong>{roleLabel}</strong> role. Your active profile (
            <span className="font-mono">{user?.role || 'UNAUTHENTICATED'}</span>) does not have the necessary
            permissions.
          </div>
          <div className="alert alert-warning">
            Backend authorization is strictly enforced at the Express API layer. Unauthorized requests are
            rejected with HTTP 403 Forbidden.
          </div>
        </Card>
      )
    );
  }

  return children;
}

export default RoleGuard;
