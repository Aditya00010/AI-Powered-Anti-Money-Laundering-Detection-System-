import React from 'react';

export function ErrorAlert({ error, onDismiss }) {
  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : error?.message || 'An unexpected error occurred.';
  const statusCode = error?.statusCode || null;

  return (
    <div className="alert alert-error" role="alert">
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
          {statusCode ? `Error (${statusCode})` : 'Operation Failed'}
        </div>
        <div>{errorMessage}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          aria-label="Dismiss alert"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default ErrorAlert;
