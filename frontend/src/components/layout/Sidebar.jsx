import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function Sidebar() {
  const { user } = useAuth();
  const role = user?.role || 'INVESTIGATOR';

  const isAdmin = role === 'ADMIN';
  const isInvestigator = role === 'INVESTIGATOR';
  const isCompliance = role === 'COMPLIANCE_OFFICER';
  const isManager = role === 'MANAGER';

  return (
    <aside className="sidebar">
      <div>
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.75rem',
            paddingLeft: '0.5rem',
          }}
        >
          Operations
        </div>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>📊</span>
            <span>Dashboard</span>
          </NavLink>

          {(isAdmin || isInvestigator || isCompliance) && (
            <NavLink to="/analyze" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span>⚡</span>
              <span>Analyze Transaction</span>
            </NavLink>
          )}
        </nav>
      </div>

      <div>
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.75rem',
            paddingLeft: '0.5rem',
          }}
        >
          {isManager ? 'Team Oversight' : 'Investigation Queue'}
        </div>
        <nav className="nav-links">
          <NavLink to="/investigations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>📁</span>
            <span>
              {isManager
                ? 'Team Investigations'
                : isCompliance
                ? 'Compliance Review'
                : 'Investigations'}
            </span>
          </NavLink>

          <NavLink
            to="/investigations?status=OPEN&risk_tier=CRITICAL"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Active High & Critical Surveillance Alerts Queue"
          >
            <span>🚨</span>
            <span>{isManager ? 'Team Alerts' : 'Alerts Triage'}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.65rem',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                border: '1px solid #ef4444',
                padding: '1px 6px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              ACTIVE
            </span>
          </NavLink>
        </nav>
      </div>

      {(isAdmin || role) && (
        <div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.75rem',
              paddingLeft: '0.5rem',
            }}
          >
            System
          </div>
          <nav className="nav-links">
            {isAdmin && (
              <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span>👥</span>
                <span>User Management</span>
              </NavLink>
            )}

            <NavLink to="/configuration" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span>⚙️</span>
              <span>Configuration</span>
            </NavLink>
          </nav>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
