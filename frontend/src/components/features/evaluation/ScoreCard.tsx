import React, { useEffect, useState } from 'react';
import { Info, ShieldCheck, ShieldAlert, AlertTriangle, ChevronDown } from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import { dashboardApi } from '@/lib/api/dashboard.api';

const MAX_SCORE = 10.0;

interface ModerationQuickRef {
  overall_compliance: 'pass' | 'warning' | 'fail';
}

interface Props {
  score: number;
  category: 'Poor' | 'Moderate' | 'Good' | null;
  panelName?: string;
  subtitle?: string;
  moderation?: ModerationQuickRef | null;
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

function ModerationBadge({ compliance }: { compliance: 'pass' | 'warning' | 'fail' }) {
  const config = {
    pass: {
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      label: 'PASS',
      styles: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    },
    warning: {
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      label: 'WARNING',
      styles: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
    },
    fail: {
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
      label: 'FAIL',
      styles: 'bg-red-500/15 border-red-500/30 text-red-300',
    },
  };
  const { icon, label, styles } = config[compliance] || config.pass;

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${styles}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

export function ScoreCard({ score, category, panelName, subtitle, moderation }: Props) {
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

      {/* Interview Moderation Quick Reference */}
      {moderation && (
        <div className="pt-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-text-muted">Interview Moderation</p>
            <div className="flex items-center gap-2 group/mod relative">
              <Info className="w-3.5 h-3.5 text-text-muted cursor-help transition-colors group-hover/mod:text-indigo-400" />
              <ModerationBadge compliance={moderation.overall_compliance} />

              {/* Hover tooltip — shows below, aligned to the right */}
              <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-[#111118] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover/mod:opacity-100 group-hover/mod:visible transition-all duration-200 z-50 pointer-events-none group-hover/mod:pointer-events-auto">

                <p className="text-[11px] text-text-secondary leading-relaxed mb-3">
                  Interview Moderation checks your interview questions for potentially discriminatory or inappropriate content.
                </p>
                <ul className="space-y-1 text-[11px] text-text-secondary mb-3">
                  <li className="flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>Age, marital status, religion, or family status</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>Gender or sexual orientation</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>Race or ethnicity</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>Disability or health conditions</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>Language or regional origin</span>
                  </li>
                </ul>

                <p className="text-[11px] font-semibold text-text-primary mb-1.5">Status Meanings:</p>
                <ul className="space-y-1 text-[11px] mb-3">
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <span className="text-emerald-300 font-semibold">PASS: </span>
                    <span className="text-text-secondary"> No discriminatory questions detected</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                    <span className="text-orange-300 font-semibold">WARNING: </span>
                    <span className="text-text-secondary"> Minor concerns, review recommended</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3 h-3 text-red-400 flex-shrink-0" />
                    <span className="text-red-300 font-semibold">FAIL: </span>
                    <span className="text-text-secondary"> Potentially discriminatory questions detected</span>
                  </li>
                </ul>



                <div className="flex items-center gap-1.5 text-[11px] text-indigo-400 font-medium pt-2 border-t border-white/[0.06]">
                  <ChevronDown className="w-3 h-3 animate-bounce" />
                  <span>Scroll down for detailed category breakdown</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
    </div>
  );
}
