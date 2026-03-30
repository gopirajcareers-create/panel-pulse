import type { ScoreDistribution, DimensionTrendPoint } from './chart.types';

export interface DashboardStats {
  totalEvaluations: number;
  averageScore: number;
  lastEvaluationDate: string;
  evaluationsThisWeek: number;
  scoreDistribution: ScoreDistribution[];
  dimensionTrends: DimensionTrendPoint[];
  recentEvaluations?: DashboardEvaluation[];
}

export interface DashboardEvaluation {
  _id?: string; // MongoDB ObjectID for navigation to results page
  jobInterviewId: string;
  panelName: string;
  candidateName: string;
  l2RejectionReason?: string;
  evaluationCount?: number;
  averageScore: number;
  lastEvaluationDate: string;
}

export interface SearchResponse {
  evaluations: DashboardEvaluation[];
  totalEvaluations: number;
  averageScore: number;
  scoreDistribution: ScoreDistribution[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
    pages: number;
  };
}
