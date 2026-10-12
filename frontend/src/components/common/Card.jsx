import React from 'react';

export function Card({ title, subtitle, action, children, className = '', ...props }) {
  return (
    <div className={`card ${className}`.trim()} {...props}>
      {(title || subtitle || action) && (
        <div className="card-header">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export default Card;
