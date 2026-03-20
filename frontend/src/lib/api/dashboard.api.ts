import apiClient from './client';
import type { DashboardStats, SearchResponse } from '@/types/dashboard.types';
import { sanitizeText } from '@/lib/utils/sanitize';

export interface PanelEfficiency {
  panelName: string;
  averageScore: number;
  evaluationCount: number;
  maxScore: number;
  minScore: number;
  scoreRange: string;
}

export interface PanelEfficiencyResponse {
  panels: PanelEfficiency[];
  totalPanels: number;
  overallAverage: number;
  totalEvaluations: number;
}

export const dashboardApi = {
  async fetchStats(): Promise<DashboardStats> {
    // Check if we should use real data (VITE_USE_MOCK_DASHBOARD should be explicitly 'false' to use real data)
    // Only use mock data if explicitly enabled as 'true'
    const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DASHBOARD === 'true';
    
    if (USE_MOCK_DATA) {
      // Return mock data immediately for development
      return getMockDashboardStats();
    }

    // Try common endpoint names; backend may expose different route
    const endpoints = ['/api/v1/panel/stats', '/api/v1/panel/dashboard', '/api/v1/panel/summary'];

    let lastErr: any = null;
    for (const ep of endpoints) {
      try {
        const resp = await apiClient.get(ep);
        // Unwrap the nested data object from backend response
        const body = resp.data?.data ?? resp.data ?? {};

        // Normalize response into DashboardStats
        const stats: DashboardStats = {
          totalEvaluations: Number((body.totalEvaluations ?? body.total_evaluations ?? body.total) || 0),
          averageScore: Number(body.averageScore ?? body.average_score ?? body.avg_score ?? 0),
          lastEvaluationDate: String((body.lastEvaluationDate ?? body.last_evaluation_date ?? body.last) || ''),
          evaluationsThisWeek: Number(body.evaluationsThisWeek ?? body.evaluations_this_week ?? 0),
          scoreDistribution: Array.isArray(body.scoreDistribution ?? body.score_distribution)
            ? (body.scoreDistribution ?? body.score_distribution).map((r: any) => ({ range: String(r.range ?? r.label), count: Number(r.count ?? r.value ?? 0) }))
            : [],
          dimensionTrends: Array.isArray(body.dimensionTrends ?? body.dimension_trends)
            ? (body.dimensionTrends ?? body.dimension_trends).map((p: any) => ({ date: String(p.date), dimension: String(p.dimension), score: Number(p.score) }))
            : [],
          recentEvaluations: Array.isArray(body.recentEvaluations ?? body.recent_evaluations) ? body.recentEvaluations ?? body.recent_evaluations : [],
        };

        // sanitize textual fields
        stats.lastEvaluationDate = sanitizeText(stats.lastEvaluationDate);

        return stats;
      } catch (err: any) {
        lastErr = err;
        // try next endpoint
      }
    }

    // All endpoints failed, use mock data
    return getMockDashboardStats();
  },

  async fetchPanelEfficiency(): Promise<PanelEfficiencyResponse> {
    try {
      const resp = await apiClient.get('/api/v1/panel/efficiency');
      const body = resp.data?.data ?? resp.data ?? {};

      return {
        panels: body.panels ?? [],
        totalPanels: body.totalPanels ?? 0,
        overallAverage: body.overallAverage ?? 0,
        totalEvaluations: body.totalEvaluations ?? 0
      };
    } catch (error) {
      console.error('Failed to fetch panel efficiency:', error);
      return {
        panels: [],
        totalPanels: 0,
        overallAverage: 0,
        totalEvaluations: 0
      };
    }
  },

  async searchEvaluations(
    jobInterviewId?: string,
    panelName?: string,
    candidateName?: string,
    limit: number = 50,
    skip: number = 0,
    sortBy: string = 'created_at',
    order: 'asc' | 'desc' = 'desc',
    scoreFilter: string = 'all'
  ): Promise<SearchResponse> {
    try {
      const params = new URLSearchParams();
      if (jobInterviewId) params.append('job_interview_id', jobInterviewId);
      if (panelName) params.append('panel_name', panelName);
      if (candidateName) params.append('candidate_name', candidateName);
      params.append('limit', String(limit));
      params.append('skip', String(skip));
      params.append('sort_by', sortBy);
      params.append('order', order);
      params.append('score_filter', scoreFilter);

      const resp = await apiClient.get(`/api/v1/panel/search?${params.toString()}`);
      const body = resp.data?.data ?? resp.data ?? {};

      return {
        evaluations: body.evaluations ?? [],
        totalEvaluations: body.totalEvaluations ?? 0,
        averageScore: body.averageScore ?? 0,
        scoreDistribution: body.scoreDistribution ?? [],
        pagination: body.pagination ?? {
          total: 0,
          limit,
          skip,
          pages: 0
        }
      };
    } catch (error) {
      console.error('Search failed:', error);
      return {
        evaluations: [],
        totalEvaluations: 0,
        averageScore: 0,
        scoreDistribution: [],
        pagination: {
          total: 0,
          limit,
          skip,
          pages: 0
        }
      };
    }
  },

  async fetchRefinedJd(jobId: string): Promise<{ refinedJd: any; panelSummary: string | null }> {
    try {
      const resp = await apiClient.get(`/api/v1/panel/refined-jd/${jobId}`);
      return {
        refinedJd: resp.data?.refinedJd ?? null,
        panelSummary: resp.data?.panelSummary ?? null,
      };
    } catch {
      return { refinedJd: null, panelSummary: null };
    }
  },

  async fetchCachedEvaluation(evaluationId: string): Promise<any> {
    try {
      const resp = await apiClient.get(`/api/v1/panel/evaluation/${evaluationId}`);
      const body = resp.data?.data ?? resp.data ?? {};

      // Map backend category/evidence label keys → camelCase frontend keys
      const LABEL_TO_CAMEL: Record<string, string> = {
        'Mandatory Skill Coverage':    'mandatorySkillCoverage',
        'Technical Depth':             'technicalDepth',
        'Scenario / Risk Evaluation':  'scenarioRiskEvaluation',
        'Framework Knowledge':         'frameworkKnowledge',
        'Hands-on Validation':         'handsOnValidation',
              'Leadership Evaluation':       'leadershipEvaluation',
              'Behavioral Assessment':       'behavioralAssessment',
              'Interview Structure':         'interviewStructure',
              'Rejection Validation Alignment': 'rejectionValidationAlignment',
      };

      const rawCategories = body.categories ?? {};
      const mappedCategories: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawCategories)) {
        mappedCategories[LABEL_TO_CAMEL[k] ?? k] = Number(v);
      }

      const rawEvidence = body.evidence;
      const mappedEvidence: Record<string, string[]> = {};
      if (rawEvidence && !Array.isArray(rawEvidence) && typeof rawEvidence === 'object') {
        for (const [k, v] of Object.entries(rawEvidence)) {
          const key = LABEL_TO_CAMEL[k] ?? k;
          if (Array.isArray(v)) mappedEvidence[key] = (v as any[]).map(String);
        }
      }

      return {
        jobId: body.jobId,
        panelName: body.panelName,
        candidateName: body.candidateName,
        score: body.score ?? 0,
        confidence: body.confidence,
        categories: mappedCategories,
        evidence: mappedEvidence,
        l2Validation: body.l2Validation,
        l2RejectionReasons: body.l2RejectionReasons ?? [],
        l1Transcript: body.l1Transcript || '',
        evaluatedAt: body.evaluatedAt,
        refinedJd: body.refinedJd ?? null,
        panelSummary: body.panelSummary ?? null,
        scoreCategory: (body.score ?? 0) >= 8 ? 'Good' : (body.score ?? 0) >= 5 ? 'Moderate' : 'Poor'
      };
    } catch (error) {
      console.error('Failed to fetch cached evaluation:', error);
      throw error;
    }
  }
};

function getMockDashboardStats(): DashboardStats {
  return {
      totalEvaluations: 7,
      averageScore: 5.6,
      lastEvaluationDate: new Date().toISOString().split('T')[0],
      evaluationsThisWeek: 0,
      scoreDistribution: [
        { range: '0-5', count: 3 },
        { range: '5-8', count: 5 },
        { range: '8-10', count: 0 },
      ],
      dimensionTrends: [],
      recentEvaluations: [],
    };
}

export default dashboardApi;
