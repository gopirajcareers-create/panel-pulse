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
import {
  ArrowLeft, Clock, User, FileText,
  Check, X, RefreshCw, Info,
  ChevronDown, ChevronUp, Sparkles, Shield, Zap, Loader2, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

type StageId = 'stage1' | 'stage2' | 'stage3' | 'stage4';

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
        return <PendingStage label="Stage 1: Screening" stageId="stage1" />;
      }
      const analysis = detail.stage1.analysis;
      return (
        <div className="space-y-6">
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
                      </div>
                      {/* Arrow pointing left */}
                      <div className="absolute top-1/2 -translate-y-1/2 right-full translate-x-1.5 w-2 h-2 bg-black border-l border-b border-white/10 rotate-45" />
                    </div>
                  </div>

                  <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500/10 border border-orange-500/25 text-orange-400 flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    Match Score: {analysis.matchScore}%
                  </span>
                </div>
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
              <p className="text-sm text-text-secondary leading-relaxed bg-white/[0.01] border border-white/[0.04] p-4 rounded-lg italic">
                "{analysis.screeningSummary}"
              </p>
            </div>
          </div>

          {/* Skills Coverage Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mandatory Skills Match list */}
            <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Mandatory Skills Coverage
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {analysis.mandatorySkillsMatch?.map((item, idx) => (
                  <div key={idx} className="bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-lg flex items-start gap-3.5">
                    <span className={`p-1 rounded mt-0.5 ${item.matched ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {item.matched ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-text-primary truncate">{item.skill}</p>
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">{item.evidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Skills Match list */}
            <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Good-to-Have Skills Coverage
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {analysis.additionalSkillsMatch?.map((item, idx) => (
                  <div key={idx} className="bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-lg flex items-start gap-3.5">
                    <span className={`p-1 rounded mt-0.5 ${item.matched ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {item.matched ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-text-primary truncate">{item.skill}</p>
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">{item.evidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
        return <PendingStage label="Stage 2: L1 Scoring" stageId="stage2" />;
      }
      return <L1ResultsView stageData={stageData} panelName={detail.panelName} />;
    }

    // ── Stage 3: L2 Scoring (new l2ScoringService schema) ──────────────────
    if (activeStage === 'stage3') {
      const stageData = detail.stage3;
      if (!stageData || !stageData.completed) {
        return <PendingStage label="Stage 3: L2 Scoring" stageId="stage3" />;
      }
      return <L2ResultsView stageData={stageData} panelName={detail.panelName} />;
    }

    // Stage 4: Client Audit
    if (activeStage === 'stage4') {
      if (!detail.stage4 || !detail.stage4.completed) {
        return <PendingStage label="Stage 4: Client Audit" stageId="stage4" />;
      }
      return <ClientAuditView stageData={detail.stage4} />;
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
          <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-6">
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

            {/* Stage Selector (clickable, moved here) */}
            <div className="flex flex-wrap items-center gap-2 bg-white/[0.01] border border-white/[0.05] p-2 rounded-xl">
              {STAGES.map((s) => {
                const active = activeStage === s.id;
                const done = completedStages.has(s.id);
                return (
                  <button
                    key={s.id}
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

function PendingStage({ label, stageId }: { label: string; stageId: StageId }) {
  const navigate = useNavigate();
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
        onClick={() => navigate('/smart-extract-i')}
        className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 mx-auto"
      >
        <Star className="w-4 h-4" />
        Go to Upload Portal
      </button>
    </div>
  );
}
