import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article';
}

export function Card({ as: Component = 'div', className = '', children, ...rest }: CardProps) {
  return (
    <Component
      className={`bg-gradient-to-b from-bg-card/80 to-bg-surface/80 border border-white/[0.06] rounded-lg p-4 shadow-sm hover:shadow-lg transition-shadow ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default Card;
