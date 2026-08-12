import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PipelineDetail, SkillMatchRow, SkillTier } from '@/lib/api/pipeline.api';

export type ReportStageId = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'overall';

interface ReportGeneratorOptions {
  data: PipelineDetail;
  stageId?: ReportStageId;
  format: 'html' | 'pdf';
}

function esc(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'Not recorded';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return 'Not recorded';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Score bands, identical to the on-screen thresholds in L1ResultsView / L2ResultsView. */
function scoreCategoryOf(score: number): string {
  return score >= 8 ? 'Good' : score >= 5 ? 'Moderate' : 'Poor';
}

function scoreColour(score: number, max = 10): string {
  const ratio = max > 0 ? score / max : 0;
  return ratio >= 0.8 ? '#059669' : ratio >= 0.5 ? '#d97706' : '#dc2626';
}

// ============================================
// STAGE 1: SCREENING REPORT
// ============================================

/**
 * Tier presentation for the printed report.
 *
 * A downloaded report is the artefact that leaves the tool and gets forwarded to people
 * who cannot ask the UI a follow-up question, so it must not flatten Strong and Partial
 * into one tick — that ambiguity is precisely what made the on-screen coverage look
 * inconsistent to the reader.
 */
const REPORT_TIER: Record<SkillTier, { glyph: string; color: string; label: string }> = {
  STRONG:  { glyph: '✓', color: '#059669', label: 'Strong' },
  PARTIAL: { glyph: '◐', color: '#d97706', label: 'Partial' },
  NONE:    { glyph: '✗', color: '#dc2626', label: 'Not found' },
};

/** Pre-tier records carry only `matched`; they were never graded, so no PARTIAL. */
function reportTierOf(row: Pick<SkillMatchRow, 'tier' | 'matched'>): SkillTier {
  if (row.tier === 'STRONG' || row.tier === 'PARTIAL' || row.tier === 'NONE') return row.tier;
  return row.matched ? 'STRONG' : 'NONE';
}

function skillRowsHTML(rows: SkillMatchRow[]): string {
  return (rows || []).map(item => {
    const t = REPORT_TIER[reportTierOf(item)];
    const inferred = item.source === 'ai-suggested'
      ? ' <span style="font-size:9px;color:#7c3aed;font-weight:700;">(AI-INFERRED)</span>'
      : '';
    // The demotion reason is carried into the report for the same reason it is on screen:
    // it answers "the resume mentions this — why is it only Partial?" without which the
    // grade reads as arbitrary.
    const demotion = item.audit?.demoted
      ? `<div style="font-size:10px;color:#b45309;margin-top:3px;">Downgraded from ${esc(item.audit.claimed_tier)}: ${esc(item.audit.demotion_reasons.join('; '))}</div>`
      : '';
    // The opposite correction: the model reported the skill absent, the resume names it.
    // Recorded because the reader is otherwise looking at a Partial the model called None.
    const promotion = item.audit?.promoted
      ? `<div style="font-size:10px;color:#047857;margin-top:3px;">Corrected upward: ${esc(item.audit.demotion_reasons.join('; '))}</div>`
      : '';
    return `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${t.color};color:white;text-align:center;line-height:18px;font-size:11px;font-weight:bold;">${t.glyph}</span>
        <span style="font-size:10px;color:${t.color};font-weight:700;margin-left:4px;">${t.label}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;">${esc(item.skill)}${inferred}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:11px;">${esc(item.evidence)}${demotion}${promotion}</td>
    </tr>
  `;
  }).join('');
}

/**
 * The tier census the UI prints beside each coverage list.
 *
 * "Mandatory skills coverage visible as it is in the UI" means the counts too — a reader
 * should not have to tally 14 rows by eye to learn that 3 of them are only Partial.
 */
function tierCensusHTML(rows: SkillMatchRow[]): string {
  if (!rows?.length) return '';
  const counts: Record<SkillTier, number> = { STRONG: 0, PARTIAL: 0, NONE: 0 };
  for (const r of rows) counts[reportTierOf(r)]++;
  const parts = (Object.keys(REPORT_TIER) as SkillTier[]).map(t =>
    `<span style="color:${counts[t] ? REPORT_TIER[t].color : '#9ca3af'};font-weight:700;">${counts[t]} ${REPORT_TIER[t].label}</span>`
  );
  return `<span style="font-size:10px;">${parts.join('<span style="color:#d1d5db;"> · </span>')}</span>`;
}

function skillTableHTML(title: string, rows: SkillMatchRow[], weight: number | null, emptyNote: string): string {
  return `
      <div class="pdf-block" style="margin-bottom:24px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px;">
          <h3 style="font-size:12px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">
            ${esc(title)}${weight != null ? ` <span style="font-weight:500;color:#6b7280;text-transform:none;letter-spacing:0;">— ${weight}% of the match score</span>` : ''}
          </h3>
          ${tierCensusHTML(rows)}
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;background:white;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;width:100px;">Coverage</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Skill</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${skillRowsHTML(rows) || `<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">${esc(emptyNote)}</td></tr>`}
          </tbody>
        </table>
      </div>`;
}

function generateStage1HTML(data: PipelineDetail): string {
  const analysis = data.stage1?.analysis;
  if (!analysis) return '<p style="color:#9ca3af;">No screening data available.</p>';

  const statusColor =
    analysis.status === 'Eligible' ? '#059669' :
    analysis.status === 'Partially Eligible' ? '#d97706' :
    // Not Screenable is not a verdict on the candidate — nothing was assessed.
    analysis.status === 'Not Screenable' ? '#64748b' : '#dc2626';

  const prov = analysis.skillsProvenance;
  const provenanceBanner = prov?.notice ? `
      <div class="pdf-block" style="background:${prov.mandatoryInferred ? '#f5f3ff' : '#fffbeb'};border-left:3px solid ${prov.mandatoryInferred ? '#7c3aed' : '#d97706'};padding:12px 14px;margin-bottom:16px;border-radius:4px;">
        <p style="font-size:11px;font-weight:700;color:${prov.mandatoryInferred ? '#6d28d9' : '#b45309'};margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">
          ${prov.mandatoryInferred ? 'AI-inferred — not stated in JD' : 'No screening criteria'}
        </p>
        <p style="font-size:11px;color:#4b5563;margin:0;line-height:1.5;">${esc(prov.notice)}</p>
      </div>` : '';

  const missing = [
    ...(analysis.reconciliation?.mandatoryMissing || []),
    ...(analysis.reconciliation?.goodToHaveMissing || []),
  ];
  const unexaminedBanner = missing.length ? `
      <div class="pdf-block" style="background:#fffbeb;border-left:3px solid #d97706;padding:12px 14px;margin-bottom:16px;border-radius:4px;">
        <p style="font-size:11px;font-weight:700;color:#b45309;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Unexamined skills</p>
        <p style="font-size:11px;color:#4b5563;margin:0;line-height:1.5;">
          The screening model did not report on ${esc(missing.join(', '))}. These are scored as
          Not found, but should be read as unverified rather than as confirmed gaps.
        </p>
      </div>` : '';

  // Travels with the document. The summary is model prose written alongside the tiers and
  // can assert a skill the same run scored NONE; a downloaded report that shows the claim
  // without the conflict is worse than the screen, since the reader cannot cross-check it.
  const conflicts = analysis.summaryContradictions || [];
  const contradictionBanner = conflicts.length ? `
        <div style="background:#fffbeb;border-left:3px solid #d97706;padding:12px 14px;margin-top:8px;border-radius:4px;">
          <p style="font-size:11px;font-weight:700;color:#b45309;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Summary conflicts with the evidence</p>
          <p style="font-size:11px;color:#4b5563;margin:0 0 6px;line-height:1.5;">
            The summary above claims ${conflicts.length === 1 ? 'a skill' : 'skills'} that the skill
            tables below found no resume evidence for. The score is computed from the tables, not
            from this text.
          </p>
          <ul style="margin:0;padding-left:16px;">
            ${conflicts.map(c => `<li style="font-size:11px;color:#4b5563;line-height:1.5;"><strong>${esc(c.skill)}</strong> — scored as not evidenced, yet the summary says: <em>"${esc(c.sentence)}"</em></li>`).join('')}
          </ul>
        </div>` : '';

  const b = analysis.scoreBreakdown;

  return `
    <div class="stage-section">
      ${sectionHeadingHTML('Screening Result', '#7c3aed', data.stage1?.completedAt
        ? `Screened ${formatDateTime(analysis.screenedAt || data.stage1.completedAt)}`
        : '')}

      ${provenanceBanner}
      ${unexaminedBanner}

      <div class="pdf-block" style="border:1px solid #e5e7eb;border-left:3px solid ${statusColor};background:#f8fafc;padding:16px;margin-bottom:20px;border-radius:4px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;padding:0 16px 0 0;width:40%;">
              <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Screening Status</p>
              <span style="display:inline-block;padding:4px 12px;background:${statusColor};color:white;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:99px;">${esc(analysis.status)}</span>
            </td>
            <td style="vertical-align:top;padding:0;width:60%;">
              <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Match Score</p>
              <span style="font-size:20px;font-weight:800;color:${analysis.matchScore == null ? '#64748b' : statusColor};">
                ${analysis.matchScore == null ? 'Not calculable' : `${analysis.matchScore}%`}
              </span>
            </td>
          </tr>
        </table>
        ${b?.formula ? `
        <p style="font-size:10px;color:#6b7280;margin:12px 0 8px;font-family:monospace;">
          ${esc(b.formula)}
        </p>
        <p style="font-size:10px;color:#6b7280;margin:0 0 8px;line-height:1.5;">
          Each skill scores Strong 1.0, Partial 0.5 or Not found 0. The percentage is calculated
          from the tiers in the tables below — it is not a separate judgement, so it can be checked
          by hand.
        </p>` : ''}
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
          <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Experience Alignment</p>
          <p style="font-size:11px;color:#111827;margin:0;line-height:1.6;">${esc(analysis.experienceMatch)}</p>
        </div>
      </div>

      <div class="pdf-block" style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Screening Summary</h3>
        ${analysis.coverageSummary ? `
        <p style="font-size:11px;color:#111827;line-height:1.6;background:#f8fafc;padding:10px 12px;border:1px solid #e5e7eb;border-radius:4px;font-weight:600;margin:0 0 8px;">
          ${esc(analysis.coverageSummary)}
        </p>` : ''}
        <p style="font-size:11px;color:#374151;line-height:1.6;background:white;padding:12px;border:1px solid #e5e7eb;border-radius:4px;font-style:italic;">
          "${esc(analysis.screeningSummary)}"
        </p>
        ${contradictionBanner}
      </div>

      ${skillTableHTML('Mandatory Skills Coverage', analysis.mandatorySkillsMatch,
        b?.mandatory.weight ?? null, 'No mandatory skills were identified for this role')}

      ${skillTableHTML('Good-to-Have Skills Coverage', analysis.additionalSkillsMatch,
        b?.goodToHave.weight ?? null, prov?.goodToHaveNotice || 'The JD labels no skills as good-to-have.')}
    </div>
  `;
}

// ============================================
// PANEL EVALUATIONS (STAGE 2 / STAGE 3)
// ============================================

interface ReportDimension { name: string; max: number }

/**
 * The dimension lists, mirroring L1ResultsView and L2ResultsView.
 *
 * They are spelled out rather than derived from `evaluation.categories` because the screen
 * renders every dimension of the rubric — including the ones that scored 0 — and a report
 * built by iterating the stored keys would quietly drop exactly those, turning "the panel
 * never probed leadership" into "leadership was not part of the assessment". The maxima
 * matter for the same reason: the previous report divided every dimension by 10, so a
 * perfect 2.0/2.0 was drawn as a 20% bar.
 */
const L1_REPORT_DIMENSIONS: ReportDimension[] = [
  { name: 'Mandatory Skill Coverage',   max: 2.0 },
  { name: 'Technical Depth',            max: 2.0 },
  { name: 'Resume Initial Screening',   max: 2.0 },
  { name: 'Scenario / Risk Evaluation', max: 2.0 },
  { name: 'Framework Knowledge',        max: 1.0 },
  { name: 'Hands-on Validation',        max: 1.0 },
];

const L2_REPORT_DIMENSIONS: ReportDimension[] = [
  { name: 'Mandatory Skill Coverage',    max: 2.0 },
  { name: 'Technical Depth',             max: 2.0 },
  { name: 'Resume Screening & Handoff',  max: 2.0 },
  { name: 'Scenario / Risk Evaluation',  max: 1.0 },
  { name: 'Framework Knowledge',         max: 1.0 },
  { name: 'Hands-on Validation',         max: 1.0 },
  { name: 'Leadership Evaluation',       max: 0.5 },
  { name: 'Behavioral Assessment',       max: 0.5 },
];

interface PanelStageConfig {
  id: 'stage2' | 'stage3';
  /** e.g. "L1 Interview Panel" — the round, so two panels are never confused for one. */
  roundLabel: string;
  accent: string;
  dimensions: ReportDimension[];
}

const PANEL_STAGES: PanelStageConfig[] = [
  { id: 'stage2', roundLabel: 'L1 Interview Panel', accent: '#f97316', dimensions: L1_REPORT_DIMENSIONS },
  { id: 'stage3', roundLabel: 'L2 Interview Panel', accent: '#0ea5e9', dimensions: L2_REPORT_DIMENSIONS },
];

function sectionHeadingHTML(title: string, accent: string, subtitle = ''): string {
  return `
      <div class="pdf-block" style="border-bottom:2px solid ${accent};padding-bottom:8px;margin-bottom:16px;">
        <h2 style="color:${accent};font-size:18px;font-weight:700;margin:0;">${esc(title)}</h2>
        ${subtitle ? `<p style="font-size:10px;color:#6b7280;margin:4px 0 0;">${esc(subtitle)}</p>` : ''}
      </div>`;
}

/**
 * The panel summary, verbatim.
 *
 * The text is reproduced exactly as the screen shows it — the only formatting applied is
 * bolding the labels the model itself writes ("Overall Effectiveness:", "Identified Gaps:"),
 * which changes no wording. The previous report read `evaluation.panelSummary`, a key the
 * backend never writes (it stores `panel_summary`), so this block silently rendered nothing
 * at all and the summary the user had just read on screen was absent from the download.
 */
function panelSummaryHTML(text: string, accent: string): string {
  const KNOWN_LABELS = [
    'Overall Effectiveness:',
    'Panel Member Behavior:',
    'Panel Member Behaviour:',
    'Interview Process:',
    'Rejection Reason Validation:',
    'Identified Gaps:',
    'Identification Gaps:',
    'Strengths:',
    'Recommendations:',
  ];

  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<div style="height:6px;"></div>';
    const bullet = /^[-*•]\s+/.test(trimmed);
    const clean = trimmed.replace(/^[-*•]\s+/, '');
    const label = KNOWN_LABELS.find(h => clean.startsWith(h));

    if (label) {
      const rest = clean.slice(label.length).trim();
      return `<p style="font-size:11px;line-height:1.6;margin:6px 0 0;">
        <span style="font-weight:700;color:${accent};">${esc(label)}</span>
        ${rest ? `<span style="color:#374151;"> ${esc(rest)}</span>` : ''}
      </p>`;
    }
    if (bullet) {
      return `<p style="font-size:11px;color:#374151;line-height:1.6;margin:3px 0 0 12px;">• ${esc(clean)}</p>`;
    }
    return `<p style="font-size:11px;color:#374151;line-height:1.6;margin:6px 0 0;">${esc(clean)}</p>`;
  }).join('');
}

/**
 * Dimension breakdown: every dimension of the rubric, its score out of its own maximum,
 * a progress bar, the one-line verdict and the panel's own quoted questions.
 */
function dimensionTableHTML(
  evaluation: any,
  dimensions: ReportDimension[],
  panelName: string,
): string {
  const categories: Record<string, any> = evaluation?.categories || {};
  const summaries: Record<string, string> = evaluation?.dimension_summaries || {};
  const evidence: Record<string, string[]> = evaluation?.evidence || {};

  // Anything the record carries that the current rubric does not name is appended rather
  // than dropped: a score stored under an older rubric still has to appear in the report.
  const extras = Object.keys(categories)
    .filter(k => !dimensions.some(d => d.name === k))
    .map(name => ({ name, max: 0 }));

  const rows = [...dimensions, ...extras].map(dim => {
    const raw = Number(categories[dim.name]);
    const score = Number.isFinite(raw) ? raw : 0;
    const pct = dim.max > 0 ? Math.min(100, (score / dim.max) * 100) : 0;
    const colour = dim.max > 0 ? scoreColour(score, dim.max) : '#6b7280';

    const quotes = Array.isArray(evidence[dim.name]) ? evidence[dim.name] : [];
    const evidenceHTML = quotes.length
      ? quotes.map(q => {
          const quote = String(q ?? '').trim();
          if (!quote) return '';
          // Attributed to the panel member, as in the reference layout — but never twice
          // over, since some transcripts already carry the speaker label in the quote.
          const attributed = panelName && !quote.toLowerCase().startsWith(panelName.toLowerCase())
            ? `${panelName}: ${quote}`
            : quote;
          return `<li style="font-size:10px;color:#4b5563;font-style:italic;margin:2px 0;line-height:1.5;">${esc(attributed)}</li>`;
        }).join('')
      : '<li style="font-size:10px;color:#9ca3af;margin:2px 0;">No evidence recorded</li>';

    const summary = summaries[dim.name]
      ? `<p style="font-size:10px;color:#6b7280;margin:0 0 4px;line-height:1.5;">${esc(summaries[dim.name])}</p>`
      : '';

    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;width:24%;">
          <strong style="font-size:11px;color:#111827;">${esc(dim.name)}</strong>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;width:12%;text-align:center;white-space:nowrap;">
          <span style="font-weight:700;color:${colour};font-size:12px;">${score.toFixed(2)}</span>
          ${dim.max > 0 ? `<span style="color:#9ca3af;font-size:10px;"> / ${dim.max.toFixed(2)}</span>` : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;width:16%;">
          <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:${colour};width:${pct.toFixed(0)}%;height:100%;border-radius:4px;"></div>
          </div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;width:48%;">
          ${summary}
          <ul style="margin:0;padding-left:14px;">${evidenceHTML}</ul>
        </td>
      </tr>`;
  }).join('');

  return `
      <div class="pdf-block" style="margin-bottom:20px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Scoring Breakdown</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;background:white;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Dimension</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;">Score</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Progress</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Panel Evidence</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
}

const MOD_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'age',             label: 'Age' },
  { key: 'marital_status',  label: 'Marital Status' },
  { key: 'religion',        label: 'Religion' },
  { key: 'gender',          label: 'Gender' },
  { key: 'race_ethnicity',  label: 'Race / Ethnicity' },
  { key: 'disability',      label: 'Disability' },
  { key: 'language_region', label: 'Language / Region' },
];

const MOD_STAMP: Record<string, { label: string; headline: string; colour: string; tint: string }> = {
  pass:    { label: 'PASS',    headline: 'All Clear — No Issues Detected',            colour: '#059669', tint: '#ecfdf5' },
  warning: { label: 'WARNING', headline: 'Warning — Some Borderline Questions Found', colour: '#d97706', tint: '#fffbeb' },
  fail:    { label: 'FAIL',    headline: 'Fail — Discriminatory Questions Detected',  colour: '#dc2626', tint: '#fef2f2' },
};

const MOD_SEVERITY_COLOUR: Record<string, string> = {
  high: '#dc2626', medium: '#ea580c', low: '#ca8a04', none: '#059669',
};

/**
 * The compliance stamp and then the full breakdown, in the order the screen shows them:
 * verdict first, so a FAIL cannot be missed by someone skimming, and the per-category
 * flags underneath so the verdict can be traced to the question that caused it.
 */
function moderationHTML(moderation: any, roundLabel: string): string {
  if (!moderation) {
    return `
      <div class="pdf-block" style="border:1px solid #e5e7eb;background:#f9fafb;padding:14px;border-radius:4px;margin-bottom:20px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Interview Moderation</h3>
        <p style="font-size:11px;color:#6b7280;margin:0;">Moderation analysis was not available for this evaluation.</p>
      </div>`;
  }

  const compliance = String(moderation.overall_compliance ?? 'pass').toLowerCase();
  const stamp = MOD_STAMP[compliance] ?? {
    label: compliance.toUpperCase(), headline: 'Moderation Analysis', colour: '#6b7280', tint: '#f9fafb',
  };

  const cards = MOD_CATEGORIES.map(({ key, label }) => {
    const flag = moderation.flags?.[key];
    // Matches the screen: a category the model did not report on is not claimed as clear.
    if (!flag) return '';
    const detected = Boolean(flag.detected);
    const severity = String(flag.severity ?? 'none').toLowerCase();
    const colour = detected ? (MOD_SEVERITY_COLOUR[severity] ?? '#dc2626') : '#059669';
    const quote = detected && Array.isArray(flag.evidence) && flag.evidence.length
      ? `<p style="font-size:9px;color:#6b7280;font-style:italic;margin:4px 0 0;line-height:1.4;">"${esc(flag.evidence[0])}"</p>`
      : '';
    return `
      <td style="width:25%;vertical-align:top;padding:4px;">
        <div style="border:1px solid ${detected ? colour : '#e5e7eb'};background:${detected ? '#fff7ed' : 'white'};border-radius:4px;padding:8px;">
          <div style="display:flex;justify-content:space-between;gap:6px;">
            <span style="font-size:10px;font-weight:700;color:#111827;">${esc(label)}</span>
            <span style="font-size:9px;font-weight:700;color:${colour};text-transform:uppercase;">${detected ? esc(severity) : '✓ CLEAR'}</span>
          </div>
          ${quote}
        </div>
      </td>`;
  }).filter(Boolean);

  // Four to a row, as on screen at full width.
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 4) {
    const cells = cards.slice(i, i + 4);
    while (cells.length < 4) cells.push('<td style="width:25%;"></td>');
    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  return `
      <div class="pdf-block" style="margin-bottom:20px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Interview Moderation</h3>
        <div style="border:1px solid ${stamp.colour};background:${stamp.tint};border-radius:4px;padding:12px 14px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;width:110px;">
                <span style="display:inline-block;padding:6px 16px;background:${stamp.colour};color:white;font-size:14px;font-weight:800;letter-spacing:0.08em;border-radius:4px;">${esc(stamp.label)}</span>
              </td>
              <td style="vertical-align:middle;">
                <p style="font-size:11px;font-weight:700;color:${stamp.colour};margin:0;">${esc(stamp.headline)}</p>
                <p style="font-size:9px;color:#6b7280;margin:2px 0 0;">${esc(roundLabel)} transcript screened for biased, discriminatory or inappropriate questions.</p>
              </td>
            </tr>
          </table>
          ${moderation.summary ? `<p style="font-size:11px;color:#374151;margin:10px 0 0;line-height:1.6;">${esc(moderation.summary)}</p>` : ''}
        </div>
        ${rows.length ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed;">${rows.join('')}</table>` : ''}
      </div>`;
}

function recommendationsHTML(recommendations: any, accent: string): string {
  const list = Array.isArray(recommendations) ? recommendations.filter(Boolean) : [];
  return `
      <div class="pdf-block" style="margin-bottom:20px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Improvement Recommendations</h3>
        <div style="border:1px solid #e5e7eb;background:white;border-radius:4px;padding:12px 14px;">
          ${list.length
            ? `<ol style="margin:0;padding-left:18px;">${list.map((r: any) =>
                `<li style="font-size:11px;color:#374151;line-height:1.6;margin:3px 0;">${esc(String(r))}</li>`).join('')}</ol>`
            : '<p style="font-size:11px;color:#9ca3af;margin:0;">No specific recommendations available.</p>'}
        </div>
      </div>`;
}

/** Panel name and evaluation date for a panel stage, resolved the way the screen does. */
function panelIdentity(data: PipelineDetail, cfg: PanelStageConfig) {
  const stage: any = (data as any)[cfg.id];
  const evaluation = stage?.evaluation;
  // evaluation.panel_name is the panel who ran THIS round. The record's top-level
  // panelName is whichever stage was submitted last, so using it for every section
  // labelled the L1 breakdown with the L2 interviewer's name.
  const panelName = evaluation?.panel_name || data.panelName || 'Not recorded';
  const evaluatedAt = evaluation?.evaluated_at || stage?.completedAt || null;
  return { stage, evaluation, panelName, evaluatedAt };
}

function generatePanelSectionHTML(data: PipelineDetail, cfg: PanelStageConfig): string {
  const { stage, evaluation, panelName, evaluatedAt } = panelIdentity(data, cfg);

  if (!evaluation) {
    return `
    <div class="stage-section">
      ${sectionHeadingHTML(cfg.roundLabel, cfg.accent)}
      <p style="color:#9ca3af;font-size:11px;">No ${esc(cfg.roundLabel)} evaluation data available.</p>
    </div>`;
  }

  const score = Number(evaluation.score) || 0;
  const category = evaluation.score_category || scoreCategoryOf(score);
  const colour = scoreColour(score);
  const scorePercent = evaluation.score_percent != null ? Number(evaluation.score_percent) : null;
  const moderation = evaluation.moderation ?? stage?.moderation ?? null;

  // Only Stage 3 carries the hiring outcome; Stage 2 has none and must not invent one.
  const candidateStatus = cfg.id === 'stage3'
    ? (stage?.candidateStatus || evaluation.candidate_status || null)
    : null;
  const statusColour = candidateStatus === 'Selected' || candidateStatus === 'Select' ? '#059669' : '#dc2626';

  const summaryText = evaluation.panel_summary || evaluation.overall_verdict || 'Panel summary not available.';

  return `
    <div class="stage-section">
      ${sectionHeadingHTML(cfg.roundLabel, cfg.accent, `Panel: ${panelName}  ·  Evaluation date: ${formatDateTime(evaluatedAt)}`)}

      <div class="pdf-block" style="border:1px solid #e5e7eb;border-left:3px solid ${cfg.accent};background:#f8fafc;padding:16px;margin-bottom:20px;border-radius:4px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;width:34%;padding-right:12px;">
              <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Panel Efficiency</p>
              <span style="font-size:30px;font-weight:800;color:${colour};">${score.toFixed(1)}</span>
              <span style="font-size:14px;color:#6b7280;"> / 10.0</span>
              <span style="display:inline-block;margin-left:8px;padding:3px 10px;background:${colour};color:white;font-size:10px;font-weight:700;text-transform:uppercase;border-radius:99px;">${esc(category)}</span>
            </td>
            <td style="vertical-align:top;width:22%;padding-right:12px;">
              <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Panel Name</p>
              <p style="font-size:12px;font-weight:700;color:#111827;margin:0;">${esc(panelName)}</p>
              ${scorePercent != null ? `<p style="font-size:10px;color:#6b7280;margin:6px 0 0;">Match: <strong style="color:${cfg.accent};">${scorePercent}%</strong></p>` : ''}
            </td>
            <td style="vertical-align:top;width:22%;padding-right:12px;">
              <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Evaluation Date</p>
              <p style="font-size:11px;font-weight:600;color:#111827;margin:0;">${esc(formatDateTime(evaluatedAt))}</p>
            </td>
            <td style="vertical-align:top;width:22%;">
              ${candidateStatus ? `
              <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Candidate Status</p>
              <span style="display:inline-block;padding:4px 12px;background:${statusColour};color:white;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:99px;">${esc(candidateStatus)}</span>` : ''}
            </td>
          </tr>
        </table>
      </div>

      ${dimensionTableHTML(evaluation, cfg.dimensions, panelName)}

      <div class="pdf-block" style="margin-bottom:20px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Panel Performance Summary</h3>
        <div style="border:1px solid #e5e7eb;border-left:3px solid ${cfg.accent};background:#f8fafc;border-radius:4px;padding:12px 14px;">
          ${panelSummaryHTML(String(summaryText), cfg.accent)}
        </div>
      </div>

      ${recommendationsHTML(evaluation.recommendations, cfg.accent)}

      ${moderationHTML(moderation, cfg.roundLabel)}
    </div>
  `;
}

// ============================================
// STAGE 4: CLIENT AUDIT REPORT
// ============================================
function generateStage4HTML(data: PipelineDetail): string {
  const stage4 = data.stage4;
  if (!stage4?.analysis) return '<p style="color:#9ca3af;">No client audit data available.</p>';

  const analysis = stage4.analysis;
  const leakageColor =
    analysis.leakageVerdict === 'No Leakage' ? '#059669' :
    analysis.leakageVerdict === 'Unjustified Rejection' ? '#d97706' : '#dc2626';

  const identitySection = stage4.identityConfirmation ? `
    <div class="pdf-block" style="margin-bottom:24px;background:#f0fdf4;border-left:3px solid #10b981;padding:14px;border-radius:4px;">
      <h3 style="font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;margin:0 0 8px;">Identity Confirmation</h3>
      <p style="font-size:11px;color:#065f46;margin:0 0 6px;"><strong>Status:</strong> ${esc(stage4.identityConfirmation.confirmationStatus)}</p>
      <p style="font-size:11px;color:#047857;margin:0;line-height:1.5;">${esc(stage4.identityConfirmation.confirmationNote)}</p>
    </div>
  ` : '';

  const bullets = (items: string[] | undefined, colour: string) =>
    (items || []).map(x => `<li style="font-size:11px;color:${colour};margin:3px 0;line-height:1.5;">• ${esc(x)}</li>`).join('');

  const screeningAuditGaps = bullets(analysis.screeningAudit?.gaps, '#374151');
  const l1AuditStrengths = bullets(analysis.l1Audit?.strengths, '#059669');
  const l1AuditGaps = bullets(analysis.l1Audit?.gaps, '#dc2626');
  const l2AuditStrengths = bullets(analysis.l2Audit?.strengths, '#059669');
  const l2AuditGaps = bullets(analysis.l2Audit?.gaps, '#dc2626');

  const recommendationsSection = analysis.recommendations ? `
    <div class="pdf-block" style="margin-top:24px;">
      <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Recommendations</h3>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <tr>
          <td style="width:50%;vertical-align:top;padding:0 6px 12px 0;">
            <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
              <h4 style="font-size:10px;font-weight:700;color:#7c3aed;margin:0 0 6px;text-transform:uppercase;">Screening</h4>
              <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.screening)}</p>
            </div>
          </td>
          <td style="width:50%;vertical-align:top;padding:0 0 12px 6px;">
            <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
              <h4 style="font-size:10px;font-weight:700;color:#f97316;margin:0 0 6px;text-transform:uppercase;">L1 Panel</h4>
              <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.l1Panel)}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%;vertical-align:top;padding:0 6px 0 0;">
            <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
              <h4 style="font-size:10px;font-weight:700;color:#0ea5e9;margin:0 0 6px;text-transform:uppercase;">L2 Panel</h4>
              <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.l2Panel)}</p>
            </div>
          </td>
          <td style="width:50%;vertical-align:top;padding:0 0 0 6px;">
            <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
              <h4 style="font-size:10px;font-weight:700;color:#10b981;margin:0 0 6px;text-transform:uppercase;">Process</h4>
              <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.process)}</p>
            </div>
          </td>
        </tr>
      </table>
    </div>
  ` : '';

  return `
    <div class="stage-section">
      ${sectionHeadingHTML('Client Audit', '#10b981', stage4.completedAt ? `Audited ${formatDateTime(stage4.completedAt)}` : '')}

      <div class="pdf-block" style="background:#f8fafc;border:1px solid #e5e7eb;border-left:3px solid ${leakageColor};padding:16px;margin-bottom:20px;border-radius:4px;">
        <span style="display:inline-block;padding:4px 12px;background:${leakageColor};color:white;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:99px;margin-bottom:8px;">${esc(analysis.leakageVerdict)}</span>
        <p style="font-size:11px;color:#374151;line-height:1.6;margin:0;">${esc(analysis.overallAuditSummary)}</p>
      </div>

      ${identitySection}

      <div class="pdf-block" style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Screening Audit</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 8px;"><strong style="color:#7c3aed;">Verdict:</strong> ${esc(analysis.screeningAudit?.verdict || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0 0 12px;line-height:1.5;">${esc(analysis.screeningAudit?.summary || '')}</p>
          ${screeningAuditGaps ? `
            <div>
              <p style="font-size:10px;font-weight:700;color:#dc2626;margin:0 0 4px;text-transform:uppercase;">Gaps Identified:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${screeningAuditGaps}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="pdf-block" style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">L1 Audit</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 4px;"><strong style="color:#f97316;">Probing Level:</strong> ${esc(analysis.l1Audit?.probingLevel || 'N/A')} (${analysis.l1Audit?.probingLevelScore ?? 0}/10)</p>
          <p style="font-size:11px;margin:0 0 12px;"><strong style="color:#f97316;">Summary Accuracy:</strong> ${esc(analysis.l1Audit?.panelSummaryAccuracy || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0 0 12px;line-height:1.5;">${esc(analysis.l1Audit?.summary || '')}</p>
          ${l1AuditStrengths ? `
            <div style="margin-bottom:10px;">
              <p style="font-size:10px;font-weight:700;color:#059669;margin:0 0 4px;text-transform:uppercase;">Strengths:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l1AuditStrengths}</ul>
            </div>
          ` : ''}
          ${l1AuditGaps ? `
            <div>
              <p style="font-size:10px;font-weight:700;color:#dc2626;margin:0 0 4px;text-transform:uppercase;">Gaps:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l1AuditGaps}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="pdf-block" style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">L2 Audit</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 4px;"><strong style="color:#0ea5e9;">Probing Level:</strong> ${esc(analysis.l2Audit?.probingLevel || 'N/A')} (${analysis.l2Audit?.probingLevelScore ?? 0}/10)</p>
          <p style="font-size:11px;margin:0 0 12px;"><strong style="color:#0ea5e9;">Summary Accuracy:</strong> ${esc(analysis.l2Audit?.panelSummaryAccuracy || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0 0 12px;line-height:1.5;">${esc(analysis.l2Audit?.summary || '')}</p>
          ${l2AuditStrengths ? `
            <div style="margin-bottom:10px;">
              <p style="font-size:10px;font-weight:700;color:#059669;margin:0 0 4px;text-transform:uppercase;">Strengths:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l2AuditStrengths}</ul>
            </div>
          ` : ''}
          ${l2AuditGaps ? `
            <div>
              <p style="font-size:10px;font-weight:700;color:#dc2626;margin:0 0 4px;text-transform:uppercase;">Gaps:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l2AuditGaps}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="pdf-block" style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Rejection Reason Validity</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 4px;"><strong>Verdict:</strong> ${esc(analysis.rejectionReasonValidity || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0;line-height:1.5;">${esc(analysis.rejectionReasonAnalysis || '')}</p>
        </div>
      </div>

      ${recommendationsSection}
    </div>
  `;
}

// ============================================
// DOCUMENT SHELL
// ============================================

const STAGE_TITLES: Record<Exclude<ReportStageId, 'overall'>, string> = {
  stage1: 'Screening Report',
  stage2: 'L1 Panel Evaluation Report',
  stage3: 'L2 Panel Evaluation Report',
  stage4: 'Client Audit Report',
};

/** Filename-safe fragment: Windows forbids \ / : * ? " < > | and trailing dots. */
function slug(value: string): string {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\.+$/, '')
    || 'Unknown';
}

/**
 * `JDID-CandidateName-YYYY-MM-DD`.
 *
 * ISO-ordered date so a folder of reports sorts chronologically, which "12-Aug-2026"
 * would not. Single-stage downloads keep the same stem and append the stage, so every
 * artefact for one candidate groups together in a directory listing.
 */
export function buildReportFileName(
  data: PipelineDetail,
  stageId: ReportStageId = 'overall',
  now: Date = new Date(),
): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const stem = `${slug(data.jobId)}-${slug(data.candidateName)}-${y}-${m}-${d}`;
  if (stageId === 'overall') return stem;
  const suffix: Record<Exclude<ReportStageId, 'overall'>, string> = {
    stage1: 'Screening', stage2: 'L1-Panel', stage3: 'L2-Panel', stage4: 'Client-Audit',
  };
  return `${stem}-${suffix[stageId]}`;
}

/** "L1 — Lakshmi (24 Mar 2026)" for each panel that actually evaluated this candidate. */
function panelRoster(data: PipelineDetail): string[] {
  return PANEL_STAGES
    .filter(cfg => (data as any)[cfg.id]?.evaluation)
    .map(cfg => {
      const { panelName, evaluatedAt } = panelIdentity(data, cfg);
      const round = cfg.id === 'stage2' ? 'L1' : 'L2';
      return `${round} — ${panelName} (${formatDate(evaluatedAt)})`;
    });
}

function documentShell(title: string, subtitle: string, data: PipelineDetail, body: string, now: Date): string {
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const panels = panelRoster(data);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)} — ${esc(data.candidateName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; padding: 28px 32px; font-size: 12px; line-height: 1.5; }
    .header-bar { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:12px; margin-bottom:20px; }
    .meta-grid { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:20px; }
    .meta-item { font-size:11px; }
    .footer { margin-top:40px; padding-top:12px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:9px; color:#9ca3af; }
    .stage-section { margin-bottom: 36px; }
    @media print {
      body { padding: 20px; }
      .pdf-block { page-break-inside: avoid; }
      .stage-section { page-break-before: auto; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="${origin}/INDIUM LOGO.png" alt="Indium Logo" style="height:32px; object-fit:contain;" onerror="this.style.display='none'" />
      <div>
        <h1 style="font-size:18px;font-weight:700;color:#111827;">${esc(title)}</h1>
        <p style="font-size:10px;color:#6b7280;margin-top:2px;">${esc(subtitle)}</p>
      </div>
    </div>
    <span style="font-size:10px;color:#9ca3af">${dateStr} · ${timeStr}</span>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span style="color:#6b7280;">Job ID: </span><strong>${esc(data.jobId)}</strong></div>
    <div class="meta-item"><span style="color:#6b7280;">Candidate: </span><strong style="font-size:13px;">${esc(data.candidateName)}</strong></div>
    ${data.panelEmail ? `<div class="meta-item"><span style="color:#6b7280;">Panel Email: </span><strong>${esc(data.panelEmail)}</strong></div>` : ''}
    <div class="meta-item"><span style="color:#6b7280;">Completed Stages: </span><strong>${data.completedStages?.length || 0} / 4</strong></div>
  </div>

  ${panels.length ? `
  <div class="pdf-block" style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:4px;padding:10px 14px;margin-bottom:20px;">
    <p style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Panels Evaluated</p>
    <p style="font-size:11px;color:#111827;margin:0;font-weight:600;">${panels.map(esc).join('&nbsp; ·&nbsp; ')}</p>
  </div>` : ''}

  ${body}

  <div class="footer">
    <span>Generated by Panel Pulse AI${host ? ` · ${esc(host)}` : ''}</span>
    <span>${dateStr} ${timeStr}</span>
  </div>
</body>
</html>`;
}

const PAGE_BREAK = '<div style="page-break-before:always;margin-top:32px;"></div>';

/**
 * The whole report, or one stage of it.
 *
 * Exported so the contents can be asserted in tests without driving a browser download —
 * the sections this report must carry (per-panel identity, every dimension, the summary,
 * the moderation stamp) are exactly the things that were silently missing before.
 */
export function buildReportHTML(
  data: PipelineDetail,
  stageId: ReportStageId = 'overall',
  now: Date = new Date(),
): string {
  if (stageId === 'overall') {
    const sections: string[] = [];
    if (data.stage1?.analysis) sections.push(generateStage1HTML(data));
    for (const cfg of PANEL_STAGES) {
      if ((data as any)[cfg.id]?.evaluation) sections.push(generatePanelSectionHTML(data, cfg));
    }
    if (data.stage4?.analysis) sections.push(generateStage4HTML(data));

    const body = sections.length
      ? sections.join(PAGE_BREAK)
      : '<p style="color:#9ca3af;text-align:center;padding:40px 0;">No stages completed yet.</p>';

    return documentShell('Candidate Evaluation Report', 'Screening, panel evaluations and audit', data, body, now);
  }

  const body =
    stageId === 'stage1' ? generateStage1HTML(data) :
    stageId === 'stage4' ? generateStage4HTML(data) :
    generatePanelSectionHTML(data, PANEL_STAGES.find(c => c.id === stageId)!);

  return documentShell(STAGE_TITLES[stageId], `${data.candidateName} — ${data.jobId}`, data, body, now);
}

// ============================================
// MAIN REPORT GENERATOR FUNCTION
// ============================================

/**
 * Page the rendered canvas at block boundaries.
 *
 * A fixed slice height cuts wherever it lands — mid-sentence in a panel summary, or
 * between a moderation stamp and the verdict it stamps. The report is now several pages
 * per candidate, so that happens on nearly every download. `.pdf-block` marks the units
 * that must not be split; a block taller than a page is still cut, because it has to be.
 */
function computePageCuts(offsets: number[], canvasHeight: number, pxPerPage: number): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  // Below this fill ratio, honouring a break would leave most of the page blank; take the
  // hard cut instead so a long report does not balloon into mostly-empty pages.
  const MIN_FILL = 0.55;
  let top = 0;
  let guard = 0;

  while (top < canvasHeight - 1 && guard++ < 500) {
    const limit = top + pxPerPage;
    if (limit >= canvasHeight) {
      pages.push([top, canvasHeight - top]);
      break;
    }
    const candidates = offsets.filter(o => o > top + pxPerPage * MIN_FILL && o <= limit);
    const cut = candidates.length ? Math.max(...candidates) : limit;
    pages.push([top, cut - top]);
    top = cut;
  }
  return pages;
}

export async function generateReport(options: ReportGeneratorOptions): Promise<void> {
  const { data, stageId = 'overall', format } = options;

  const now = new Date();
  const html = buildReportHTML(data, stageId, now);
  const filename = buildReportFileName(data, stageId, now);

  if (format === 'html') {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // PDF generation
  const SCALE = 2;
  const container = document.createElement('div');
  container.innerHTML = html;
  Object.assign(container.style, {
    position: 'absolute',
    left: '-9999px',
    top: '0',
    width: '800px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    padding: '40px',
  });
  document.body.appendChild(container);

  try {
    // Measured before rasterising, in CSS pixels relative to the container, then scaled
    // into canvas coordinates — html2canvas renders the container box 1:1 at `scale`.
    const containerTop = container.getBoundingClientRect().top;
    const blockOffsets = Array.from(container.querySelectorAll<HTMLElement>('.pdf-block, .stage-section'))
      .map(el => (el.getBoundingClientRect().top - containerTop) * SCALE)
      .filter(o => o > 0);

    const canvas = await html2canvas(container, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 800,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const pxPerPage = (canvasWidth * pdfHeight) / pdfWidth;

    const pages = computePageCuts(blockOffsets, canvasHeight, pxPerPage);
    const totalPages = pages.length;

    pages.forEach(([srcY, srcH], i) => {
      if (i > 0) pdf.addPage();

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = Math.ceil(pxPerPage);
      const ctx = pageCanvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, srcY, canvasWidth, srcH, 0, 0, canvasWidth, srcH);

      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${i + 1} of ${totalPages}`, pdfWidth - 25, pdfHeight - 5);
    });

    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('PDF Export failed:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
}
