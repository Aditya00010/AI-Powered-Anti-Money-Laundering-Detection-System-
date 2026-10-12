import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

export function NotFound() {
  return (
    <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
      <Card title="404 — Page Not Found">
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          The requested route does not exist or has been moved.
        </p>
        <Link to="/">
          <Button variant="primary">Return to Operations Dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}

export default NotFound;
