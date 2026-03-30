export interface PanelEfficiencyScore {
  jobId: string;
  panelEfficiencyScore: number;
  scoreCategory: 'Poor' | 'Moderate' | 'Good';
  dimensions: DimensionScores;
  evidence: Record<string, string[]>;
  timestamp: string;
}

export interface DimensionScores {
  mandatorySkillCoverage: number;
  technicalDepth: number;
  rejectionValidationAlignment: number;
  scenarioRiskEvaluation: number;
  frameworkKnowledge: number;
  handsOnValidation: number;
  leadershipEvaluation: number;
  behavioralAssessment: number;
}

export interface Dimension {
  id: string;
  name: string;
  maxScore: number;
  actualScore: number;
  evidence: string[];
  colour: string;
}

// Weighted scoring
export const DIMENSIONS: Record<string, Dimension> = {
  mandatorySkillCoverage: {
    id: 'mandatorySkillCoverage',
    name: 'Mandatory Skill Coverage',
    maxScore: 2.0,
    actualScore: 0,
    evidence: [],
    colour: 'score-mandatory',
  },
  technicalDepth: {
    id: 'technicalDepth',
    name: 'Technical Depth',
    maxScore: 2.0,
    actualScore: 0,
    evidence: [],
    colour: 'score-technical',
  },
  rejectionValidationAlignment: {
    id: 'rejectionValidationAlignment',
    name: 'Rejection Validation Alignment',
    maxScore: 2.0,
    actualScore: 0,
    evidence: [],
    colour: 'score-structure',
  },
  scenarioRiskEvaluation: {
    id: 'scenarioRiskEvaluation',
    name: 'Scenario/Risk Evaluation',
    maxScore: 1.0,
    actualScore: 0,
    evidence: [],
    colour: 'score-scenario',
  },
  frameworkKnowledge: {
    id: 'frameworkKnowledge',
    name: 'Framework Knowledge',
    maxScore: 1.0,
    actualScore: 0,
    evidence: [],
    colour: 'score-framework',
  },
  handsOnValidation: {
    id: 'handsOnValidation',
    name: 'Hands-on Validation',
    maxScore: 1.0,
    actualScore: 0,
    evidence: [],
    colour: 'score-handson',
  },
  leadershipEvaluation: {
    id: 'leadershipEvaluation',
    name: 'Leadership Evaluation',
    maxScore: 0.5,
    actualScore: 0,
    evidence: [],
    colour: 'score-leadership',
  },
  behavioralAssessment: {
    id: 'behavioralAssessment',
    name: 'Behavioral Assessment',
    maxScore: 0.5,
    actualScore: 0,
    evidence: [],
    colour: 'score-behavioral',
  },
};
