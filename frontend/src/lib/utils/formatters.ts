export function formatScore(score: number, maxScore: number = 10): string {
  return score.toFixed(1);
}

export function getScoreCategory(score: number): 'Poor' | 'Moderate' | 'Good' {
  if (score >= 8) return 'Good';
  if (score >= 5) return 'Moderate';
  return 'Poor';
}

export function getScoreCategoryColour(category: 'Poor' | 'Moderate' | 'Good'): string {
  const colourMap = {
    Poor: 'text-score-poor',
    Moderate: 'text-score-moderate',
    Good: 'text-score-good',
  };
  return colourMap[category];
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function truncateText(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function getDimensionColourClass(dimensionKey: string): string {
  const colourMap: Record<string, string> = {
    mandatorySkillCoverage: 'score-mandatory',
    technicalDepth: 'score-technical',
    scenarioRiskEvaluation: 'score-scenario',
    frameworkKnowledge: 'score-framework',
    handsOnValidation: 'score-handson',
    leadershipEvaluation: 'score-leadership',
    behavioralAssessment: 'score-behavioral',
    rejectionValidationAlignment: 'score-structure',
  };
  return colourMap[dimensionKey] || 'score-primary';
}
