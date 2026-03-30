import React from 'react';

interface Props {
  questions: string[];
}

export function ValidationEvidence({ questions }: Props) {
  if (!questions || questions.length === 0) {
    return (
      <div className="text-xs text-text-muted italic">
        No matching questions found in transcript.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-text-primary uppercase tracking-widest">Matching Questions</h4>
      <ul className="space-y-2">
        {questions.map((question, index) => (
          <li
            key={index}
            className="text-xs italic text-text-muted bg-white/[0.04] border-l-2 border-primary/50 pl-3 py-1.5 rounded"
          >
            "{question}"
          </li>
        ))}
      </ul>
    </div>
  );
}
