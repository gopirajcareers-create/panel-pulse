import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import { dashboardApi } from '@/lib/api/dashboard.api';

const MAX_SCORE = 10.0;

interface Props {
  score: number;
  category: 'Poor' | 'Moderate' | 'Good' | null;
  panelName?: string;
  subtitle?: string;
}

function CategoryBadge({ category }: { category: 'Poor' | 'Moderate' | 'Good' | null }) {
  if (!category) return null;
  const styles =
    category === 'Good'
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
      : category === 'Moderate'
      ? 'bg-orange-500/15 border-orange-500/30 text-orange-300'
      : 'bg-red-500/15 border-red-500/30 text-red-300';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${styles}`}>
      {category}
    </span>
  );
}

export function ScoreCard({ score, category, panelName, subtitle }: Props) {
  const percent = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
      {/* Title + badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 group relative">
          <h3 className="text-base font-semibold text-text-primary">Panel Efficiency</h3>
          <Info className="w-4 h-4 text-text-muted cursor-help" />
          <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-[#111118] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <p className="text-xs font-semibold text-text-primary mb-2">Score Categories:</p>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              <li><strong className="text-emerald-400">Good (8.0 - 10.0):</strong> Excellent thorough validation.</li>
              <li><strong className="text-orange-400">Moderate (5.0 - 7.9):</strong> Acceptable but with notable gaps.</li>
              <li><strong className="text-red-400">Poor (0.0 - 4.9):</strong> Insufficient or superficial probing.</li>
            </ul>
          </div>
        </div>
        <CategoryBadge category={category} />
      </div>

      {/* Ring + scores */}
      <div className="flex items-center gap-5">
        <div className="flex-none">
          <ProgressRing size={80} stroke={9} progress={percent} />
        </div>

        <div className="flex-1 space-y-3">
          {/* Panel Score */}
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-text-muted mb-0.5">Panel Score</p>
            <p className="text-2xl font-bold text-text-primary leading-none">
              {score.toFixed(1)}
              <span className="text-sm font-normal text-text-muted"> / {MAX_SCORE.toFixed(1)}</span>
            </p>
          </div>
        </div>
      </div>

      {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
    </div>
  );
}
