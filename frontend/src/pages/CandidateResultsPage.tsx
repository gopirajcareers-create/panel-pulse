import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { pipelineApi, formatPipelineEvaluation, type PipelineDetail } from '@/lib/api/pipeline.api';
import { ScoreCard } from '@/components/features/evaluation/ScoreCard';
import DimensionGrid from '@/components/features/evaluation/DimensionGrid';
import { JdSkillsCard } from '@/components/features/evaluation/JdSkillsCard';
import { PanelSummaryCard } from '@/components/features/evaluation/PanelSummaryCard';
import { ModerationCard } from '@/components/features/evaluation/ModerationCard';
import { L1ResultsView } from '@/components/features/stage2/L1ResultsView';
import { L2ResultsView } from '@/components/features/stage3/L2ResultsView';
import { ClientAuditView } from '@/components/features/stage4/ClientAuditView';
import { EmptyState } from '@/components/common/EmptyState';
import { ReportDownloadButton } from '@/components/features/reports/ReportDownloadButton';
import {
  ArrowLeft, Clock, User, FileText,
  Check, X, RefreshCw, Info, CircleDot, AlertTriangle,
  ChevronDown, ChevronUp, Sparkles, Shield, Zap, Loader2, MessageSquare, RotateCcw, Star
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { SkillBucketBreakdown, SkillMatchRow, SkillTier } from '@/lib/api/pipeline.api';
import {
  GRADE_CREDIT, GRADE_LABEL, bucketBreakupOf, gradeOf, num, tierOfGrade,
} from '@/lib/utils/skillGrade';

type StageId = 'stage1' | 'stage2' | 'stage3' | 'stage4';

/**
 * The three tiers must be visually distinct, not two shades of "matched".
 *
 * The UI rendered a boolean as a green tick or a red cross, which collapsed "6 years of
 * Selenium on a named project" and "Selenium appears in a comma-separated skills list"
 * into the same green tick — and the recruiter reading it had no way to tell which they
 * were looking at. PARTIAL is amber and carries its own glyph for exactly that reason.
 */
const TIER_STYLE: Record<SkillTier, { label: string; icon: React.ReactNode; chip: string; text: string }> = {
  STRONG: {
    label: 'Strong',
    icon: <Check className="w-3.5 h-3.5" />,
    chip: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    text: 'text-emerald-400',
  },
  PARTIAL: {
    label: 'Partial',
    icon: <CircleDot className="w-3.5 h-3.5" />,
    chip: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    text: 'text-amber-400',
  },
  NONE: {
    label: 'Not found',
    icon: <X className="w-3.5 h-3.5" />,
    chip: 'bg-red-500/10 text-red-400 border border-red-500/20',
    text: 'text-red-400',
  },
};

/**
 * Records screened before the tiered rubric carry only `matched`, and there are stored
 * ones in the collection. Read the tier if present, otherwise map the old boolean to the
 * ends of the scale — an old record cannot be PARTIAL, because that judgement was never
 * made about it.
 *
 * Routed through the grade so the chip colour and the credit in its label can never come
 * from two different readings of the same row.
 */
function tierOf(row: Partial<SkillMatchRow>): SkillTier {
  return tierOfGrade(gradeOf(row));
}

const STAGES = [
  { id: 'stage1' as StageId, label: 'Screening', shortLabel: 'Stage 1', color: 'text-violet-400', borderColor: 'border-violet-500/40', bgColor: 'bg-violet-500/10' },
  { id: 'stage2' as StageId, label: 'L1 Scoring', shortLabel: 'Stage 2', color: 'text-orange-400', borderColor: 'border-orange-500/40', bgColor: 'bg-orange-500/10' },
  { id: 'stage3' as StageId, label: 'L2 Scoring', shortLabel: 'Stage 3', color: 'text-sky-400', borderColor: 'border-sky-500/40', bgColor: 'bg-sky-500/10' },
  { id: 'stage4' as StageId, label: 'Client Audit', shortLabel: 'Stage 4', color: 'text-emerald-400', borderColor: 'border-emerald-500/40', bgColor: 'bg-emerald-500/10' },
];

export default function CandidateResultsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId') || '';
  const candidateName = searchParams.get('candidateName') || '';
  const urlStage = searchParams.get('stage') as StageId;

  const [detail, setDetail] = useState<PipelineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<StageId>(urlStage || 'stage1');

  useEffect(() => {
    if (urlStage && ['stage1', 'stage2', 'stage3', 'stage4'].includes(urlStage)) {
      setActiveStage(urlStage);
    }
  }, [urlStage]);

  // Stage 1 — AI recommended questions state
  const [l1Questions, setL1Questions] = useState<Array<{
    title: string; icon: string; questions: Array<{ q: string; rationale: string }>;
  }> | null>(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const loadCandidateDetails = async () => {
    if (!jobId || !candidateName) {
      setError('Missing parameters: jobId and candidateName are required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await pipelineApi.getCandidate(jobId, candidateName);
      setDetail(data);
    } catch (err: any) {
      console.error('Failed to load candidate details:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to fetch candidate pipeline details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidateDetails();
  }, [jobId, candidateName]);

  const handleGenerateL1Questions = async () => {
    setGeneratingQuestions(true);
    setQuestionsError(null);
    try {
      const data = await pipelineApi.generateL1Questions(jobId, candidateName);
      setL1Questions(data.categories);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Failed to generate questions.';
      setQuestionsError(msg);
      toast.error(msg);
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleRestartFromStage = async (stageId: StageId) => {
    const stageLabels: Record<StageId, string> = {
      stage1: 'Stage 1 (Screening)',
      stage2: 'Stage 2 (L1 Scoring)',
      stage3: 'Stage 3 (L2 Scoring)',
      stage4: 'Stage 4 (Client Audit)'
    };

    if (!confirm(`Are you sure you want to restart from ${stageLabels[stageId]}? This will delete all data from this stage onwards.`)) {
      return;
    }

    try {
      await pipelineApi.restartFromStage(jobId, candidateName, stageId);
      toast.success(`Restarted from ${stageLabels[stageId]}`);
      // Navigate back to dashboard after restart
      navigate('/dashboard-i');
    } catch (err: any) {
      console.error('Failed to restart from stage:', err);
      toast.error(err?.response?.data?.error || 'Failed to restart evaluation');
    }
  };

  // Find the last completed stage
  const getLastCompletedStage = (): StageId | null => {
    if (detail?.stage4?.completed) return 'stage4';
    if (detail?.stage3?.completed) return 'stage3';
    if (detail?.stage2?.completed) return 'stage2';
    if (detail?.stage1?.completed) return 'stage1';
    return null;
  };

  const lastCompletedStage = detail ? getLastCompletedStage() : null;

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 flex flex-col items-center justify-center min-h-[80vh]">
          <RefreshCw className="w-10 h-10 animate-spin text-indigo-400" />
          <p className="text-text-secondary text-sm mt-3 font-semibold">Loading candidate pipeline details...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !detail) {
    return (
      <AppShell>
        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
          <div className="max-w-4xl mx-auto mt-12">
            <EmptyState
              title="Failed to Load Candidate"
              description={error || 'Candidate not found in the pipeline.'}
              action={
                <button
                  onClick={() => navigate('/dashboard-i')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Back to Dashboard
                </button>
              }
            />
          </div>
        </div>
      </AppShell>
    );
  }

  const completedStages = new Set(detail.completedStages || []);

  const renderActiveStageContent = () => {
    if (activeStage === 'stage1') {
      if (!detail.stage1 || !detail.stage1.completed) {
        return <PendingStage label="Stage 1: Screening" stageId="stage1" jobId={jobId} candidateName={candidateName} />;
      }
      const analysis = detail.stage1.analysis;
      return (
        <div className="space-y-6">
          {/* Stage Report Download */}
          <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Stage 1 Report</h3>
              <p className="text-xs text-text-muted mt-0.5">Download screening analysis and skills coverage</p>
            </div>
            <ReportDownloadButton data={detail} stageId="stage1" variant="secondary" showBothFormats={false} />
          </div>

          {/* ── Provenance caveat ────────────────────────────────────────────
              Shown at the top, before any number. Most real JDs never use the literal
              words "mandatory" / "required" / "must have", so the JD-states-nothing case
              is the COMMON one — and the screening used to fill the gap with hardcoded
              generic skills presented exactly like JD-sourced ones. A recruiter acting on
              "Eligible — 85%" has to be able to see which basis produced it. */}
          {analysis.skillsProvenance?.notice && (
            <div className={`border p-4 rounded-xl flex items-start gap-3 ${
              analysis.skillsProvenance.mandatoryInferred
                ? 'bg-violet-500/[0.07] border-violet-500/25'
                : 'bg-amber-500/[0.07] border-amber-500/25'
            }`}>
              <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                analysis.skillsProvenance.mandatoryInferred ? 'text-violet-300' : 'text-amber-400'
              }`} />
              <div className="min-w-0">
                <h4 className={`text-xs font-bold uppercase tracking-widest ${
                  analysis.skillsProvenance.mandatoryInferred ? 'text-violet-300' : 'text-amber-400'
                }`}>
                  {analysis.skillsProvenance.mandatoryInferred
                    ? 'AI-inferred — not stated in JD'
                    : 'No screening criteria'}
                </h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {analysis.skillsProvenance.notice}
                </p>
              </div>
            </div>
          )}

          {analysis.skillsProvenance?.analyzerError && (
            <div className="bg-red-500/[0.07] border border-red-500/25 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
              <div className="min-w-0">
                <h4 className="text-xs font-bold uppercase tracking-widest text-red-400">
                  Skill extraction partially failed
                </h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  The JD analyzer reported: {analysis.skillsProvenance.analyzerError}. The skill list
                  below may be incomplete, so this score should be treated as provisional.
                </p>
              </div>
            </div>
          )}

          {/* Skills the model was asked about but never answered on are scored Not found.
              That is deliberately conservative, and it has to be labelled as such: an
              unexamined skill is not the same finding as a confirmed gap. */}
          {((analysis.reconciliation?.mandatoryMissing?.length || 0) +
            (analysis.reconciliation?.goodToHaveMissing?.length || 0)) > 0 && (
            <div className="bg-amber-500/[0.07] border border-amber-500/25 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  Unexamined skills
                </h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  The screening model did not report on{' '}
                  {[...(analysis.reconciliation?.mandatoryMissing || []),
                    ...(analysis.reconciliation?.goodToHaveMissing || [])].join(', ')}
                  . These are scored as Not found, but treat them as unverified rather than
                  as confirmed gaps — re-run the screening to get a verdict on them.
                </p>
              </div>
            </div>
          )}

          {/* Status & Summary Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {/* Match Score & Status card */}
            <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Screening Status</h3>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                    analysis.status === 'Eligible' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' :
                    analysis.status === 'Partially Eligible' ? 'bg-orange-500/15 border-orange-500/30 text-orange-300' :
                    // 'Not Screenable' is not a verdict on the candidate, so it must not
                    // wear the same red as Ineligible — nothing was assessed.
                    analysis.status === 'Not Screenable' ? 'bg-slate-500/15 border-slate-500/30 text-slate-300' :
                    'bg-red-500/15 border-red-500/30 text-red-300'
                  }`}>
                    {analysis.status}
                  </span>
                  
                  {/* Info Button with Hover Tooltip */}
                  <div className="relative group flex items-center">
                    <button className="text-text-muted hover:text-orange-400 transition-colors p-1 rounded-full hover:bg-white/5 cursor-help" aria-label="Status Details">
                      <Info className="w-4 h-4" />
                    </button>
                    {/* Tooltip Content - Positioned on the Right, Dark Black Background */}
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-72 bg-black border border-white/10 p-4 rounded-xl shadow-2xl opacity-0 scale-95 origin-left pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 space-y-2.5">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-400 border-b border-white/10 pb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        Status Criteria Details
                      </div>
                      <div className="space-y-2 text-xs leading-relaxed text-slate-200">
                        <p>
                          <strong className="text-emerald-400 font-bold">Eligible (&gt; 70%):</strong> The candidate meets all or almost all mandatory job requirements and some additional criteria. They are a strong fit to advance.
                        </p>
                        <p>
                          <strong className="text-orange-400 font-bold">Partially Eligible (40% - 69%):</strong> The candidate meets some mandatory requirements but lacks key elements.
                        </p>
                        <p>
                          <strong className="text-red-400 font-bold">Ineligible (&lt; 40%):</strong> The candidate lacks core technical components.
                        </p>
                        <p className="pt-1 border-t border-white/10">
                          <strong className="text-slate-300 font-bold">How the score is built:</strong> each
                          skill earns credit for how well the resume evidences it — Strong 1.0, and a Partial
                          1.0, 0.75 or 0.5 depending on whether the resume names it with supporting context,
                          only names it, or does not name it at all. Not found earns 0.
                        </p>
                        <p>
                          <strong className="text-slate-300 font-bold">Weighting:</strong> mandatory skills
                          carry 80% of the total and good-to-have 20%, so a full good-to-have list cannot
                          make up for a missing mandatory one; if either list is empty the other carries the
                          full 100%. The percentage is calculated from the grades shown below — it is not a
                          separate judgement.
                        </p>
                      </div>
                      {/* Arrow pointing left */}
                      <div className="absolute top-1/2 -translate-y-1/2 right-full translate-x-1.5 w-2 h-2 bg-black border-l border-b border-white/10 rotate-45" />
                    </div>
                  </div>

                  {/* A null score means there were no skills to score against, which is
                      not the same statement as 0% and must not render as one. */}
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 shadow-sm ${
                    analysis.matchScore == null
                      ? 'bg-slate-500/10 border-slate-500/25 text-slate-400'
                      : 'bg-orange-500/10 border-orange-500/25 text-orange-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      analysis.matchScore == null ? 'bg-slate-400' : 'bg-orange-400 animate-pulse'
                    }`} />
                    {analysis.matchScore == null ? 'Match Score: not calculable' : `Match Score: ${analysis.matchScore}%`}
                  </span>
                </div>

                {/* The arithmetic, spelled out. The score used to be produced by the model
                    from a formula in its prompt, so it could disagree with the tiers printed
                    below it; showing the derivation is what makes that checkable by hand. */}
                {analysis.scoreBreakdown?.formula && (
                  <p className="text-[11px] text-text-muted mt-2.5 font-mono leading-relaxed">
                    {analysis.scoreBreakdown.formula}
                  </p>
                )}
              </div>

              {/* Experience match */}
              <div className="pt-3 border-t border-white/[0.06]">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-1">Experience Alignment</h4>
                <p className="text-xs text-text-primary leading-relaxed">{analysis.experienceMatch}</p>
              </div>
            </div>

            {/* Screening summary card */}
            <div className="lg:col-span-2 bg-bg-card rounded-xl border border-white/[0.06] p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Screening Summary</h3>

              {/* Derived from the skill tiers, so it cannot contradict them. Placed FIRST
                  because the prose below is the model's and has been seen to disagree with
                  the rows — the reader should meet the countable statement first. */}
              {analysis.coverageSummary && (
                <p className="text-xs text-text-primary leading-relaxed bg-white/[0.02] border border-white/[0.06] px-4 py-2.5 rounded-lg mb-3 font-medium">
                  {analysis.coverageSummary}
                </p>
              )}

              <p className="text-sm text-text-secondary leading-relaxed bg-white/[0.01] border border-white/[0.04] p-4 rounded-lg italic">
                "{analysis.screeningSummary}"
              </p>

              {/* The summary is free text the model writes alongside the tiers, and it has
                  claimed a skill the same run scored NONE — "strong experience with Cypress"
                  over a Cypress row reading "Not found in resume". The conflict is named
                  rather than the prose silently edited, so the reader knows which clause to
                  distrust and the skill rows stay the authority. */}
              {analysis.summaryContradictions && analysis.summaryContradictions.length > 0 && (
                <div className="mt-3 bg-amber-500/[0.07] border border-amber-500/25 rounded-lg p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <p className="text-xs font-bold text-amber-300">Summary conflicts with the evidence</p>
                  </div>
                  <p className="text-[11px] text-amber-200/70 leading-relaxed mb-2">
                    The wording above claims {analysis.summaryContradictions.length === 1 ? 'a skill' : 'skills'} that
                    the skill checks below found no resume evidence for. Trust the skill rows — the
                    score is computed from those, not from this text.
                  </p>
                  <ul className="space-y-1">
                    {analysis.summaryContradictions.map((c, i) => (
                      <li key={i} className="text-[11px] text-amber-200/90 leading-relaxed">
                        <span className="font-bold">{c.skill}</span> — scored as not evidenced, yet the
                        summary says: <span className="italic">"{c.sentence}"</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Skills Coverage Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mandatory Skills Match list */}
            <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Mandatory Skills Coverage
                </h3>
                <TierCensus rows={analysis.mandatorySkillsMatch || []} />
              </div>
              <BucketBreakupLine
                bucket={analysis.scoreBreakdown?.mandatory}
                rows={analysis.mandatorySkillsMatch || []}
                redistributed={analysis.scoreBreakdown?.weights_redistributed}
              />
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {analysis.mandatorySkillsMatch?.length
                  ? analysis.mandatorySkillsMatch.map((item, idx) => <SkillMatchItem key={idx} row={item} />)
                  : <p className="text-xs text-text-muted italic">No mandatory skills were identified for this role.</p>}
              </div>
            </div>

            {/* Additional Skills Match list */}
            <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Good-to-Have Skills Coverage
                </h3>
                <TierCensus rows={analysis.additionalSkillsMatch || []} />
              </div>
              <BucketBreakupLine
                bucket={analysis.scoreBreakdown?.goodToHave}
                rows={analysis.additionalSkillsMatch || []}
                redistributed={analysis.scoreBreakdown?.weights_redistributed}
              />
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {analysis.additionalSkillsMatch?.length
                  ? analysis.additionalSkillsMatch.map((item, idx) => <SkillMatchItem key={idx} row={item} />)
                  : (
                    <p className="text-xs text-text-muted italic">
                      {analysis.skillsProvenance?.goodToHaveNotice
                        || 'The JD labels no skills as good-to-have.'}
                    </p>
                  )}
              </div>
            </div>
          </div>

          {/* Prior screenings of this same record. Shown only when the record has been
              re-screened, and it is the direct answer to "the score changed between runs":
              the earlier numbers and the model that produced each are on screen instead of
              being overwritten. */}
          {(detail.stage1.history?.length || 0) > 0 && (
            <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-orange-500">
                Previous Screenings ({detail.stage1.history!.length})
              </h3>
              <div className="space-y-2">
                {[...detail.stage1.history!].reverse().map((h, idx) => {
                  const delta = (typeof h.matchScore === 'number' && typeof analysis.matchScore === 'number')
                    ? analysis.matchScore - h.matchScore
                    : null;
                  return (
                    <div key={idx} className="flex items-center gap-3 flex-wrap text-xs bg-white/[0.01] border border-white/[0.04] px-3 py-2 rounded-lg">
                      <span className="text-text-muted font-mono">
                        {h.screenedAt ? new Date(h.screenedAt).toLocaleString() : 'unknown date'}
                      </span>
                      <span className="font-bold text-text-primary">
                        {h.matchScore == null ? 'not calculable' : `${h.matchScore}%`}
                      </span>
                      <span className="text-text-muted">{h.status || '—'}</span>
                      {delta !== null && delta !== 0 && (
                        <span className={delta > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                          {delta > 0 ? `+${delta}` : delta} vs current
                        </span>
                      )}
                      {/* A different model build is a legitimate reason for a changed score,
                          and without the digest it is indistinguishable from sampling noise. */}
                      {h.scoring_meta?.rubric_version && (
                        <span className="text-text-muted/60 font-mono text-[10px]">
                          {h.scoring_meta.rubric_version}
                          {h.scoring_meta.model_digest ? ` · ${String(h.scoring_meta.model_digest).slice(0, 8)}` : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── AI Recommended L1 Questions ────────────────────────────────── */}
          <L1QuestionsPanel
            questions={l1Questions}
            generating={generatingQuestions}
            error={questionsError}
            onGenerate={handleGenerateL1Questions}
          />

        </div>
      );
    }

    // ── Stage 2: L1 Scoring (new l1ScoringService schema) ──────────────────
    if (activeStage === 'stage2') {
      const stageData = detail.stage2;
      if (!stageData || !stageData.completed) {
        return <PendingStage label="Stage 2: L1 Scoring" stageId="stage2" jobId={jobId} candidateName={candidateName} />;
      }
      return (
        <div className="space-y-6">
          {/* Stage Report Download */}
          <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Stage 2 Report</h3>
              <p className="text-xs text-text-muted mt-0.5">Download L1 scoring and dimension analysis</p>
            </div>
            <ReportDownloadButton data={detail} stageId="stage2" variant="secondary" showBothFormats={false} />
          </div>
          <L1ResultsView stageData={stageData} panelName={detail.panelName} />
        </div>
      );
    }

    // ── Stage 3: L2 Scoring (new l2ScoringService schema) ──────────────────
    if (activeStage === 'stage3') {
      const stageData = detail.stage3;
      if (!stageData || !stageData.completed) {
        return <PendingStage label="Stage 3: L2 Scoring" stageId="stage3" jobId={jobId} candidateName={candidateName} />;
      }
      return (
        <div className="space-y-6">
          {/* Stage Report Download */}
          <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Stage 3 Report</h3>
              <p className="text-xs text-text-muted mt-0.5">Download L2 scoring and candidate status analysis</p>
            </div>
            <ReportDownloadButton data={detail} stageId="stage3" variant="secondary" showBothFormats={false} />
          </div>
          <L2ResultsView stageData={stageData} panelName={detail.panelName} />
        </div>
      );
    }

    // Stage 4: Client Audit
    if (activeStage === 'stage4') {
      if (!detail.stage4 || !detail.stage4.completed) {
        return <PendingStage label="Stage 4: Client Audit" stageId="stage4" jobId={jobId} candidateName={candidateName} />;
      }
      return (
        <div className="space-y-6">
          {/* Stage Report Download */}
          <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Stage 4 Report</h3>
              <p className="text-xs text-text-muted mt-0.5">Download client audit and recommendations</p>
            </div>
            <ReportDownloadButton data={detail} stageId="stage4" variant="secondary" showBothFormats={false} />
          </div>
          <ClientAuditView stageData={detail.stage4} />
        </div>
      );
    }

    return null;
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Back Navigation & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard-i')}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 rounded-lg text-text-muted hover:text-text-primary text-xs font-bold transition-all group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:translate-x-[-2px] transition-transform" />
              Back to Dashboard
            </button>
            <span className="text-text-muted/30">/</span>
            <span className="text-xs text-text-muted font-semibold">Candidate Pipeline Result</span>
          </div>

          {/* Header Card */}
          <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-2xl backdrop-blur-md space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl mt-1">
                  <User className="w-7 h-7 text-indigo-400" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-orange-500 tracking-tight">{detail.candidateName}</h1>
                    {activeStage === 'stage4' && detail.stage3?.candidateStatus && (
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
                        detail.stage3.candidateStatus === 'Selected' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}>
                        Stage 3: {detail.stage3.candidateStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted font-medium">
                    <span className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] text-text-muted rounded font-bold">
                      ID: {detail.jobId}
                    </span>
                    <span>Panel: {detail.panelName || 'N/A'}</span>
                    <span>Email: {detail.panelEmail || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Overall Report Download Button */}
              <div className="flex items-center gap-3">
                <ReportDownloadButton data={detail} stageId="overall" variant="primary" showBothFormats={true} />
              </div>
            </div>

            {/* Stage Selector (clickable) */}
            <div className="flex flex-wrap items-center gap-2 bg-white/[0.01] border border-white/[0.05] p-2 rounded-xl">
              {STAGES.map((s) => {
                const active = activeStage === s.id;
                const done = completedStages.has(s.id);
                const isLastCompleted = lastCompletedStage === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveStage(s.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all border ${
                        active ? `${s.bgColor} ${s.color} ${s.borderColor} shadow-sm` :
                        done ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10 hover:bg-emerald-500/10' :
                        'bg-transparent text-text-muted border-transparent hover:bg-white/[0.03] hover:text-text-primary'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        active ? 'bg-current animate-pulse' :
                        done ? 'bg-emerald-400' : 'bg-white/20'
                      }`} />
                      {s.label}
                    </button>
                    {isLastCompleted && (
                      <button
                        onClick={() => handleRestartFromStage(s.id)}
                        className="p-1.5 hover:bg-orange-500/10 text-text-muted hover:text-orange-400 rounded-lg transition-all border border-transparent hover:border-orange-500/30"
                        title={`Restart from ${s.label}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content panel */}
          <div className="min-h-[400px]">
            {renderActiveStageContent()}
          </div>

          {/* Expandable texts for JD & Resume (visible across all stages) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 border-t border-white/[0.06] pt-8">
            <CollapsibleTextBox title="View Jd" text={detail.stage1?.jdText} isOrange={true} />
            <CollapsibleTextBox title="View Resume" text={detail.stage1?.resumeText} isOrange={true} />
          </div>

        </div>
      </div>
    </AppShell>
  );
}

// ─── L1 Questions Panel ───────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; border: string; bg: string; badge: string }> = {
  shield: {
    icon: <Shield className="w-4 h-4" />,
    color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-500/10', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30'
  },
  zap: {
    icon: <Zap className="w-4 h-4" />,
    color: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30'
  },
  user: {
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  },
};

function QuestionItem({ q, rationale, idx, colorCls }: { q: string; rationale: string; idx: number; colorCls: typeof CATEGORY_CONFIG[string] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-white/[0.01] border ${colorCls.border} rounded-xl p-4 space-y-2`}>
      <div className="flex items-start gap-3">
        <span className={`shrink-0 w-6 h-6 rounded-full ${colorCls.bg} ${colorCls.color} border ${colorCls.border} flex items-center justify-center text-[10px] font-black`}>
          {idx + 1}
        </span>
        <p className="text-sm text-text-primary font-medium leading-relaxed flex-1">{q}</p>
      </div>
      {rationale && (
        <div className="ml-9">
          <button
            onClick={() => setOpen(v => !v)}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold ${colorCls.color} hover:opacity-80 transition-opacity`}
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? 'Hide Rationale' : 'Why this question?'}
          </button>
          {open && (
            <p className="mt-2 text-xs text-text-muted italic leading-relaxed border-l-2 border-white/10 pl-3 animate-in fade-in duration-200">
              {rationale}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function L1QuestionsPanel({ questions, generating, error, onGenerate }: {
  questions: Array<{ title: string; icon: string; questions: Array<{ q: string; rationale: string }> }> | null;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-bg-card rounded-xl border border-amber-500/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-lg">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Recommended L1 Interview Questions</h3>
            <p className="text-[11px] text-text-muted mt-0.5">AI-generated based on candidate resume & JD requirements</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {questions && (
            <button onClick={() => setOpen(v => !v)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-text-muted transition-colors">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Generating...' : questions ? 'Regenerate' : 'Generate Questions'}
          </button>
        </div>
      </div>

      {/* Content */}
      {generating && (
        <div className="px-5 pb-5 pt-3 flex items-center gap-3 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>AI is analysing the JD and resume to craft targeted questions...</span>
        </div>
      )}

      {error && !generating && (
        <div className="px-5 pb-4 pt-2 text-xs text-red-400 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      {questions && !generating && open && (
        <div className="p-5 border-t border-white/[0.06] space-y-6 animate-in slide-in-from-top-2 duration-200">
          {questions.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat.icon] ?? CATEGORY_CONFIG.user;
            return (
              <div key={cat.title} className="space-y-3">
                <div className={`flex items-center gap-2 ${cfg.color}`}>
                  <div className={`p-1.5 rounded-lg ${cfg.bg} border ${cfg.border}`}>{cfg.icon}</div>
                  <h4 className="text-xs font-black uppercase tracking-widest">{cat.title}</h4>
                  <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badge}`}>
                    {cat.questions.length} questions
                  </span>
                </div>
                <div className="space-y-2.5">
                  {cat.questions.map((item, idx) => (
                    <QuestionItem key={idx} q={item.q} rationale={item.rationale} idx={idx} colorCls={cfg} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {questions && !generating && !open && (
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 text-xs text-text-muted">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          {questions.reduce((acc, c) => acc + c.questions.length, 0)} questions generated across {questions.length} categories.
          <button onClick={() => setOpen(true)} className="ml-1 text-amber-400 hover:underline font-semibold">View all</button>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible TextBox helper ──────────────────────────────────────────────

/**
 * One screened skill: its tier, the resume text that earned it, and — where the backend
 * cut the model's claim down — why.
 *
 * The demotion note is shown rather than hidden because it is the answer to "why is this
 * only Partial when the resume clearly mentions it?", which is otherwise unanswerable
 * from the screen and was the shape of the original inconsistency complaint.
 */
function SkillMatchItem({ row }: { row: SkillMatchRow }) {
  const grade = gradeOf(row);
  const style = TIER_STYLE[tierOfGrade(grade)];
  const demotion = row.audit?.demoted ? row.audit.demotion_reasons : null;
  // A promotion is the opposite correction: the model said absent, the resume says
  // otherwise. Shown in emerald, not amber — nothing was taken away from the candidate.
  const promotion = row.audit?.promoted ? row.audit.demotion_reasons : null;
  // What the row was cut down FROM. Reported as the grade rather than the tier because a
  // claimed Partial cut to 0.5 keeps its tier — reading "Downgraded from PARTIAL" beside a
  // row labelled Partial is the kind of note a reader concludes is a rendering fault.
  const claimedFrom = row.audit?.claimed_grade
    ? GRADE_LABEL[row.audit.claimed_grade]
    : row.audit?.claimed_tier;

  return (
    <div className="bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-lg flex items-start gap-3.5">
      <span className={`p-1 rounded mt-0.5 shrink-0 ${style.chip}`} title={GRADE_LABEL[grade]}>
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-text-primary truncate">{row.skill}</p>
          {/* The credit is in the label, not only in the tooltip: it is the number this
              row contributes to the score, and a reader comparing two amber rows has no
              other way to see that one of them is worth twice the other. */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${style.chip}`}
            title={row.audit?.grade_reason || undefined}
          >
            {GRADE_LABEL[grade]}
          </span>
          {row.source === 'ai-suggested' && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-300 border border-violet-500/20"
              title="This skill was inferred by AI from the role — the JD does not state it."
            >
              AI-inferred
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">{row.evidence}</p>
        {/* Only for partials, and this is the row where it matters: it is the answer to
            "why is this one worth 0.75 and that one 0.5?", which the evidence text above
            describes but never quantifies. A Strong or Not found needs no such note. */}
        {tierOfGrade(grade) === 'PARTIAL' && row.audit?.grade_reason && (
          <p className="text-[11px] text-text-muted/80 mt-1.5 leading-relaxed italic">
            Credited {num(GRADE_CREDIT[grade])} of 1.0 — {row.audit.grade_reason}
          </p>
        )}
        {demotion && demotion.length > 0 && (
          <p className="text-[11px] text-amber-400/70 mt-1.5 leading-relaxed">
            Downgraded from {claimedFrom}: {demotion.join('; ')}.
          </p>
        )}
        {promotion && promotion.length > 0 && (
          <p className="text-[11px] text-emerald-400/80 mt-1.5 leading-relaxed">
            Corrected upward: {promotion.join('; ')}.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * How this bucket's weight turned into points.
 *
 * Only the weight used to be shown, which left "Weighted 80% of the match score" above
 * four skills and a total of 45% with nothing on screen to connect them. The credit earned
 * against the number of skills is the missing step, and the partial split is the rest of
 * it — with three grades of partial, two candidates can show the same "3 Partial" census
 * and legitimately differ by a full skill's worth of credit.
 */
function BucketBreakupLine({ bucket, rows, redistributed }: {
  bucket?: SkillBucketBreakdown;
  rows: SkillMatchRow[];
  redistributed?: boolean;
}) {
  const b = bucketBreakupOf(bucket, rows);
  // No skills means no arithmetic to explain — the empty-list note below says why.
  if (!b || !b.skills) return null;

  return (
    <div className="text-[11px] text-text-muted space-y-0.5">
      <p>
        Weighted <span className="font-bold text-text-secondary">{b.weight}%</span> of the match
        score{redistributed && ' (raised because the other list is empty)'} ·{' '}
        <span className="font-bold text-text-secondary">{num(b.creditEarned)}</span> credit earned
        of {b.skills} {b.skills === 1 ? 'skill' : 'skills'} →{' '}
        <span className="font-bold text-orange-400">{num(b.points)} pts</span>
      </p>
      {b.partialSplit && <p>Partial credit: {b.partialSplit}</p>}
    </div>
  );
}

/** Tier census for a bucket, so coverage is legible without counting rows by eye. */
function TierCensus({ rows }: { rows: SkillMatchRow[] }) {
  if (!rows?.length) return null;
  const counts = { STRONG: 0, PARTIAL: 0, NONE: 0 };
  for (const r of rows) counts[tierOf(r)]++;
  return (
    <div className="flex items-center gap-3 text-[11px] font-bold">
      {(Object.keys(TIER_STYLE) as SkillTier[]).map(t => (
        <span key={t} className={counts[t] ? TIER_STYLE[t].text : 'text-text-muted/40'}>
          {counts[t]} {TIER_STYLE[t].label}
        </span>
      ))}
    </div>
  );
}

function CollapsibleTextBox({ title, text, isOrange = false }: { title: string; text: string; isOrange?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-white/[0.01] hover:bg-white/[0.03] text-left transition-colors"
      >
        <span className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${isOrange ? 'text-orange-500' : 'text-text-muted'}`}>
          <FileText className={`w-3.5 h-3.5 ${isOrange ? 'text-orange-400' : 'text-indigo-400'}`} />
          {title}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        )}
      </button>
      {open && (
        <div className="p-4 border-t border-white/[0.06] bg-slate-950/40 animate-in slide-in-from-top-2 duration-200">
          <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed p-4 bg-white/[0.01] rounded-lg border border-white/[0.04]">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Pending Stage display ───────────────────────────────────────────────────

function PendingStage({ label, stageId, jobId, candidateName }: { label: string; stageId: StageId; jobId: string; candidateName: string }) {
  const navigate = useNavigate();

  const handleNavigateToUpload = () => {
    const params = new URLSearchParams({
      jobId,
      candidateName,
      stage: stageId
    });
    navigate(`/smart-extract-i?${params.toString()}`);
  };

  return (
    <div className="bg-bg-card/40 border border-dashed border-white/10 rounded-2xl p-16 text-center space-y-4 max-w-2xl mx-auto mt-6 animate-in zoom-in-95 duration-200">
      <div className="w-12 h-12 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center mx-auto">
        <Clock className="w-6 h-6 text-text-muted" />
      </div>
      <div>
        <h4 className="text-base font-bold text-text-primary">{label} Pending</h4>
        <p className="text-text-muted text-xs mt-1 leading-relaxed">
          The required documents or transcripts for this stage have not been uploaded yet. Please use the upload tool to continue the candidate's evaluation pipeline.
        </p>
      </div>
      <button
        onClick={handleNavigateToUpload}
        className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 mx-auto"
      >
        <Star className="w-4 h-4" />
        Go to Upload Portal
      </button>
    </div>
  );
}
