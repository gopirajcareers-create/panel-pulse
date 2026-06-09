import apiClient from './client';
import { sanitizeText } from '@/lib/utils/sanitize';

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
    evaluation: any;
  };
  stage4?: {
    completed: boolean;
    completedAt: string;
    feedbackText: string;
    analysis: {
      leakageVerdict: 'L1 Leakage' | 'L2 Leakage' | 'Joint Failure' | 'No Leakage';
      leakageSummary: string;
      evidence: string[];
    };
  };
}

const CATEGORY_KEY_MAP: Record<string, string> = {
  'Mandatory Skill Coverage': 'mandatorySkillCoverage',
  'Technical Depth': 'technicalDepth',
  'Rejection Validation Alignment': 'rejectionValidationAlignment',
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
    const startResp = await apiClient.post('/api/v1/pipeline/stage2', data, { timeout: 15000 });
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
  }): Promise<any> {
    // Stage 3 starts an async job
    const startResp = await apiClient.post('/api/v1/pipeline/stage3', data, { timeout: 15000 });
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
  }): Promise<any> {
    const response = await apiClient.post('/api/v1/pipeline/stage4', data);
    return response.data;
  }
};
