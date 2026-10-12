import React from 'react';

export function Badge({ children, variant = 'default', className = '', ...props }) {
  const variantClass = variant !== 'default' ? `badge-${variant}` : '';
  return (
    <span className={`badge ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export default Badge;
