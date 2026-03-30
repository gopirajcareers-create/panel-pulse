import React from 'react';
import { MessageSquare } from 'lucide-react';

interface Props {
  summary: string | null;
  gapAnalysis?: string | null;
  scoreCategory?: 'Poor' | 'Moderate' | 'Good' | null;
}

// Known section headers (without trailing colon — matching is done flexibly)
const SECTION_HEADERS = [
  'Panel Member Behavior',
  'Interview Process',
  'Rejection Reason Validation',
  'Rejection Validation',
  'Identified Gaps',
  'Identification Gap',
  'Identification Gaps',
  'Overall Effectiveness',
  'Based on',
];

/**
 * Strip **bold** and *italic* markdown from a string.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold** → plain
    .replace(/\*(.+?)\*/g, '$1')       // *italic* → plain
    .replace(/__(.+?)__/g, '$1')       // __bold__ → plain
    .trim();
}

/**
 * Parse a cleaned line and return { header, content } if it starts with a known header.
 * Handles both "Header: content" and "Header" on its own line.
 */
function parseHeader(line: string): { header: string; content: string } | null {
  for (const h of SECTION_HEADERS) {
    // Match "Header:" at start (case-insensitive)
    const regex = new RegExp(`^${h}:?\\s*`, 'i');
    if (regex.test(line)) {
      const content = line.replace(regex, '').trim();
      return { header: h + ':', content };
    }
  }
  return null;
}

export function PanelSummaryCard({ summary, gapAnalysis, scoreCategory }: Props) {
  if (!summary) return null;

  const accentColor =
    scoreCategory === 'Good'
      ? 'border-l-emerald-500'
      : scoreCategory === 'Moderate'
      ? 'border-l-orange-500'
      : 'border-l-red-500';

  // Parse the summary into sections
  const lines = summary
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[-•*]\s*/, '').trim()) // strip leading bullet chars
    .map(stripMarkdown);                           // strip **bold** stars

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-orange-400" />
        <h3 className="text-base font-semibold text-text-primary">Panel Summary</h3>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-text-muted bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
          AI Generated
        </span>
      </div>

      <div className={`border-l-4 ${accentColor} pl-4 space-y-2`}>
        {lines.map((line, i) => {
          const parsed = parseHeader(line);

          if (parsed) {
            return (
              <div key={i} className="mt-3 first:mt-0">
                <span className="text-sm font-bold text-orange-400">{parsed.header}</span>
                {parsed.content && (
                  <span className="text-sm text-text-primary leading-relaxed ml-1">{parsed.content}</span>
                )}
              </div>
            );
          }

          // Hide "Based on:" reference lines as requested by user
          if (/^based on:/i.test(line)) {
            return null;
          }

          return (
            <div key={i} className="flex items-start gap-2 text-sm text-text-primary leading-relaxed pl-1">
              <span className="mt-2 shrink-0 w-1 h-1 rounded-full bg-orange-500/60" />
              <span>{line}</span>
            </div>
          );
        })}
      </div>

      {gapAnalysis && (
        <div className="pt-4 border-t border-white/5 space-y-3">
          <div className="flex gap-3">
            <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Identified Gaps</h4>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-pulse" />
          </div>
          <div className="border-l-4 border-l-red-500/50 pl-4">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-text-primary marker:text-red-400/80">
              {gapAnalysis
                .split('\n')
                .map((line) => stripMarkdown(line.trim().replace(/^[-*•]\s*/, '')))
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

