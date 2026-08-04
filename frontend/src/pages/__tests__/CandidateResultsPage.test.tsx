import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import CandidateResultsPage from '../CandidateResultsPage';
import { pipelineApi } from '@/lib/api/pipeline.api';

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/lib/api/pipeline.api', () => ({
  pipelineApi: {
    getCandidate: vi.fn(),
  },
  formatPipelineEvaluation: (evaluation: any) => {
    if (!evaluation) return null;
    return {
      score: evaluation.score ?? 0,
      scoreCategory: evaluation.score >= 8 ? 'Good' : evaluation.score >= 5 ? 'Moderate' : 'Poor',
      categories: evaluation.categories || {},
      evidence: evaluation.evidence || {},
      moderation: evaluation.moderation || null,
      panel_summary: evaluation.panel_summary || '',
      gap_analysis: evaluation.gap_analysis || '',
    };
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('jobId=JD123&candidateName=John Doe')],
  };
});

describe('CandidateResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    // Mock getCandidate to return a promise that doesn't resolve immediately
    (pipelineApi.getCandidate as any).mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <CandidateResultsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading candidate pipeline details/i)).toBeTruthy();
  });

  const baseDetail = (analysis: any, stage1Extra: any = {}) => ({
    _id: '1',
    jobId: 'JD123',
    candidateName: 'John Doe',
    panelName: 'L1 Panel',
    panelEmail: 'panel@hr.tech',
    panelId: 'PN01',
    completedStages: ['stage1'],
    stage1: {
      completed: true,
      completedAt: new Date().toISOString(),
      jdText: 'React developer position',
      resumeText: 'John Doe is a React dev',
      analysis,
      ...stage1Extra,
    },
  });

  const renderPage = async (detail: any) => {
    (pipelineApi.getCandidate as any).mockResolvedValue(detail);
    render(
      <MemoryRouter>
        <CandidateResultsPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('John Doe')).toBeTruthy());
  };

  // Records screened before the tiered rubric are still in the collection and carry only
  // `matched`. They must keep rendering — a migration that blanks historic screenings is
  // not an improvement over the bug it fixes.
  it('renders a legacy pre-tier screening record', async () => {
    await renderPage(baseDetail({
      mandatorySkills: ['React', 'TypeScript'],
      goodToHaveSkills: ['Next.js'],
      keySkills: ['React', 'TypeScript'],
      mandatorySkillsMatch: [
        { skill: 'React', matched: true, evidence: 'Used React for 4 years' },
        { skill: 'TypeScript', matched: false, evidence: 'Not found in resume.' },
      ],
      additionalSkillsMatch: [
        { skill: 'Next.js', matched: true, evidence: 'Next.js projects in resume' },
      ],
      screeningSummary: 'Good candidate.',
      matchScore: 80,
      experienceMatch: 'Matches 4 years.',
      status: 'Eligible',
    }));

    expect(screen.getByText('ID: JD123')).toBeTruthy();
    expect(screen.getByText('Panel: L1 Panel')).toBeTruthy();
    expect(screen.getByText('Match Score: 80%')).toBeTruthy();
    expect(screen.getByText(/Good candidate/i)).toBeTruthy();
    // matched:true maps to Strong, matched:false to Not found. A legacy record was never
    // graded, so it must never be shown as Partial — that judgement was not made about it.
    expect(screen.getAllByText('Strong').length).toBe(2);
    expect(screen.getAllByText('Not found').length).toBe(1);
    expect(screen.queryByText('Partial')).toBeNull();
  });

  const TIERED = {
    mandatorySkills: ['Playwright', 'TestNG', 'Kubernetes'],
    goodToHaveSkills: ['Agile / Scrum'],
    keySkills: ['Playwright'],
    mandatorySkillsMatch: [
      { skill: 'Playwright', tier: 'STRONG', matched: true, credit: 1, source: 'ai-suggested',
        evidence: 'Implemented automation testing with Playwright' },
      { skill: 'TestNG', tier: 'PARTIAL', matched: true, credit: 0.5, source: 'ai-suggested',
        evidence: 'Java, Selenium WebDriver, TestNG, Maven',
        audit: { claimed_tier: 'STRONG', demoted: true,
          demotion_reasons: ['evidence is a bare skills list with no usage context'],
          grounding_ratio: 1, skill_named_in_resume: true, has_context_markers: false,
          looks_like_skills_list: true } },
      { skill: 'Kubernetes', tier: 'NONE', matched: false, credit: 0, source: 'ai-suggested',
        evidence: 'Not found in resume.' },
    ],
    additionalSkillsMatch: [
      { skill: 'Agile / Scrum', tier: 'STRONG', matched: true, credit: 1, source: 'jd',
        evidence: 'Participated in Agile ceremonies including sprint planning' },
    ],
    screeningSummary: 'Strong automation background.',
    matchScore: 65,
    experienceMatch: '6 years against the 5 the JD asks for.',
    status: 'Partially Eligible',
    scoreBreakdown: {
      mandatory: { count: 3, credit_earned: 1.5, weight: 70, strong: 1, partial: 1, none: 1 },
      goodToHave: { count: 1, credit_earned: 1, weight: 30, strong: 1, partial: 0, none: 0 },
      formula: 'mandatory 1.50/3 x 70 + good-to-have 1.00/1 x 30 = 65.0%',
      weights_redistributed: false,
    },
    skillsProvenance: {
      mandatorySource: 'ai-suggested', goodToHaveSource: 'jd',
      jdStatedMandatoryCount: 0, jdStatedGoodToHaveCount: 1, aiSuggestedCount: 5,
      analyzerError: null, mandatoryInferred: true,
      notice: 'The JD does not explicitly label any mandatory skills. These were inferred by AI from the role and are NOT stated in the JD — confirm with the recruitment team before acting on this score.',
      goodToHaveNotice: null,
    },
    reconciliation: { mandatoryMissing: [], mandatoryExtra: [], goodToHaveMissing: [], goodToHaveExtra: [] },
  };

  it('distinguishes all three skill tiers', async () => {
    await renderPage(baseDetail(TIERED));

    // The whole point of the grading: Strong and Partial must not read alike. A boolean
    // UI showed both as one green tick, which is what made the coverage look wrong.
    expect(screen.getAllByText('Strong').length).toBe(2);
    expect(screen.getByText('Partial')).toBeTruthy();
    expect(screen.getByText('Not found')).toBeTruthy();
  });

  it('shows the score derivation so the percentage can be checked by hand', async () => {
    await renderPage(baseDetail(TIERED));
    expect(screen.getByText('Match Score: 65%')).toBeTruthy();
    expect(screen.getByText('mandatory 1.50/3 x 70 + good-to-have 1.00/1 x 30 = 65.0%')).toBeTruthy();
  });

  it('warns that mandatory skills were AI-inferred rather than JD-stated', async () => {
    await renderPage(baseDetail(TIERED));
    expect(screen.getByText('AI-inferred — not stated in JD')).toBeTruthy();
    expect(screen.getByText(/NOT stated in the JD/i)).toBeTruthy();
    // Every AI-inferred skill is tagged at the row level too, so the caveat survives
    // someone scrolling past the banner.
    expect(screen.getAllByText('AI-inferred').length).toBe(3);
  });

  it('explains why a claimed match was downgraded', async () => {
    await renderPage(baseDetail(TIERED));
    expect(screen.getByText(/Downgraded from STRONG: evidence is a bare skills list/i)).toBeTruthy();
  });

  it('reports an unscoreable screening as not calculable, not 0%', async () => {
    await renderPage(baseDetail({
      ...TIERED,
      mandatorySkillsMatch: [],
      additionalSkillsMatch: [],
      matchScore: null,
      status: 'Not Screenable',
      scoreBreakdown: undefined,
      skillsProvenance: {
        ...TIERED.skillsProvenance,
        mandatorySource: 'none', goodToHaveSource: 'none', mandatoryInferred: false,
        notice: 'The JD names no mandatory skills and no AI suggestions were produced — this screening has no criteria to evaluate.',
      },
    }));

    // 0% reads as "the candidate matched nothing"; the truth is that nothing was assessed.
    expect(screen.getByText('Match Score: not calculable')).toBeTruthy();
    expect(screen.getByText('Not Screenable')).toBeTruthy();
    expect(screen.queryByText('Match Score: 0%')).toBeNull();
  });

  it('flags skills the model never reported as unverified rather than as gaps', async () => {
    await renderPage(baseDetail({
      ...TIERED,
      reconciliation: { mandatoryMissing: ['Selenium WebDriver'], mandatoryExtra: [], goodToHaveMissing: [], goodToHaveExtra: [] },
    }));
    // Scoped to the banner: "Selenium WebDriver" also appears inside the TestNG row's
    // skills-list evidence, so a page-wide query would match either one.
    const banner = screen.getByText('Unexamined skills').closest('div')!.parentElement!;
    expect(banner.textContent).toMatch(/did not report on Selenium WebDriver/);
    expect(banner.textContent).toMatch(/unverified rather than\s+as confirmed gaps/);
  });

  it('shows prior screenings so a changed score can be compared', async () => {
    await renderPage(baseDetail(TIERED, {
      history: [
        { screenedAt: '2026-07-01T10:00:00.000Z', matchScore: 85, status: 'Eligible',
          formula: 'mandatory 3.00/3 x 70 + good-to-have 1.00/2 x 30 = 85.0%',
          scoring_meta: { rubric_version: 'screening-v2-tiered', model_digest: 'abcdef1234567890' } },
      ],
    }));

    expect(screen.getByText('Previous Screenings (1)')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    // The delta is the answer to the drift complaint: 65 now vs 85 before.
    expect(screen.getByText('-20 vs current')).toBeTruthy();
  });
});
