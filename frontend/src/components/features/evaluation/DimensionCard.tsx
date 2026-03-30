import React from 'react';

// Hex values matching the Tailwind design tokens in tailwind.config.js
const COLOUR_MAP: Record<string, string> = {
  'score-mandatory': '#818cf8',
  'score-technical': '#f472b6',
  'score-scenario': '#34d399',
  'score-framework': '#fbbf24',
  'score-handson': '#f87171',
  'score-leadership': '#60a5fa',
  'score-behavioral': '#a78bfa',
  'score-structure': '#94e2d5',
};

interface Props {
  name: string;
  score: number;
  maxScore: number;
  evidence?: string[];
  colour?: string;
}

export function DimensionCard({ name, score, maxScore, evidence = [], colour }: Props) {
  const safeMax = maxScore > 0 ? maxScore : 1;
  const percent = Math.max(0, Math.min(100, (score / safeMax) * 100));
  const hasEvidence = evidence.length > 0;
  const barColor = colour ? (COLOUR_MAP[colour] ?? '#818cf8') : '#818cf8';

  return (
    <div className="bg-white/[0.02] p-4 rounded-lg border border-white/[0.04] flex flex-col gap-3">
      {/* Header: name + score */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary leading-snug">{name}</p>
        <p className="text-xs font-semibold whitespace-nowrap" style={{ color: barColor }}>
          {score.toFixed(2)}
          <span className="text-text-muted font-normal"> / {safeMax.toFixed(1)}</span>
        </p>
      </div>

      {/* Full-width progress bar */}
      <div className="h-1.5 w-full bg-white/[0.07] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
        />
      </div>

      {/* Evidence */}
      <div className="text-xs">
        {hasEvidence ? (
          <>
            <p className="font-medium text-text-primary mb-1.5">Panel Evidence</p>
            <ul className="space-y-1.5">
              {evidence.slice(0, 3).map((e, i) => (
                <li
                  key={i}
                  className="italic text-text-muted line-clamp-2 border-l-2 pl-2"
                  style={{ borderColor: barColor + '70' }}
                >
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
