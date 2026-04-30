import { create } from 'zustand';
import type { PanelEfficiencyScore, DimensionScores } from '@/types/evaluation.types';

interface EvaluationState {
  jobId: string;
  evaluationId?: string;
  timestamp?: string;
  l1Transcript?: string;
  l2RejectionReason?: string;
  panelScore: number | null;
  scoreCategory: 'Poor' | 'Moderate' | 'Good' | null;
  dimensions: DimensionScores | null;
  evidence: Record<string, string[]> | null;
  l2ValidationResult: any | null;
  panelSummary: string | null;
  gapAnalysis: string | null;
  refinedJd: any | null;
  isLoading: boolean;
  setJobId: (id: string) => void;
  setEvaluationId: (id: string) => void;
  setTimestamp: (ts: string) => void;
  setL1Transcript: (transcript: string) => void;
  setL2RejectionReason: (reason: string) => void;
  setEvaluation: (score: PanelEfficiencyScore) => void;
  setL2Validation: (result: any) => void;
  setLoading: (v: boolean) => void;
  clear: () => void;
}

export const useEvaluationStore = create<EvaluationState>((set) => ({
  jobId: '',
  evaluationId: undefined,
  timestamp: undefined,
  l1Transcript: undefined,
  l2RejectionReason: undefined,
  panelScore: null,
  scoreCategory: null,
  dimensions: null,
  evidence: null,
  l2ValidationResult: null,
  panelSummary: null,
  gapAnalysis: null,
  refinedJd: null,
  isLoading: false,
  setJobId: (id) => set({ jobId: id }),
  setEvaluationId: (id) => set({ evaluationId: id }),
  setTimestamp: (ts) => set({ timestamp: ts }),
  setL1Transcript: (transcript) => set({ l1Transcript: transcript }),
  setL2RejectionReason: (reason) => set({ l2RejectionReason: reason }),
  setEvaluation: (score) =>
    set({
      jobId: score.jobId,
      panelScore: score.panelEfficiencyScore,
      scoreCategory: score.scoreCategory,
      dimensions: score.dimensions,
      evidence: score.evidence,
      timestamp: score.timestamp,
      evaluationId: score.jobId,
      panelSummary: (score as any).panelSummary || (score as any).panel_summary || null,
      gapAnalysis: (score as any).gapAnalysis || (score as any).gap_analysis || null,
      refinedJd: (score as any).refinedJd || (score as any).refined_jd || null,
    }),
  setL2Validation: (result) => set({ l2ValidationResult: result }),
  setLoading: (v) => set({ isLoading: v }),
  clear: () =>
    set({
      jobId: '',
      evaluationId: undefined,
      timestamp: undefined,
      l1Transcript: undefined,
      l2RejectionReason: undefined,
      panelScore: null,
      scoreCategory: null,
      dimensions: null,
      evidence: null,
      l2ValidationResult: null,
      panelSummary: null,
      gapAnalysis: null,
      refinedJd: null,
      isLoading: false,
    }),
}));
