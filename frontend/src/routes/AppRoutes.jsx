import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Dashboard from '../pages/Dashboard';
import AnalyzeTransaction from '../pages/AnalyzeTransaction';
import AnalysisResult from '../pages/AnalysisResult';
import Investigations from '../pages/Investigations';
import InvestigationDetail from '../pages/InvestigationDetail';
import ConfigurationPlaceholder from '../pages/ConfigurationPlaceholder';
import UserManagement from '../pages/UserManagement';
import Login from '../pages/Login';
import NotFound from '../pages/NotFound';
import ProtectedRoute from './ProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Authentication Route */}
      <Route path="/login" element={<Login />} />

      {/* Protected Surveillance Application Shell */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="analyze" element={<AnalyzeTransaction />} />
        <Route path="analysis/:transactionId" element={<AnalysisResult />} />
        <Route path="analysis" element={<AnalysisResult />} />
        <Route path="investigations" element={<Investigations />} />
        <Route path="investigations/:caseId" element={<InvestigationDetail />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="configuration" element={<ConfigurationPlaceholder />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
