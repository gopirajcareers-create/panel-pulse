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
      { skill: 'Playwright', tier: 'STRONG', grade: 'STRONG', matched: true, credit: 1, source: 'ai-suggested',
        evidence: 'Implemented automation testing with Playwright' },
      { skill: 'TestNG', tier: 'PARTIAL', grade: 'PARTIAL_MID', matched: true, credit: 0.75, source: 'ai-suggested',
        evidence: 'Java, Selenium WebDriver, TestNG, Maven',
        audit: { claimed_tier: 'STRONG', claimed_grade: 'STRONG', demoted: true,
          demotion_reasons: ['evidence is a bare skills list with no usage context'],
          grade_reason: 'the evidence is a bare technology list — familiarity, not demonstrated use',
          grounding_ratio: 1, skill_named_in_resume: true, has_context_markers: false,
          looks_like_skills_list: true } },
      { skill: 'Kubernetes', tier: 'NONE', grade: 'NONE', matched: false, credit: 0, source: 'ai-suggested',
        evidence: 'Not found in resume.' },
    ],
    additionalSkillsMatch: [
      { skill: 'Agile / Scrum', tier: 'STRONG', grade: 'STRONG', matched: true, credit: 1, source: 'jd',
        evidence: 'Participated in Agile ceremonies including sprint planning' },
    ],
    screeningSummary: 'Strong automation background.',
    matchScore: 67,
    experienceMatch: '6 years against the 5 the JD asks for.',
    status: 'Partially Eligible',
    scoreBreakdown: {
      mandatory: { skills: 3, credit_earned: 1.75, weight: 80, points: 46.67,
        strong: 1, partial: 1, partial_high: 0, partial_mid: 1, partial_low: 0, none: 1 },
      goodToHave: { skills: 1, credit_earned: 1, weight: 20, points: 20,
        strong: 1, partial: 0, partial_high: 0, partial_mid: 0, partial_low: 0, none: 0 },
      formula: 'mandatory 1.75/3 x 80 + good-to-have 1.00/1 x 20 = 66.7%',
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
    expect(screen.getByText('Partial · 0.75')).toBeTruthy();
    expect(screen.getByText('Not found')).toBeTruthy();
  });

  it('states what a Partial is worth rather than only that it is partial', async () => {
    await renderPage(baseDetail({
      ...TIERED,
      mandatorySkillsMatch: [
        { skill: 'Playwright', tier: 'PARTIAL', grade: 'PARTIAL_HIGH', matched: true, credit: 1, source: 'jd',
          evidence: 'Two years of Playwright on the payments regression suite',
          audit: { claimed_tier: 'PARTIAL', claimed_grade: 'PARTIAL_HIGH', demoted: false,
            demotion_reasons: [],
            grade_reason: 'the model graded this partial, but the resume names the skill with supporting context — credited as a full match',
            grounding_ratio: 1, skill_named_in_resume: true, has_context_markers: true,
            looks_like_skills_list: false } },
        { skill: 'TestNG', tier: 'PARTIAL', grade: 'PARTIAL_LOW', matched: true, credit: 0.5, source: 'jd',
          evidence: 'Inferred from the surrounding automation stack',
          audit: { claimed_tier: 'PARTIAL', claimed_grade: 'PARTIAL_HIGH', demoted: true,
            demotion_reasons: ['the skill\'s own name does not appear in the resume'],
            grade_reason: 'the skill\'s own name is absent from the resume — the match is inferred',
            grounding_ratio: 0.4, skill_named_in_resume: false, has_context_markers: true,
            looks_like_skills_list: false } },
      ],
    }));

    // Two amber rows, one worth twice the other. Labelling both "Partial" is what made a
    // reader treat them as equivalent evidence.
    expect(screen.getByText('Partial · 1.0')).toBeTruthy();
    expect(screen.getByText('Partial · 0.5')).toBeTruthy();
    // A full-credit Partial has no demotion to explain it, so the reason it counts as a
    // whole skill has to be stated outright.
    expect(screen.getByText(/Credited 1 of 1.0 — the model graded this partial/i)).toBeTruthy();
    expect(screen.getByText(/Credited 0.5 of 1.0 — the skill's own name is absent/i)).toBeTruthy();
  });

  it('shows the score derivation so the percentage can be checked by hand', async () => {
    await renderPage(baseDetail(TIERED));
    expect(screen.getByText('Match Score: 67%')).toBeTruthy();
    expect(screen.getByText('mandatory 1.75/3 x 80 + good-to-have 1.00/1 x 20 = 66.7%')).toBeTruthy();
  });

  it('breaks each coverage list down into the points it contributed', async () => {
    await renderPage(baseDetail(TIERED));

    // Only the weight was shown before, so "Weighted 80% of the match score" sat above
    // three skills and a total of 67% with nothing on screen joining the two.
    const mandatory = screen.getByText('Mandatory Skills Coverage').closest('div')!.parentElement!;
    expect(mandatory.textContent).toMatch(/Weighted\s*80%\s*of the match score/);
    expect(mandatory.textContent).toMatch(/1\.75\s*credit earned of 3 skills/);
    expect(mandatory.textContent).toMatch(/46\.67 pts/);
    expect(mandatory.textContent).toMatch(/Partial credit: 1 at 0\.75/);

    const goodToHave = screen.getByText('Good-to-Have Skills Coverage').closest('div')!.parentElement!;
    expect(goodToHave.textContent).toMatch(/Weighted\s*20%\s*of the match score/);
    expect(goodToHave.textContent).toMatch(/20 pts/);
    // No partials in this bucket, so no split line to explain.
    expect(goodToHave.textContent).not.toMatch(/Partial credit:/);
  });

  it('recovers the breakup of a record stored before partials were graded', async () => {
    // Stored rows carry a flat credit of 0.5 and no `grade`, and the breakdown used the
    // earlier key name with no `points` at all. A re-opened record must not read as
    // "0 credit earned of 0 skills → 0 pts".
    await renderPage(baseDetail({
      ...TIERED,
      mandatorySkillsMatch: [
        { skill: 'Playwright', tier: 'STRONG', matched: true, credit: 1, source: 'jd', evidence: 'e' },
        { skill: 'TestNG', tier: 'PARTIAL', matched: true, credit: 0.5, source: 'jd', evidence: 'e' },
      ],
      scoreBreakdown: {
        ...TIERED.scoreBreakdown,
        mandatory: { count: 2, credit_earned: 1.5, weight: 70, strong: 1, partial: 1, none: 0 },
      },
    }));

    const mandatory = screen.getByText('Mandatory Skills Coverage').closest('div')!.parentElement!;
    expect(mandatory.textContent).toMatch(/1\.5\s*credit earned of 2 skills/);
    expect(mandatory.textContent).toMatch(/52\.5 pts/);
    // A flat 0.5 was the weakest partial the old rubric could express, so that is what it
    // is shown as — inventing a higher grade for it would inflate a historic screening.
    expect(screen.getByText('Partial · 0.5')).toBeTruthy();
    expect(mandatory.textContent).toMatch(/Partial credit: 1 at 0\.5/);
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
    // Named by the GRADE it was cut from, not the tier. A claimed Partial cut to 0.5 keeps
    // its tier, so "Downgraded from Partial" beside a row labelled Partial reads as a fault.
    expect(screen.getByText(/Downgraded from Strong: evidence is a bare skills list/i)).toBeTruthy();
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

  // The reported contradiction: the summary said "strong experience with Cypress" while the
  // Cypress row below it read "Not found in resume". The rows are the authority because the
  // score is computed from them, so the prose is what gets flagged.
  it('flags a summary sentence that claims a skill scored as not evidenced', async () => {
    await renderPage(baseDetail({
      ...TIERED,
      screeningSummary: 'The candidate has strong experience with Cypress and TypeScript. '
        + 'However, they lack Kubernetes exposure.',
      summaryContradictions: [{
        skill: 'Cypress',
        sentence: 'The candidate has strong experience with Cypress and TypeScript.',
      }],
    }));

    expect(screen.getByText('Summary conflicts with the evidence')).toBeTruthy();
    expect(screen.getByText(/Trust the skill rows/i)).toBeTruthy();
    // The specific sentence is quoted, so the reader knows which clause is unsupported
    // rather than being told the whole summary is suspect.
    expect(screen.getByText(/"The candidate has strong experience with Cypress and TypeScript."/)).toBeTruthy();
  });

  it('does not warn when the summary agrees with the tiers', async () => {
    await renderPage(baseDetail(TIERED));   // no summaryContradictions
    expect(screen.queryByText('Summary conflicts with the evidence')).toBeNull();
  });

  it('leads with a coverage line derived from the tiers', async () => {
    await renderPage(baseDetail({
      ...TIERED,
      coverageSummary: 'Mandatory: 1 strong, 1 partial (1 at 0.75), 1 not evidenced (of 3). Good-to-have: 1 strong, 0 partial, 0 not evidenced (of 1).',
    }));
    // Counts match the TIERED fixture's rows exactly — that is the point of deriving it.
    expect(screen.getByText(/Mandatory: 1 strong, 1 partial \(1 at 0.75\), 1 not evidenced \(of 3\)/)).toBeTruthy();
  });

  // A promotion means the model returned a FALSE NEGATIVE — it reported the skill absent
  // and the resume names it verbatim. Shown distinctly from a downgrade: nothing was taken
  // away from the candidate here.
  it('explains a row corrected upward from the model\'s "not found"', async () => {
    await renderPage(baseDetail({
      ...TIERED,
      mandatorySkillsMatch: [{
        skill: 'Playwright or Cypress', tier: 'PARTIAL', grade: 'PARTIAL_MID', matched: true, credit: 0.75, source: 'jd',
        evidence: 'QA Automation Engineer | Cypress • TypeScript • JavaScript | SDET',
        audit: {
          claimed_tier: 'NONE', claimed_grade: 'NONE', demoted: false, promoted: true,
          demotion_reasons: ['the model reported this skill as absent, but "Cypress" appears verbatim in the resume — raised to PARTIAL on the resume text'],
          grade_reason: 'the resume names the skill, so the model\'s "not found" was overruled',
          grounding_ratio: 1, skill_named_in_resume: true, has_context_markers: false,
          looks_like_skills_list: false,
        },
      }],
    }));

    expect(screen.getByText(/Corrected upward: the model reported this skill as absent/i)).toBeTruthy();
    // Must not read as a downgrade — the correction went the other way.
    expect(screen.queryByText(/Downgraded from NONE/i)).toBeNull();
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
    // The delta is the answer to the drift complaint: 67 now vs 85 before. The stored
    // formula is left on the old 70/30 weights on purpose — that is what the run used, and
    // rewriting history to the current rubric would hide the reason the numbers differ.
    expect(screen.getByText('-18 vs current')).toBeTruthy();
  });
});
