import { describe, it, expect } from 'vitest';
import { buildReportHTML, buildReportFileName } from '../reportGenerator';
import type { PipelineDetail } from '@/lib/api/pipeline.api';

/**
 * The report is the artefact that leaves the tool, so these tests assert on the HTML
 * rather than on the download plumbing. Every case below is something the previous
 * generator dropped silently — a blank section in a PDF looks like "nothing to report",
 * not like a bug, so none of these regressions were visible without a test.
 */

const L1_EVAL = {
  score: 8.1,
  score_percent: 81,
  score_category: 'Good',
  panel_name: 'Ananya Rao',
  evaluated_at: '2026-03-18T09:30:00.000Z',
  categories: {
    'Mandatory Skill Coverage': 1.8,
    'Technical Depth': 1.5,
    'Resume Initial Screening': 2.0,
    'Scenario / Risk Evaluation': 1.3,
    'Framework Knowledge': 1.0,
    'Hands-on Validation': 0,
  },
  dimension_summaries: {
    'Technical Depth': 'Probed Selenium waits but stopped at surface level.',
  },
  evidence: {
    'Mandatory Skill Coverage': ['Can you walk me through your Selenium grid setup?'],
    'Technical Depth': ['How do you handle flaky waits?'],
  },
  panel_summary:
    'Overall Effectiveness: The panel covered the mandatory stack well.\n' +
    'Panel Member Behavior: Courteous and gave the candidate room to think.\n' +
    'Identified Gaps: No hands-on coding was requested.',
  recommendations: [
    'Ask for a live coding exercise on API automation.',
    'Probe CI/CD ownership in more depth.',
  ],
  moderation: {
    overall_compliance: 'warning',
    summary: 'One borderline question about family plans.',
    flags: {
      age: { detected: false, evidence: [], severity: 'none' },
      marital_status: { detected: true, evidence: ['Are you planning to settle down soon?'], severity: 'medium' },
      religion: { detected: false, evidence: [], severity: 'none' },
      gender: { detected: false, evidence: [], severity: 'none' },
      race_ethnicity: { detected: false, evidence: [], severity: 'none' },
      disability: { detected: false, evidence: [], severity: 'none' },
      language_region: { detected: false, evidence: [], severity: 'none' },
    },
  },
};

const L2_EVAL = {
  score: 6.4,
  score_category: 'Moderate',
  panel_name: 'Vikram Iyer',
  evaluated_at: '2026-03-22T14:00:00.000Z',
  candidate_status: 'Rejected',
  categories: {
    'Mandatory Skill Coverage': 1.2,
    'Technical Depth': 1.0,
    'Resume Screening & Handoff': 1.5,
    'Scenario / Risk Evaluation': 0.8,
    'Framework Knowledge': 0.5,
    'Hands-on Validation': 0.9,
    'Leadership Evaluation': 0,
    'Behavioral Assessment': 0.5,
  },
  evidence: {},
  panel_summary: 'Overall Effectiveness: Adequate but rushed.',
  recommendations: ['Allocate more time to the architecture round.'],
  moderation: {
    overall_compliance: 'pass',
    summary: 'No issues detected.',
    flags: {
      age: { detected: false, evidence: [], severity: 'none' },
      marital_status: { detected: false, evidence: [], severity: 'none' },
      religion: { detected: false, evidence: [], severity: 'none' },
      gender: { detected: false, evidence: [], severity: 'none' },
      race_ethnicity: { detected: false, evidence: [], severity: 'none' },
      disability: { detected: false, evidence: [], severity: 'none' },
      language_region: { detected: false, evidence: [], severity: 'none' },
    },
  },
};

function detail(overrides: Partial<PipelineDetail> = {}): PipelineDetail {
  return {
    _id: 'rec1',
    jobId: 'JD-2291',
    candidateName: 'Priya Menon',
    // The record's top-level panelName is whoever submitted LAST. Set here to the L2
    // interviewer on purpose, so a report that falls back to it mislabels the L1 section.
    panelName: 'Vikram Iyer',
    panelEmail: 'vikram@example.com',
    panelId: 'P-9',
    completedStages: ['stage1', 'stage2', 'stage3'],
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-22T14:00:00.000Z',
    stage1: {
      completed: true,
      completedAt: '2026-03-12T08:00:00.000Z',
      jdText: 'jd',
      resumeText: 'resume',
      analysis: {
        mandatorySkills: ['Selenium', 'Java'],
        goodToHaveSkills: ['Cypress'],
        keySkills: [],
        mandatorySkillsMatch: [
          { skill: 'Selenium', tier: 'STRONG', matched: true, credit: 1, evidence: '4 years automating regression suites', source: 'jd' },
          { skill: 'Java', tier: 'PARTIAL', matched: true, credit: 0.5, evidence: 'Listed in skills, no project context', source: 'jd' },
        ],
        additionalSkillsMatch: [
          { skill: 'Cypress', tier: 'NONE', matched: false, credit: 0, evidence: 'Not found in resume', source: 'jd' },
        ],
        screeningSummary: 'Solid automation background.',
        matchScore: 75,
        experienceMatch: '6 years against a 5+ requirement.',
        status: 'Eligible',
        coverageSummary: '1 Strong, 1 Partial of 2 mandatory.',
        scoreBreakdown: {
          mandatory: { count: 2, credit_earned: 1.5, weight: 70, strong: 1, partial: 1, none: 0 },
          goodToHave: { count: 1, credit_earned: 0, weight: 30, strong: 0, partial: 0, none: 1 },
          formula: 'mandatory 1.50/2 x 70 + good-to-have 0.00/1 x 30 = 52.5%',
          weights_redistributed: false,
        },
      },
    },
    stage2: { completed: true, completedAt: '2026-03-18T09:30:00.000Z', l1Transcript: 't', evaluation: L1_EVAL },
    stage3: { completed: true, completedAt: '2026-03-22T14:00:00.000Z', l2Transcript: 't', candidateStatus: 'Rejected', evaluation: L2_EVAL },
    ...overrides,
  } as PipelineDetail;
}

const AT = new Date('2026-08-12T10:15:00.000Z');

describe('report filename', () => {
  it('is JDID-CandidateName-Date', () => {
    expect(buildReportFileName(detail(), 'overall', AT)).toBe('JD-2291-Priya_Menon-2026-08-12');
  });

  it('strips characters Windows will not accept in a filename', () => {
    // A JD id like "REQ/2291:QA" produced a download the browser silently refused.
    const name = buildReportFileName(detail({ jobId: 'REQ/2291:QA', candidateName: 'A. B?' }), 'overall', AT);
    expect(name).toBe('REQ2291QA-A._B-2026-08-12');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('keeps the same stem for a single-stage download so a candidate groups together', () => {
    expect(buildReportFileName(detail(), 'stage2', AT)).toBe('JD-2291-Priya_Menon-2026-08-12-L1-Panel');
  });
});

describe('stage 1 screening block', () => {
  const html = buildReportHTML(detail(), 'overall', AT);

  it('shows the screening status, match score and experience alignment', () => {
    expect(html).toContain('Eligible');
    expect(html).toContain('75%');
    expect(html).toContain('6 years against a 5+ requirement.');
  });

  it('separates Strong from Partial coverage instead of one tick for both', () => {
    expect(html).toContain('Mandatory Skills Coverage');
    expect(html).toContain('Good-to-Have Skills Coverage');
    expect(html).toContain('Listed in skills, no project context');
    // A census, so the reader need not tally rows by eye.
    expect(html).toContain('1 Strong');
    expect(html).toContain('1 Partial');
  });

  it('renders an uncalculable match score as such, not as 0%', () => {
    const d = detail();
    (d.stage1!.analysis as any).matchScore = null;
    expect(buildReportHTML(d, 'stage1', AT)).toContain('Not calculable');
  });

  it('does not print how the match score was calculated', () => {
    // The derivation is on screen for anyone auditing a number. In the document it read
    // as the report explaining its own machinery to a reader who wanted the verdict.
    expect(html).not.toContain('mandatory 1.50/2 x 70');
    expect(html).not.toContain('Each skill scores Strong 1.0');
    // The table weights stay — they label which coverage list carries more of the score.
    expect(html).toContain('70% of the match score');
  });

  it('does not print the tier-correction notes beside the resume evidence', () => {
    const d = detail();
    (d.stage1!.analysis as any).mandatorySkillsMatch[1].audit = {
      demoted: true, claimed_tier: 'STRONG',
      demotion_reasons: ['no duration, project, action or outcome accompanies the mention'],
    };
    (d.stage1!.analysis as any).additionalSkillsMatch[0].audit = {
      promoted: true, claimed_tier: 'NONE',
      demotion_reasons: ['"Cypress" appears verbatim in the resume'],
    };
    const withAudit = buildReportHTML(d, 'stage1', AT);
    expect(withAudit).not.toContain('Downgraded from');
    expect(withAudit).not.toContain('Corrected upward');
    // The resume evidence itself is untouched.
    expect(withAudit).toContain('Listed in skills, no project context');
  });
});

describe('per-panel sections', () => {
  const html = buildReportHTML(detail(), 'overall', AT);

  it('labels each round with the panel who ran it, not the last one to submit', () => {
    expect(html).toContain('L1 Interview Panel');
    expect(html).toContain('L2 Interview Panel');
    expect(html).toContain('Ananya Rao');
    // Both dates present and attributed to their own round.
    expect(html).toMatch(/Ananya Rao[\s\S]{0,120}18 Mar 2026/);
    expect(html).toMatch(/Vikram Iyer[\s\S]{0,400}22 Mar 2026/);
  });

  it('states panel identity per round only, never once for the whole document', () => {
    // The header used to carry a "Panel Email" chip and a "Panels Evaluated" roster.
    // Both made a document-wide claim about people who each ran one round — the email is
    // whoever submitted last — so a reader took the name at the top as "the panel" for
    // every section below it.
    expect(html).not.toContain('Panels Evaluated');
    expect(html).not.toContain('Panel Email');
    expect(html).not.toContain('vikram@example.com');
    // Each round still names its own panel, which is where it belongs.
    expect(html).toMatch(/L1 Interview Panel[\s\S]{0,300}Ananya Rao/);
    expect(html).toMatch(/L2 Interview Panel[\s\S]{0,300}Vikram Iyer/);
  });

  it('does not attribute a hiring outcome to the L1 round, which has none', () => {
    const l1Only = buildReportHTML(detail(), 'stage2', AT);
    expect(l1Only).not.toContain('Candidate Status');
    expect(buildReportHTML(detail(), 'stage3', AT)).toContain('Candidate Status');
  });
});

describe('scoring breakdown', () => {
  it('scores each dimension against its own maximum, not out of 10', () => {
    const html = buildReportHTML(detail(), 'stage2', AT);
    expect(html).toContain('1.80');
    expect(html).toContain('/ 2.00');
    // 1.8/2.0 is 90% full; dividing by 10 drew it as an 18% bar.
    expect(html).toContain('width:90%');
  });

  it('includes every dimension of the rubric, including the ones that scored zero', () => {
    const html = buildReportHTML(detail(), 'stage3', AT);
    // Escaped as it appears in the document — the ampersand in "Resume Screening &
    // Handoff" is entity-encoded, which is correct output, not a missing dimension.
    for (const dim of ['Mandatory Skill Coverage', 'Technical Depth', 'Resume Screening &amp; Handoff',
      'Scenario / Risk Evaluation', 'Framework Knowledge', 'Hands-on Validation',
      'Leadership Evaluation', 'Behavioral Assessment']) {
      expect(html).toContain(dim);
    }
    // Leadership scored 0 and must still be present as a row with its own maximum.
    expect(html).toMatch(/Leadership Evaluation[\s\S]{0,300}0\.00[\s\S]{0,80}\/ 0\.50/);
  });

  it('says no evidence was recorded rather than leaving the cell blank', () => {
    // A dimension scored 0 with no quotes means the panel never probed it — an empty
    // cell reads as a rendering gap instead of as the finding it is.
    expect(buildReportHTML(detail(), 'stage2', AT)).toContain('No evidence recorded');
  });

  it('keeps a dimension stored under an older rubric rather than dropping it', () => {
    const d = detail();
    (d.stage2!.evaluation as any).categories['Rejection Validation Alignment'] = 1.4;
    expect(buildReportHTML(d, 'stage2', AT)).toContain('Rejection Validation Alignment');
  });

  it('quotes the panel evidence under its dimension', () => {
    const html = buildReportHTML(detail(), 'stage2', AT);
    expect(html).toContain('Can you walk me through your Selenium grid setup?');
    expect(html).toContain('Probed Selenium waits but stopped at surface level.');
  });

  it('prints a repeated question once', () => {
    // Records scored before the backend collapsed repeats carry one question listed up
    // to eight times — the scoring prompt allows 8 items and the model padded thin
    // dimensions to fill it. Printed verbatim it buried the dimension summary under a
    // wall of the same sentence (SAAS_QA/Dharshini, every L1 dimension).
    const d = detail();
    const q = 'So what is the framework you are using? TestNG or Cucumber?';
    (d.stage2!.evaluation as any).evidence['Framework Knowledge'] = [
      q, q, `  ${q}  `, q.toUpperCase(), 'And how do you run them in parallel?',
    ];
    const html = buildReportHTML(d, 'stage2', AT);
    const occurrences = html.split('TestNG or Cucumber').length - 1;
    expect(occurrences).toBe(1);
    // A genuinely different question is still its own item.
    expect(html).toContain('And how do you run them in parallel?');
  });
});

describe('panel summary and recommendations', () => {
  const html = buildReportHTML(detail(), 'stage2', AT);

  it('reproduces the summary the user read on screen', () => {
    // Previously read evaluation.panelSummary — a key the backend never writes — so this
    // whole block rendered empty in every downloaded report.
    expect(html).toContain('The panel covered the mandatory stack well.');
    expect(html).toContain('Courteous and gave the candidate room to think.');
    expect(html).toContain('No hands-on coding was requested.');
    expect(html).toContain('Overall Effectiveness:');
    expect(html).toContain('Identified Gaps:');
  });

  it('falls back to overall_verdict when panel_summary is absent', () => {
    const d = detail();
    delete (d.stage2!.evaluation as any).panel_summary;
    (d.stage2!.evaluation as any).overall_verdict = 'Panel was thorough on the core stack.';
    expect(buildReportHTML(d, 'stage2', AT)).toContain('Panel was thorough on the core stack.');
  });

  it('numbers the improvement recommendations', () => {
    expect(html).toContain('Improvement Recommendations');
    expect(html).toContain('Ask for a live coding exercise on API automation.');
    expect(html).toContain('Probe CI/CD ownership in more depth.');
  });
});

describe('moderation', () => {
  it('stamps the compliance verdict and then details every reported category', () => {
    const html = buildReportHTML(detail(), 'stage2', AT);
    expect(html).toContain('WARNING');
    expect(html).toContain('Warning — Some Borderline Questions Found');
    expect(html).toContain('One borderline question about family plans.');
    expect(html).toContain('Marital Status');
    expect(html).toContain('Are you planning to settle down soon?');
    expect(html).toContain('✓ CLEAR');
    // The stamp precedes the detail, so a FAIL cannot be missed by a skim.
    expect(html.indexOf('Interview Moderation')).toBeLessThan(html.indexOf('Are you planning'));
  });

  it('stamps a passing transcript as PASS', () => {
    const html = buildReportHTML(detail(), 'stage3', AT);
    expect(html).toContain('PASS');
    expect(html).toContain('All Clear — No Issues Detected');
  });

  it('reads moderation stored beside the evaluation as well as inside it', () => {
    const d = detail();
    delete (d.stage3!.evaluation as any).moderation;
    (d.stage3 as any).moderation = { overall_compliance: 'fail', summary: 'Age question asked.', flags: {} };
    const html = buildReportHTML(d, 'stage3', AT);
    expect(html).toContain('FAIL');
    expect(html).toContain('Fail — Discriminatory Questions Detected');
  });

  it('says moderation was unavailable rather than implying a clean pass', () => {
    const d = detail();
    delete (d.stage2!.evaluation as any).moderation;
    const html = buildReportHTML(d, 'stage2', AT);
    expect(html).toContain('Moderation analysis was not available');
    expect(html).not.toContain('All Clear');
  });
});

describe('report assembly', () => {
  it('omits stages that were never run', () => {
    const d = detail({ stage2: undefined, stage3: undefined, completedStages: ['stage1'] });
    const html = buildReportHTML(d, 'overall', AT);
    expect(html).toContain('Screening Result');
    expect(html).not.toContain('L1 Interview Panel');
  });

  it('escapes candidate-supplied text so it cannot break out of the document', () => {
    const d = detail({ candidateName: '<script>alert(1)</script>' });
    const html = buildReportHTML(d, 'overall', AT);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders every stage the download buttons can ask for', () => {
    // CandidateResultsPage has one button per stage plus an overall one. A stageId that
    // throws or renders blank is a dead button, and only the overall path was covered.
    const d = detail({
      completedStages: ['stage1', 'stage2', 'stage3', 'stage4'],
      stage4: {
        completed: true,
        completedAt: '2026-03-25T10:00:00.000Z',
        feedbackText: 'client feedback',
        analysis: {
          leakageVerdict: 'L1 Leakage',
          overallAuditSummary: 'L1 missed the automation gap.',
          screeningAudit: { verdict: 'Missed Gaps', summary: 'Screening over-credited Java.', gaps: ['Java depth unverified'] },
          l1Audit: { probingLevel: 'Weak', probingLevelScore: 4, summary: 'Shallow probing.', strengths: [], gaps: ['No coding task'], panelSummaryAccuracy: 'Partially Accurate', panelSummaryNote: '' },
          l2Audit: { probingLevel: 'Good', probingLevelScore: 7, summary: 'Reasonable coverage.', strengths: ['Architecture probed'], gaps: [], panelSummaryAccuracy: 'Accurate', panelSummaryNote: '' },
          rejectionReasonValidity: 'Valid',
          rejectionReasonAnalysis: 'Rejection is supported by the L2 transcript.',
          crossArtifactEvidence: [],
          recommendations: { screening: 'Verify depth claims.', l1Panel: 'Add a coding task.', l2Panel: 'Keep current depth.', process: 'Tighten handoff notes.' },
        },
      },
    } as Partial<PipelineDetail>);

    for (const stageId of ['stage1', 'stage2', 'stage3', 'stage4', 'overall'] as const) {
      const html = buildReportHTML(d, stageId, AT);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('JD-2291');
      expect(html).not.toContain('No screening data available');
      expect(html).not.toContain('No client audit data available');
    }

    expect(buildReportHTML(d, 'stage4', AT)).toContain('L1 Leakage');
    expect(buildReportHTML(d, 'stage4', AT)).toContain('Rejection is supported by the L2 transcript.');
    // The overall report must carry the audit too, not just the standalone stage download.
    expect(buildReportHTML(d, 'overall', AT)).toContain('L1 missed the automation gap.');
  });

  it('carries the job id and candidate in the header', () => {
    const html = buildReportHTML(detail(), 'overall', AT);
    expect(html).toContain('JD-2291');
    expect(html).toContain('Priya Menon');
  });
});
