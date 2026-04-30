export interface L2ValidationResult {
  probingDepth: 'NO PROBING' | 'SURFACE PROBING' | 'DEEP PROBING';
  matchedQuestions: string[];
  validated: boolean;
  confidence: number;
}

export interface L1Transcript {
  candidateName: string;
  panelMemberName: string;
  content: string;
  timestamp: string;
}

export interface L2Reason {
  jobId: string;
  rejectionReason: string;
}
