import React from 'react';
import { MessageSquare } from 'lucide-react';

interface Props {
  summary: string | null;
  gapAnalysis?: string | null;
  scoreCategory?: 'Poor' | 'Moderate' | 'Good' | null;
}

export function PanelSummaryCard({ summary, gapAnalysis, scoreCategory }: Props) {
  if (!summary) return null;

  const accentColor =
    scoreCategory === 'Good'
      ? 'border-l-emerald-500'
      : scoreCategory === 'Moderate'
      ? 'border-l-orange-500'
      : 'border-l-red-500';

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-orange-400" />
        <h3 className="text-base font-semibold text-text-primary">Panel Summary</h3>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-text-muted bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
          AI Generated
        </span>
      </div>

      <div className={`border-l-4 ${accentColor} pl-4 space-y-3`}>
        {summary.split('\n').filter(Boolean).map((line, i) => {
          const trimmed = line.trim();
          const cleanLine = trimmed.replace(/^[-*]\s*/, '');
          const isHeader = [
            'Panel Member Behavior:',
            'Interview Process:',
            'Rejection Reason Validation:',
            'Identification Gap:',
            'Overall Effectiveness:'
          ].some(h => cleanLine.startsWith(h));

          if (isHeader) {
            return (
              <p key={i} className="text-sm font-bold text-orange-400 mt-2 first:mt-0">
                {cleanLine}
              </p>
            );
          }

          return (
            <div key={i} className="flex items-start gap-2 text-sm text-text-primary leading-relaxed pl-1">
              <span className="mt-2 shrink-0 w-1 h-1 rounded-full bg-orange-500/60" />
              <span>{cleanLine}</span>
            </div>
          );
        })}
      </div>

      {gapAnalysis && (
        <div className="pt-4 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Identification Gaps</h4>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-pulse" />
          </div>
          <div className="border-l-4 border-l-red-500/50 pl-4">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-text-primary marker:text-red-400/80">
              {gapAnalysis
                .split('\n')
                .map((line) => line.trim().replace(/^[-*]\s*/, ''))
                .filter(Boolean)
                .map((item, i) => (
                  <li key={i} className="leading-relaxed italic text-text-secondary">
                    {item}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
