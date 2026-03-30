import React from 'react';
import { DimensionCard } from './DimensionCard';
import { DIMENSIONS } from '@/types/evaluation.types';
import type { DimensionScores } from '@/types/evaluation.types';
import { sanitizeText } from '@/lib/utils/sanitize';

// Map backend category names (with spaces) to frontend camelCase keys
const BACKEND_LABEL_TO_KEY: Record<string, string> = {
  'Mandatory Skill Coverage':   'mandatorySkillCoverage',
  'Technical Depth':            'technicalDepth',
  'Scenario / Risk Evaluation': 'scenarioRiskEvaluation',
  'Framework Knowledge':        'frameworkKnowledge',
  'Hands-on Validation':        'handsOnValidation',
  'Leadership Evaluation':      'leadershipEvaluation',
  'Behavioral Assessment':      'behavioralAssessment',
  'Rejection Validation Alignment': 'rejectionValidationAlignment',
};

interface Props {
  dimensions: DimensionScores | null;
  evidence?: Record<string, string[]> | any[] | null;
}

export function DimensionGrid({ dimensions, evidence }: Props) {
  const keys = Object.keys(DIMENSIONS) as Array<keyof DimensionScores>;

  // Normalize evidence to a keyed object
  const normalizedEvidence: Record<string, string[]> = {};
  if (Array.isArray(evidence)) {
    // Legacy flat array — no dimension mapping possible, skip
  } else if (evidence && typeof evidence === 'object') {
    for (const [rawKey, items] of Object.entries(evidence)) {
      // rawKey may be backend label ("Mandatory Skill Coverage") or camelCase
      const camelKey = BACKEND_LABEL_TO_KEY[rawKey] ?? rawKey;
      if (Array.isArray(items)) {
        normalizedEvidence[camelKey] = items.map((x: any) => sanitizeText(String(x)));
      }
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {keys.map((key) => {
        const def = DIMENSIONS[key];
        const score = dimensions ? (dimensions as any)[key] ?? 0 : 0;
        const ev = normalizedEvidence[key] ?? [];

        return (
          <DimensionCard
            key={key}
            name={def.name}
            score={score}
            maxScore={def.maxScore}
            evidence={ev}
            colour={def.colour}
          />
        );
      })}
    </div>
  );
}

export default DimensionGrid;

