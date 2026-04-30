import React from 'react';

interface ProgressProps {
  value: number; // 0-100
  color?: 'good' | 'moderate' | 'poor' | string;
  ariaLabel?: string;
}

export function Progress({ value, color = 'good', ariaLabel = 'Progress' }: ProgressProps) {
  const stroke =
    color === 'good' ? 'bg-gradient-to-r from-score-structure to-score-good' : color === 'moderate'
      ? 'bg-gradient-to-r from-score-framework to-score-moderate'
      : color === 'poor'
      ? 'bg-gradient-to-r from-score-handson to-score-poor'
      : `bg-[${color}]`;

  return (
    <div role="progressbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="w-full h-3 bg-white/[0.03] rounded-full overflow-hidden">
        <div className={`${stroke} h-full rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export default Progress;
