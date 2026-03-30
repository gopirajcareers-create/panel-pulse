import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-4';
  const variants: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-primary to-accent text-white hover:shadow-xl hover:shadow-primary/30 focus-visible:ring-primary/40',
    ghost: 'bg-white/[0.03] text-text-primary hover:bg-white/[0.06] focus-visible:ring-primary/30',
  };

  const disabledClass = 'opacity-50 cursor-not-allowed grayscale';

  return (
    <button
      className={`${base} ${variants[variant]} ${className} ${rest.disabled ? disabledClass : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
