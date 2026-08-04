import apiClient from './client';
import { sanitizeText } from '@/lib/utils/sanitize';

/**
 * The backend health-gates scoring and returns 503 when the on-prem model is
 * down, so nothing was scored and the request is safe to retry. Surface that as
 * a clear message instead of a generic "Request failed with status code 503".
 */
function rethrowScoringError(err: any, stage: string): never {
  const data = err?.response?.data;
  const status = err?.response?.status;

  if (status === 503 && data?.code) {
    const e = new Error(data.error || `${stage} scoring is unavailable — please retry shortly.`);
    (e as any).code = data.code;
    (e as any).retryable = true;
    throw e;
  }

  // 422 SCREENING_FAILED: the screening genuinely could not run and nothing was
  // stored. Stage 1 used to swallow these and persist a record reading "please
  // re-upload" with a score of 0, so a model outage looked like a bad resume and no
  // amount of re-uploading could clear it. The real reason is in data.error.
  if (status === 422 && data?.error) {
    const e = new Error(data.error);
    (e as any).code = data.code || 'STAGE_FAILED';
    (e as any).retryable = data.retryable !== false;
    throw e;
  }

  throw err;
}

/**
 * How strongly the resume evidences a skill.
 *
 * Replaces a boolean. A boolean forced a borderline skill — named in a skills list with
 * nothing behind it — into either a green tick or a red cross, and which one it landed
 * on moved the match score by a full 70/N. PARTIAL is where that skill belongs.
 */
export type SkillTier = 'STRONG' | 'PARTIAL' | 'NONE';

/** Whether a skill came from the JD or was inferred by AI from the role. */
export type SkillSource = 'jd' | 'ai-suggested';

export interface SkillMatchRow {
  skill: string;
  tier: SkillTier;
  /** true for STRONG and PARTIAL. Retained for pre-tier consumers; prefer `tier`. */
  matched: boolean;
  evidence: string;
  /** STRONG 1.0 / PARTIAL 0.5 / NONE 0 — the number the score is summed from. */
  credit: number;
  source: SkillSource;
  /** Why the backend graded this row as it did, including any demotion of the model's claim. */
  audit?: {
    claimed_tier: SkillTier;
    demoted: boolean;
    demotion_reasons: string[];
    grounding_ratio: number;
    skill_named_in_resume: boolean;
    has_context_markers: boolean;
    looks_like_skills_list: boolean;
  };
}

interface SkillBucketBreakdown {
  count: number;
  credit_earned: number;
  weight: number;
  strong: number;
  partial: number;
  none: number;
}

/** The arithmetic behind matchScore, so the number can be checked by hand. */
export interface ScoreBreakdown {
  mandatory: SkillBucketBreakdown;
  goodToHave: SkillBucketBreakdown;
  /** e.g. "mandatory 1.50/3 x 70 + good-to-have 1.00/1 x 30 = 65.0%" */
  formula: string;
  /** true when one bucket was empty and its weight moved to the other. */
  weights_redistributed: boolean;
}

/** Where the screened skills came from — the caveat the UI has to show. */
export interface SkillsProvenance {
  mandatorySource: SkillSource | 'none';
  goodToHaveSource: SkillSource | 'none';
  jdStatedMandatoryCount: number;
  jdStatedGoodToHaveCount: number;
  aiSuggestedCount: number;
  analyzerError: string | null;
  /** true when the JD stated no mandatory skills and AI suggestions were used instead. */
  mandatoryInferred: boolean;
  notice: string | null;
  goodToHaveNotice: string | null;
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
      mandatorySkillsMatch: SkillMatchRow[];
      additionalSkillsMatch: SkillMatchRow[];
      screeningSummary: string;
      /**
       * null when the JD yielded no skills at all — there is nothing to score against,
       * which is a different statement from 0%, and rendering it as 0 reads as a
       * candidate who matched nothing.
       */
      matchScore: number | null;
      experienceMatch: string;
      status: 'Eligible' | 'Partially Eligible' | 'Ineligible' | 'Not Screenable';
      /** Optional: records screened before the tiered rubric carry none of these. */
      scoreBreakdown?: ScoreBreakdown;
      skillsProvenance?: SkillsProvenance;
      reconciliation?: {
        mandatoryMissing: string[];
        mandatoryExtra: string[];
        goodToHaveMissing: string[];
        goodToHaveExtra: string[];
      };
      scoring_meta?: Record<string, any>;
      screenedAt?: string;
    };
    /** Prior screenings of this record, oldest first — kept so drift is checkable. */
    history?: Array<{
      screenedAt: string | null;
      matchScore: number | null;
      status: string | null;
      formula: string | null;
      scoring_meta: Record<string, any> | null;
    }>;
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
    // Synchronous (no job polling), but it now health-gates and makes two seeded LLM
    // calls, so give it room and route failures through the shared handler.
    const response = await apiClient
      .post('/api/v1/pipeline/stage1', data, { timeout: 180000 })
      .catch(err => rethrowScoringError(err, 'Screening'));
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
