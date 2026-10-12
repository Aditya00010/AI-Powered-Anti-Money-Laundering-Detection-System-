/**
 * Project Vigilance — User Management Page (Admin Only)
 * =====================================================
 * Interface for administrative surveillance operators to inspect accounts,
 * toggle active status, and modify assigned roles.
 */

import React, { useState, useEffect } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import RoleGuard from '../routes/RoleGuard';
import { listUsers, updateUserStatus, updateUserRole } from '../api/authApi';
import { useAuth } from '../context/AuthContext';

const AVAILABLE_ROLES = ['ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER', 'MANAGER'];

export function UserManagementContent() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listUsers();
      setUsers(res.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user) => {
    try {
      const newStatus = !user.active;
      await updateUserStatus(user._id, newStatus);
      setActionSuccess(`User '${user.username}' ${newStatus ? 'activated' : 'deactivated'} successfully.`);
      fetchUsers();
    } catch (err) {
      setError(err);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      setActionSuccess(`User role updated to ${newRole} successfully.`);
      fetchUsers();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            System User Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Inspect system accounts, provision roles, and enforce security policies across personnel profiles.
          </p>
        </div>
        <Button variant="secondary" onClick={fetchUsers} disabled={isLoading}>
          🔄 Refresh Directory
        </Button>
      </div>

      {actionSuccess && (
        <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      <Card title={`Registered System Personnel (${users.length})`}>
        {isLoading ? (
          <LoadingSpinner message="Loading user directory..." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Current Role</th>
                  <th>Account Status</th>
                  <th>Role Assignment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u._id === currentUser?.id || u.username === currentUser?.username;
                  return (
                    <tr key={u._id}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>
                        {u.username} {isSelf && <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)' }}>(You)</span>}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                      <td>
                        <Badge
                          variant={
                            u.role === 'ADMIN'
                              ? 'critical'
                              : u.role === 'COMPLIANCE_OFFICER'
                              ? 'high'
                              : u.role === 'MANAGER'
                              ? 'medium'
                              : 'low'
                          }
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={u.active ? 'low' : 'critical'}>
                          {u.active ? 'ACTIVE' : 'DEACTIVATED'}
                        </Badge>
                      </td>
                      <td>
                        <select
                          className="form-input"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.825rem' }}
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                        >
                          {AVAILABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <Button
                          variant={u.active ? 'secondary' : 'primary'}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                          disabled={isSelf}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function UserManagement() {
  return (
    <RoleGuard requiredRole="ADMIN">
      <UserManagementContent />
    </RoleGuard>
  );
}

export default UserManagement;
