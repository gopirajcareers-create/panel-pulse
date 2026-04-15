import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

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
  mandatorySkills?: string[];
}

export function DimensionCard({ name, score, maxScore, evidence = [], colour, mandatorySkills = [] }: Props) {
  const [showSkills, setShowSkills] = useState(false);
  
  const safeMax = maxScore > 0 ? maxScore : 1;
  const percent = Math.max(0, Math.min(100, (score / safeMax) * 100));
  const hasEvidence = evidence.length > 0;
  const hasMandatorySkills = mandatorySkills.length > 0;
  const barColor = colour ? (COLOUR_MAP[colour] ?? '#818cf8') : '#818cf8';

  return (
    <div className="bg-white/[0.02] p-4 rounded-lg border border-white/[0.04] flex flex-col gap-3 h-fit">
      {/* Header: name + score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-medium text-text-primary leading-snug truncate">{name}</p>
          {hasMandatorySkills && (
            <button 
              onClick={() => setShowSkills(!showSkills)}
              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
              title="View Mandatory Skills"
            >
              <Info className={`w-3.5 h-3.5 ${showSkills ? 'text-primary' : 'text-text-muted'}`} />
            </button>
          )}
        </div>
        <p className="text-xs font-semibold whitespace-nowrap" style={{ color: barColor }}>
          {score.toFixed(2)}
          <span className="text-text-muted font-normal"> / {safeMax.toFixed(1)}</span>
        </p>
      </div>

      {/* Mandatory Skills Dropdown (if toggled) */}
      {showSkills && hasMandatorySkills && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-md p-2.5 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Mandatory Skills Used:</p>
            <div className="flex flex-wrap gap-1.5">
              {mandatorySkills.map((skill, i) => (
                <span 
                  key={i} 
                  className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-medium text-primary shadow-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

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
            <p className="font-medium text-text-primary mb-1.5 flex items-center justify-between">
              Panel Evidence
              {!hasMandatorySkills && <span className="text-[10px] text-text-muted font-normal">Based on JD criteria</span>}
            </p>
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
