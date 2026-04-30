import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full px-4 py-2 rounded-lg bg-gradient-to-br from-bg-card to-bg-surface border border-white/[0.06] text-text-primary placeholder-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-50 transition-colors ${className}`}
      {...rest}
    />
  );
}

export default Input;
