import React from 'react';

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-bg-card border border-white/[0.06] rounded-lg p-8 text-center">
      <div className="mb-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.03] mb-3">
          <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M3 12h18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 3v18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
