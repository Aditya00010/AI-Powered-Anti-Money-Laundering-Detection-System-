/**
 * Project Vigilance — Authentication Context (Real RBAC & JWT State)
 * =================================================================
 * Manages user identity, session JWT token, and authenticated roles.
 *
 * Security:
 * - Persists JWT in localStorage under key 'vigilance_token'.
 * - Verifies token validity with backend GET /api/v1/auth/me on app load.
 * - Cleans up state immediately upon logout or token expiration.
 * - Client-side state is strictly for UX presentation; backend Express middleware
 *   is authoritative for all API security.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { login as apiLogin, getCurrentUser as apiGetCurrentUser } from '../api/authApi';

const TOKEN_KEY = 'vigilance_token';
const AuthContext = createContext(null);

export function AuthProvider({ initialUser = null, children }) {
  const [token, setToken] = useState(() => {
    if (initialUser) return 'mock_token_for_tests';
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch (_) {
      return null;
    }
  });

  const [user, setUser] = useState(initialUser);
  const [isLoading, setIsLoading] = useState(!initialUser && Boolean(token));

  // Logout handler
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
    setToken(null);
    setUser(null);
  }, []);

  // Restore authenticated session on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const res = await apiGetCurrentUser();
        if (isMounted && res && res.user) {
          setUser(res.user);
          setToken(storedToken);
        } else {
          logout();
        }
      } catch (err) {
        console.warn('[AuthContext] Session restore failed. Clearing stale token.', err.message);
        logout();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [logout]);

  // Login handler
  const login = useCallback(async (username, password) => {
    setIsLoading(true);
    try {
      const res = await apiLogin({ username, password });
      if (res && res.token && res.user) {
        try {
          localStorage.setItem(TOKEN_KEY, res.token);
        } catch (_) {}
        setToken(res.token);
        setUser(res.user);
        return res;
      } else {
        throw new Error('Authentication response missing required token or user payload');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      role: user?.role || null,
      isAuthenticated: Boolean(token && user),
      isLoading,
      login,
      logout,
      hasRole: (requiredRole) => user?.role === requiredRole,
      hasAnyRole: (roles = []) => Boolean(user && roles.includes(user.role)),
    }),
    [user, token, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
