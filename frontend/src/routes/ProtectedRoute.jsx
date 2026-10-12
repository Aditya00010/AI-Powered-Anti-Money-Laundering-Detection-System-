/**
 * Project Vigilance — Protected Route Guard
 * =========================================
 * Provides client-side UX protection by checking authentication status.
 * Unauthenticated users are redirected to the /login page.
 *
 * IMPORTANT SECURITY NOTICE:
 * Client-side route guards are UX protection, NOT actual security boundaries.
 * True security is enforced by Express backend middleware.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

export function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner message="Verifying session authorization..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
