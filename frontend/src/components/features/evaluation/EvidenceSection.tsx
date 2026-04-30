import React from 'react';
import { sanitizeText } from '@/lib/utils/sanitize';

interface Props {
  evidence: Record<string, string[]> | null | undefined;
}

export function EvidenceSection({ evidence }: Props) {
  const safeEvidence = evidence ?? null;
  if (!safeEvidence || Object.keys(safeEvidence).length === 0) {
    return (
      <div className="bg-bg-card rounded-lg border border-white/[0.06] p-4 text-sm text-text-muted">
        No evidence available.
      </div>
    );
  }

  const entries = Object.entries(safeEvidence);

  return (
    <div className="bg-bg-card rounded-lg border border-white/[0.06] p-4 space-y-4" aria-label="Evidence">
      <h4 className="text-sm font-semibold text-text-primary">Evidence</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map(([dim, items]) => (
          <div key={dim} className="text-xs text-text-muted">
            <p className="font-medium text-text-primary mb-1">{dim}</p>
            <ul className="list-disc ml-4 space-y-1">
              {items.slice(0, 4).map((it, i) => (
                <li key={i} className="truncate italic text-text-primary">
                  {sanitizeText(String(it))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
