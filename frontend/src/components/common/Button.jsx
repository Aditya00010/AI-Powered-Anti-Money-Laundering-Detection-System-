import React from 'react';

export function Button({
  children,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  type = 'button',
  className = '',
  onClick,
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`.trim()}
      disabled={disabled || isLoading}
      onClick={onClick}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="spinner-border" style={{ width: 14, height: 14, display: 'inline-block', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
