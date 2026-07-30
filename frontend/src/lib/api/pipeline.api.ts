import apiClient from './client';
import { sanitizeText } from '@/lib/utils/sanitize';

/**
 * The backend health-gates scoring and returns 503 when the on-prem model is
 * down, so nothing was scored and the request is safe to retry. Surface that as
 * a clear message instead of a generic "Request failed with status code 503".
 */
function rethrowScoringError(err: any, stage: string): never {
  const data = err?.response?.data;
  if (err?.response?.status === 503 && data?.code) {
    const e = new Error(data.error || `${stage} scoring is unavailable — please retry shortly.`);
    (e as any).code = data.code;
    (e as any).retryable = true;
    throw e;
  }
  throw err;
}

export interface PipelineCandidate {
  id: string;
  jobId: string;
  candidateName: string;
  panelName: string;
  panelEmail: string;
  panelId: string;
  completedStages: string[];
  latestScore: number | null;
  updatedAt: string;
  stage1Status: 'completed' | 'pending';
  stage2Status: 'completed' | 'pending';
  stage3Status: 'completed' | 'pending';
  stage4Status: 'completed' | 'pending';
}

export interface PipelineDetail {
  _id: string;
  jobId: string;
  candidateName: string;
  panelName: string;
  panelEmail: string;
  panelId: string;
  completedStages: string[];
  createdAt: string;
  updatedAt: string;
  stage1?: {
    completed: boolean;
    completedAt: string;
    jdText: string;
    resumeText: string;
    analysis: {
      mandatorySkills: string[];
      goodToHaveSkills: string[];
      keySkills: string[];
      mandatorySkillsMatch: Array<{ skill: string; matched: boolean; evidence: string }>;
      additionalSkillsMatch: Array<{ skill: string; matched: boolean; evidence: string }>;
      screeningSummary: string;
      matchScore: number;
      experienceMatch: string;
      status: 'Eligible' | 'Partially Eligible' | 'Ineligible';
    };
  };
  stage2?: {
    completed: boolean;
    completedAt: string;
    l1Transcript: string;
    evaluation: any;
  };
  stage3?: {
    completed: boolean;
    completedAt: string;
    l2Transcript: string;
    candidateStatus?: 'Selected' | 'Rejected' | string;
    evaluation: any;
    moderation?: any;
  };
  stage4?: {
    completed: boolean;
    completedAt: string;
    feedbackText: string;
    feedbackFileName?: string;
    identityConfirmation?: {
      jobIdFoundInFilename: boolean;
      jobIdFoundInContent: boolean;
      candidateFoundInFilename: boolean;
      candidateFoundInContent: boolean;
      fileName: string;
      confirmationStatus: 'Confirmed' | 'Partially Confirmed' | 'Unconfirmed';
      confirmationNote: string;
    };
    analysis: {
      leakageVerdict: 'L1 Leakage' | 'L2 Leakage' | 'Joint Failure' | 'No Leakage' | 'Unjustified Rejection';
      overallAuditSummary: string;
      screeningAudit: {
        verdict: 'Accurate' | 'Missed Gaps' | 'Over-screened';
        summary: string;
        gaps: string[];
      };
      l1Audit: {
        probingLevel: 'Excellent' | 'Good' | 'Adequate' | 'Weak' | 'Poor';
        probingLevelScore: number;
        summary: string;
        strengths: string[];
        gaps: string[];
        panelSummaryAccuracy: 'Accurate' | 'Partially Accurate' | 'Inaccurate';
        panelSummaryNote: string;
      };
      l2Audit: {
        probingLevel: 'Excellent' | 'Good' | 'Adequate' | 'Weak' | 'Poor';
        probingLevelScore: number;
        summary: string;
        strengths: string[];
        gaps: string[];
        panelSummaryAccuracy: 'Accurate' | 'Partially Accurate' | 'Inaccurate';
        panelSummaryNote: string;
      };
      rejectionReasonValidity: 'Valid' | 'Partially Valid' | 'Invalid';
      rejectionReasonAnalysis: string;
      crossArtifactEvidence: string[];
      recommendations: {
        screening: string;
        l1Panel: string;
        l2Panel: string;
        process: string;
      };
      // Legacy fallback fields
      leakageSummary?: string;
      evidence?: string[];
    };
  };
}

const CATEGORY_KEY_MAP: Record<string, string> = {
  'Mandatory Skill Coverage': 'mandatorySkillCoverage',
  'Technical Depth': 'technicalDepth',
  'Rejection Validation Alignment': 'rejectionValidationAlignment',
  'Resume Screening & Handoff': 'resumeScreeningHandoff',
  'Scenario / Risk Evaluation': 'scenarioRiskEvaluation',
  'Framework Knowledge': 'frameworkKnowledge',
  'Hands-on Validation': 'handsOnValidation',
  'Leadership Evaluation': 'leadershipEvaluation',
  'Behavioral Assessment': 'behavioralAssessment',
};

export function formatPipelineEvaluation(evaluation: any) {
  if (!evaluation) return null;
  const numericScore = evaluation.score ?? 0;
  const dimensions: any = {};
  if (evaluation.categories) {
    for (const [k, v] of Object.entries(evaluation.categories)) {
      const mapped = CATEGORY_KEY_MAP[k] ?? null;
      if (mapped) dimensions[mapped] = v as number;
    }
  }

  // Ensure all keys exist with a default
  for (const key of Object.values(CATEGORY_KEY_MAP)) {
    if (dimensions[key] == null) dimensions[key] = 0;
  }

  const evidence: Record<string, string[]> = {};
  const rawEvidence = evaluation.evidence || {};
  if (Array.isArray(rawEvidence)) {
    evidence['general'] = rawEvidence.map((e: any) => sanitizeText(e?.quote ?? String(e)));
  } else if (typeof rawEvidence === 'object' && rawEvidence !== null) {
    for (const [k, v] of Object.entries(rawEvidence)) {
      if (Array.isArray(v)) evidence[k] = v.map((x: any) => sanitizeText(String(x)));
      else if (v) evidence[k] = [sanitizeText(String(v))];
    }
  }

  const scoreCategory = numericScore >= 8 ? 'Good' : numericScore >= 5 ? 'Moderate' : 'Poor';

  return {
    ...evaluation,
    score: numericScore,
    categories: dimensions,
    evidence,
    scoreCategory
  };
}

export const pipelineApi = {
  async getCandidates(): Promise<PipelineCandidate[]> {
    const response = await apiClient.get('/api/v1/pipeline/candidates');
    return response.data.data;
  },

  async getCandidate(jobId: string, candidateName: string): Promise<PipelineDetail> {
    const params = new URLSearchParams({
      jobId,
      candidateName
    });
    const response = await apiClient.get(`/api/v1/pipeline/candidate?${params.toString()}`);
    return response.data.data;
  },

  async submitStage1(data: {
    jobId: string;
    candidateName: string;
    panelName: string;
    panelEmail: string;
    panelId: string;
    jdText: string;
    resumeText: string;
  }): Promise<any> {
    const response = await apiClient.post('/api/v1/pipeline/stage1', data);
    return response.data;
  },

  async submitStage2(data: {
    jobId: string;
    candidateName: string;
    panelName: string;
    panelEmail: string;
    panelId: string;
    l1Transcript: string;
  }): Promise<any> {
    // Stage 2 starts an async job
    const startResp = await apiClient
      .post('/api/v1/pipeline/stage2', data, { timeout: 15000 })
      .catch(err => rethrowScoringError(err, 'Stage 2'));
    const jobId = startResp.data?.async_job_id;
    if (!jobId) throw new Error('No job ID returned from pipeline scoring service');

    // Poll until complete
    const MAX_POLLS = 150;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(res => setTimeout(res, 4000));
      const pollResp = await apiClient.get(`/api/v1/pipeline/score/job/${jobId}`, { timeout: 10000 });
      const pollData = pollResp.data;

      if (pollData?.status === 'processing') continue;

      if (pollData?.status === 'failed' || !pollData?.success) {
        throw new Error(pollData?.error || 'Stage 2 scoring failed');
      }

      if (pollData?.status === 'complete') {
        return pollData.evaluation;
      }
    }
    throw new Error('Stage 2 evaluation timed out');
  },

  async submitStage3(data: {
    jobId: string;
    candidateName: string;
    panelName: string;
    panelEmail: string;
    panelId: string;
    l2Transcript: string;
    candidateStatus: 'Selected' | 'Rejected';
  }): Promise<any> {
    // Stage 3 starts an async job
    const startResp = await apiClient
      .post('/api/v1/pipeline/stage3', data, { timeout: 15000 })
      .catch(err => rethrowScoringError(err, 'Stage 3'));
    const jobId = startResp.data?.async_job_id;
    if (!jobId) throw new Error('No job ID returned from pipeline scoring service');

    // Poll until complete
    const MAX_POLLS = 150;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(res => setTimeout(res, 4000));
      const pollResp = await apiClient.get(`/api/v1/pipeline/score/job/${jobId}`, { timeout: 10000 });
      const pollData = pollResp.data;

      if (pollData?.status === 'processing') continue;

      if (pollData?.status === 'failed' || !pollData?.success) {
        throw new Error(pollData?.error || 'Stage 3 scoring failed');
      }

      if (pollData?.status === 'complete') {
        return pollData.evaluation;
      }
    }
    throw new Error('Stage 3 evaluation timed out');
  },

  async submitStage4(data: {
    jobId: string;
    candidateName: string;
    feedbackText: string;
    feedbackFileName?: string;
  }): Promise<any> {
    const response = await apiClient.post('/api/v1/pipeline/stage4', data);
    return response.data;
  },

  async generateL1Questions(jobId: string, candidateName: string): Promise<{
    categories: Array<{
      title: string;
      icon: string;
      questions: Array<{ q: string; rationale: string }>;
    }>;
  }> {
    const response = await apiClient.post('/api/v1/pipeline/generate-l1-questions', { jobId, candidateName });
    return response.data.data;
  },

  async restartCandidate(jobId: string, candidateName: string): Promise<any> {
    const response = await apiClient.post('/api/v1/pipeline/restart', { jobId, candidateName });
    return response.data;
  },

  async restartFromStage(jobId: string, candidateName: string, stageId: string): Promise<any> {
    const response = await apiClient.post('/api/v1/pipeline/restart-stage', {
      jobId,
      candidateName,
      stageId
    });
    return response.data;
  }
};
