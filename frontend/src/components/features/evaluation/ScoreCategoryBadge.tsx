import React from 'react';

interface Props {
  category: 'Poor' | 'Moderate' | 'Good' | null;
}

export function ScoreCategoryBadge({ category }: Props) {
  if (!category) return null;

  const color = category === 'Good' ? 'text-score-good bg-score-good/10' : category === 'Moderate' ? 'text-score-warning bg-score-warning/10' : 'text-score-poor bg-score-poor/10';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      {category}
    </span>
  );
}
