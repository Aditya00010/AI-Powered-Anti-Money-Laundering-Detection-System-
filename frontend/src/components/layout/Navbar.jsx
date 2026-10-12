import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';

export function Navbar() {
  const { user, logout } = useAuth();

  const initials = (user?.username || 'CU')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="navbar">
      <div className="nav-brand">
        <span style={{ fontSize: '1.4rem' }}>🛡️</span>
        <span>PROJECT VIGILANCE</span>
        <span className="nav-badge">AML DEFENSE</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user?.username || user?.name || 'Surveillance Operator'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Role: {user?.role || 'INVESTIGATOR'}</div>
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.85rem',
            color: '#fff',
          }}
        >
          {initials}
        </div>
        <Button
          variant="secondary"
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
          onClick={logout}
        >
          Sign Out
        </Button>
      </div>
    </header>
  );
}

export default Navbar;
