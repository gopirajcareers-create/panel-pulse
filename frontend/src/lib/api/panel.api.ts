import apiClient from './client';
import type { UploadRequest } from '@/types/upload.types';
import type { PanelEfficiencyScore } from '@/types/evaluation.types';
import { sanitizeText } from '@/lib/utils/sanitize';

const CATEGORY_KEY_MAP: Record<string, keyof PanelEfficiencyScore['dimensions']> = {
  'Mandatory Skill Coverage': 'mandatorySkillCoverage',
  'Technical Depth': 'technicalDepth',
  'Rejection Validation Alignment': 'rejectionValidationAlignment',
  'Scenario / Risk Evaluation': 'scenarioRiskEvaluation',
  'Framework Knowledge': 'frameworkKnowledge',
  'Hands-on Validation': 'handsOnValidation',
  'Leadership Evaluation': 'leadershipEvaluation',
  'Behavioral Assessment': 'behavioralAssessment',
};

function mapBackendToPanelScore(body: any, request: UploadRequest): PanelEfficiencyScore {
  const full = body.full_evaluation || {};
  const numericScore = body.panel_score ?? full.score ?? 0;

  const dimensions: any = {};
  if (full.categories) {
    for (const [k, v] of Object.entries(full.categories)) {
      const mapped = CATEGORY_KEY_MAP[k] ?? null;
      if (mapped) dimensions[mapped] = v as number;
    }
  }

  // ensure all keys exist with a default
  for (const key of Object.values(CATEGORY_KEY_MAP)) {
    if (dimensions[key] == null) dimensions[key] = 0;
  }

  const evidence: Record<string, string[]> = {};
  const rawEvidence: any = full.evidence ?? body.evidence ?? {};
  // LLM now returns evidence as object keyed by category name
  if (Array.isArray(rawEvidence)) {
    // Legacy flat array — store under 'general' (will not show in dimension cards)
    evidence['general'] = rawEvidence.map((e: any) => sanitizeText(e?.quote ?? String(e)));
  } else if (typeof rawEvidence === 'object' && rawEvidence !== null) {
    for (const [k, v] of Object.entries(rawEvidence)) {
      if (Array.isArray(v)) evidence[k] = v.map((x: any) => sanitizeText(String(x)));
      else if (v) evidence[k] = [sanitizeText(String(v))];
    }
  }

  const scoreCategory = numericScore >= 8 ? 'Good' : numericScore >= 5 ? 'Moderate' : 'Poor';

  return {
    jobId: body.job_id ?? request.jobId,
    panelEfficiencyScore: numericScore,
    scoreCategory,
    dimensions,
    evidence,
    timestamp: body.timestamp ?? new Date().toISOString(),
    refined_jd: body.refined_jd ?? full.refined_jd ?? null,
    panel_summary: body.panel_summary ?? full.panel_summary ?? null,
    gap_analysis: body.gap_analysis ?? full.gap_analysis ?? null,
  } as any;
}

export const panelApi = {
  async checkExisting(jobId: string, panelName: string, candidateName: string): Promise<any> {
    try {
      const params = new URLSearchParams({
        job_id: jobId,
        panel_name: panelName,
        candidate_name: candidateName
      });

      const response = await apiClient.get(`/api/v1/panel/check-existing?${params.toString()}`);
      return response.data;
    } catch (err: any) {
      console.error('Failed to check existing evaluation:', err);
      return {
        success: false,
        exists: false
      };
    }
  },

  async scorePanel(data: UploadRequest): Promise<PanelEfficiencyScore> {
    // Adapt UploadRequest -> backend expected shape
    const body = {
      job_id: data.jobId,
      panel_name: data.panelName,
      candidate_name: data.candidateName,
      jd: data.jd,
      l1_transcripts: Array.isArray(data.l1Transcript) ? data.l1Transcript : [data.l1Transcript],
      l2_rejection_reasons: Array.isArray(data.l2RejectionReason) ? data.l2RejectionReason : [data.l2RejectionReason],
      panel_member_id: data.panel_member_id,
      panel_member_email: data.panel_member_email,
    };

    try {
      const response = await apiClient.post('/api/v1/panel/score', body, {
        timeout: 360000, // 6 min — runs L2 validation + scoring + gap analysis + JD refine + summary
      });
      const result = mapBackendToPanelScore(response.data, data);
      // Add cached indicator to result
      if (response.data?.is_cached) {
        (result as any).isCached = true;
        (result as any).cachedMessage = response.data.cached_message;
      }
      return result;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        throw new Error('Scoring service temporarily unavailable due to rate limits. Please try again in a moment.');
      }
      // Bubble up other errors
      throw err;
    }
  },

  async validateL2(data: { l1Transcript: string; l2RejectionReason: string }) {
    const body = {
      job_id: '(unknown)',
      l2_reason: data.l2RejectionReason,
      l1_transcripts: [data.l1Transcript],
    };
    try {
      const response = await apiClient.post('/api/v1/panel/validate-l2', body);
      return response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        throw new Error('Validation service temporarily unavailable due to rate limits. Please try again in a moment.');
      }
      throw err;
    }
  },

  async getHealth() {
    const response = await apiClient.get('/api/v1/panel/health');
    return response.data;
  },

  async getPanelDirectory() {
    const response = await apiClient.get('/api/v1/panel/insights/directory');
    return response.data;
  },

  async getPanelProfile(panelName: string) {
    const response = await apiClient.get(`/api/v1/panel/insights/profile/${encodeURIComponent(panelName)}`);
    return response.data;
  },
};
