export const DIMENSION_NAMES: Record<string, string> = {
  mandatorySkillCoverage: 'Mandatory Skill Coverage',
  technicalDepth: 'Technical Depth',
  rejectionValidationAlignment: 'Rejection Validation Alignment',
  scenarioRiskEvaluation: 'Scenario/Risk Evaluation',
  frameworkKnowledge: 'Framework Knowledge',
  handsOnValidation: 'Hands-on Validation',
  leadershipEvaluation: 'Leadership Evaluation',
  behavioralAssessment: 'Behavioral Assessment',
};

export const DIMENSION_MAX_SCORES: Record<string, number> = {
  mandatorySkillCoverage: 2.0,
  technicalDepth: 2.0,
  rejectionValidationAlignment: 2.0,
  scenarioRiskEvaluation: 1.0,
  frameworkKnowledge: 1.0,
  handsOnValidation: 1.0,
  leadershipEvaluation: 0.5,
  behavioralAssessment: 0.5,
};

export const SCORE_CATEGORIES = {
  POOR: { min: 0, max: 4.9, label: 'Poor', colour: 'score-poor' },
  MODERATE: { min: 5, max: 7.9, label: 'Moderate', colour: 'score-moderate' },
  GOOD: { min: 8, max: 10, label: 'Good', colour: 'score-good' },
};

export const PROBING_DEPTHS = {
  NO_PROBING: 'NO PROBING',
  SURFACE_PROBING: 'SURFACE PROBING',
  DEEP_PROBING: 'DEEP PROBING',
};
