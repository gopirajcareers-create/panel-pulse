import React from 'react';

interface Props {
  name: string;
  score: number;
  maxScore: number;
  evidence?: string[];
}

export function DimensionCard({ name, score, maxScore, evidence = [] }: Props) {
  const safeMax = maxScore > 0 ? maxScore : 1;
  const percent = Math.max(0, Math.min(100, (score / safeMax) * 100));
  const hasEvidence = evidence.length > 0;

  return (
    <div className="bg-white/[0.02] p-3 rounded-lg border border-white/[0.04]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary truncate">{name}</p>
          <p className="text-xs text-text-muted">{score.toFixed(2)} / {safeMax.toFixed(1)}</p>
        </div>
        <div className="w-20">
          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs">
        {hasEvidence ? (
          <>
            <p className="font-medium text-text-primary mb-1">Panel Evidence</p>
            <ul className="space-y-1">
              {evidence.slice(0, 3).map((e, i) => (
                <li key={i} className="italic text-text-muted line-clamp-2 border-l-2 border-primary/40 pl-2">
                  {e}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-white/[0.04] text-text-muted border border-white/[0.06]">
            No Evidence
          </span>
        )}
      </div>
    </div>
  );
}
