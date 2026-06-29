import React, { useState } from 'react';
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Info,
  FileText, Zap, ChevronDown, ChevronUp, Star,
  Target, Activity, AlertCircle, MessageSquare, TrendingUp, Award
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditSection {
  probingLevel: 'Excellent' | 'Good' | 'Adequate' | 'Weak' | 'Poor';
  probingLevelScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  panelSummaryAccuracy: 'Accurate' | 'Partially Accurate' | 'Inaccurate';
  panelSummaryNote: string;
}

interface AuditAnalysis {
  leakageVerdict: string;
  overallAuditSummary?: string;
  leakageSummary?: string; // legacy
  screeningAudit?: {
    verdict: string;
    summary: string;
    gaps: string[];
  };
  l1Audit?: AuditSection;
  l2Audit?: AuditSection;
  rejectionReasonValidity?: string;
  rejectionReasonAnalysis?: string;
  crossArtifactEvidence?: string[];
  evidence?: string[]; // legacy
  recommendations?: {
    screening: string;
    l1Panel: string;
    l2Panel: string;
    process: string;
  };
}

interface ClientAuditViewProps {
  stageData: {
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
    analysis: AuditAnalysis;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; glow: string }> = {
  'No Leakage':           { label: 'No Leakage',           color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <CheckCircle2 className="w-5 h-5" />, glow: '' },
  'L1 Leakage':           { label: 'L1 Leakage',           color: 'text-orange-300',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  icon: <AlertTriangle className="w-5 h-5" />, glow: '' },
  'L2 Leakage':           { label: 'L2 Leakage',           color: 'text-sky-300',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     icon: <AlertTriangle className="w-5 h-5" />, glow: '' },
  'Joint Failure':        { label: 'Joint Failure',        color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: <XCircle className="w-5 h-5" />,       glow: '' },
  'Unjustified Rejection':{ label: 'Unjustified Rejection', color: 'text-violet-300',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  icon: <Shield className="w-5 h-5" />,         glow: '' },
};

const PROBING_CONFIG: Record<string, { color: string; bg: string; barColor: string; pct: number }> = {
  'Excellent': { color: 'text-emerald-300', bg: 'bg-emerald-500/10', barColor: 'bg-emerald-400', pct: 100 },
  'Good':      { color: 'text-green-300',   bg: 'bg-green-500/10',   barColor: 'bg-green-400',   pct: 80  },
  'Moderate':  { color: 'text-yellow-300',  bg: 'bg-yellow-500/10',  barColor: 'bg-yellow-400',  pct: 60  },
  'Adequate':  { color: 'text-yellow-300',  bg: 'bg-yellow-500/10',  barColor: 'bg-yellow-400',  pct: 60  },
  'Weak':      { color: 'text-red-300',     bg: 'bg-red-500/10',     barColor: 'bg-red-400',     pct: 25  },
  'Poor':      { color: 'text-red-300',     bg: 'bg-red-500/10',     barColor: 'bg-red-400',     pct: 25  },
};

const REJECTION_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  'Valid':           { color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: <XCircle className="w-4 h-4" /> },
  'Partially Valid': { color: 'text-yellow-300',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  icon: <AlertCircle className="w-4 h-4" /> },
  'Invalid':         { color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <CheckCircle2 className="w-4 h-4" /> },
};

const SCREENING_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'Accurate':     { color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  'Missed Gaps':  { color: 'text-orange-300',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  'Over-screened':{ color: 'text-yellow-300',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30' },
};

const ACCURACY_CONFIG: Record<string, { color: string; dot: string }> = {
  'Accurate':           { color: 'text-emerald-400', dot: 'bg-emerald-400' },
  'Partially Accurate': { color: 'text-yellow-400',  dot: 'bg-yellow-400'  },
  'Inaccurate':         { color: 'text-red-400',      dot: 'bg-red-400'    },
};

// ─── Tooltip Helper ─────────────────────────────────────────────────────────

function InfoTooltip({ type, title, content, position = 'top' }: { type: string, title: string, content: React.ReactNode, position?: 'top' | 'bottom-left' | 'bottom-right' }) {
  const containerClasses = position === 'bottom-left' 
    ? 'absolute top-full mt-2 right-0 w-80 origin-top-right'
    : position === 'bottom-right'
    ? 'absolute top-full mt-2 left-0 w-80 origin-top-left'
    : 'absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 origin-bottom';
  const arrowClasses = position === 'bottom-left'
    ? 'absolute bottom-full right-3 -mb-[1px] w-3 h-3 bg-slate-900 border-l border-t border-white/10 rotate-45'
    : position === 'bottom-right'
    ? 'absolute bottom-full left-3 -mb-[1px] w-3 h-3 bg-slate-900 border-l border-t border-white/10 rotate-45'
    : 'absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] w-3 h-3 bg-slate-900 border-r border-b border-white/10 rotate-45';

  return (
    <div className="relative group inline-flex items-center ml-2 align-middle z-20">
      <Info className="w-3.5 h-3.5 text-text-muted hover:text-indigo-400 cursor-help transition-colors" />
      <div className={`${containerClasses} bg-slate-900 border border-white/10 p-4 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 group-hover:z-[100] flex flex-col gap-1.5 text-left`}>
        <span className="text-[10px] uppercase font-black tracking-widest text-indigo-400">{type}</span>
        <span className="text-xs font-bold text-text-primary tracking-normal uppercase-none">{title}</span>
        <span className="text-[11px] text-slate-300 leading-relaxed font-normal normal-case tracking-normal">{content}</span>
        <div className={arrowClasses} />
      </div>
    </div>
  );
}

const PROBING_TOOLTIP_CONTENT = (
  <div className="space-y-2 text-[10px] leading-relaxed">
    <p><strong className="text-emerald-400">Excellent (9-10):</strong> Rigorously tested limits with complex follow-ups and scenarios.</p>
    <p><strong className="text-green-400">Good (7-8):</strong> Dug into details with meaningful follow-ups, minor gaps.</p>
    <p><strong className="text-yellow-400">Moderate (5-6):</strong> Covered basics but accepted surface-level answers; lacked deep follow-ups.</p>
    <p><strong className="text-red-400">Poor (0-4):</strong> Shallow interview or multiple mandatory skills/technologies skipped.</p>
  </div>
);

const VERDICT_TOOLTIP_CONTENT = (
  <div className="space-y-2 text-[10px] leading-relaxed">
    <p><strong className="text-orange-400">L1 Leakage:</strong> L1 panel failed to test critical skills, passing a weak candidate. L1 is at fault even if L2 caught it.</p>
    <p><strong className="text-sky-400">L2 Leakage:</strong> L1 did its job, but L2 failed to probe deeply or ignored gaps, passing an unqualified candidate to the client.</p>
    <p><strong className="text-red-400">Joint Failure:</strong> Both L1 and L2 panels missed the gaps completely. Neither interviewer probed candidate deeply enough.</p>
    <p><strong className="text-emerald-400">No Leakage:</strong> Panels assessed correctly. Client rejection was likely due to subjective/domain fit, not panel failure.</p>
    <p><strong className="text-violet-400">Unjustified Rejection:</strong> Panels correctly passed a qualified candidate, but client rejected them for unfounded reasons.</p>
  </div>
);

const SCREENING_TOOLTIP_CONTENT = (
  <div className="space-y-2 text-[10px] leading-relaxed">
    <p><strong className="text-emerald-400">Accurate:</strong> The screening successfully mapped the candidate's skills and experience to the JD correctly.</p>
    <p><strong className="text-orange-400">Missed Gaps:</strong> The screening missed major misalignments or mandatory skill gaps on the resume, allowing an unqualified candidate to pass through.</p>
    <p><strong className="text-yellow-400">Over-screened:</strong> The screening was excessively strict or rejected qualified candidates based on non-essential criteria.</p>
  </div>
);

const REJECTION_VALIDITY_TOOLTIP_CONTENT = (
  <div className="space-y-2 text-[10px] leading-relaxed">
    <p><strong className="text-red-400">Valid:</strong> The client's rejection reason is fully supported by the L1/L2 transcripts (i.e., the candidate clearly failed or struggled on the technical concepts cited by the client).</p>
    <p><strong className="text-yellow-400">Partially Valid:</strong> The feedback is partially grounded in transcript evidence but includes subjective fit opinions or unlisted JD requirements.</p>
    <p><strong className="text-emerald-400">Invalid:</strong> The client's rejection is contradicted by the transcripts (e.g., the candidate performed excellently on the topics the client claimed they were weak in).</p>
  </div>
);

// ─── Collapsible feedback text ────────────────────────────────────────────────

function FeedbackBox({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="bg-slate-900/60 rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] text-left transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
          Client Feedback Document
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
      </button>
      {open && (
        <div className="p-4 border-t border-white/[0.06] animate-in slide-in-from-top-2 duration-200">
          <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed p-4 bg-white/[0.01] rounded-lg border border-white/[0.04]">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Probing Level Gauge ──────────────────────────────────────────────────────

function ProbingGauge({ level, score }: { level: string; score: number }) {
  const displayLevel = level === 'Adequate' ? 'Moderate' : (level === 'Weak' ? 'Poor' : level);
  const cfg = PROBING_CONFIG[displayLevel] || PROBING_CONFIG['Moderate'];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${cfg.color} ${cfg.bg} border-current/30`}>
          {displayLevel}
        </span>
        <span className="text-xs text-text-muted font-bold">{score}/10</span>
      </div>
      <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cfg.barColor}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );
}

// ─── Panel Audit Card ─────────────────────────────────────────────────────────

function PanelAuditCard({
  title, stageLabel, color, borderColor, bgColor, accentIcon, audit
}: {
  title: string; stageLabel: string; color: string; borderColor: string; bgColor: string;
  accentIcon: React.ReactNode; audit: AuditSection;
}) {
  const accCfg = ACCURACY_CONFIG[audit.panelSummaryAccuracy] || ACCURACY_CONFIG['Accurate'];
  return (
    <div className={`bg-bg-card rounded-2xl border ${borderColor} p-6 space-y-5`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${bgColor} border ${borderColor}`}>
          {accentIcon}
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">
            {stageLabel}
          </p>
          <h3 className={`text-sm font-black ${color} flex items-center`}>
            {title}
            <InfoTooltip type="Audit Type" title={title} content="An AI-driven audit of the panel's questioning depth, coverage of JD skills, and the accuracy of their submitted feedback summary." />
          </h3>
        </div>
      </div>

      {/* Probing Level Gauge */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">
          Probing Level
          <InfoTooltip type="Metric" title="Probing Level" content={PROBING_TOOLTIP_CONTENT} />
        </p>
        <ProbingGauge level={audit.probingLevel} score={audit.probingLevelScore} />
      </div>

      {/* Summary */}
      <div className="bg-white/[0.015] rounded-xl p-4 border border-white/[0.04]">
        <p className="text-xs text-text-secondary leading-relaxed">{audit.summary}</p>
      </div>

      {/* Strengths */}
      {audit.strengths && audit.strengths.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Strengths</p>
          <div className="space-y-1.5">
            {audit.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-text-secondary">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {audit.gaps && audit.gaps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Gaps / Missed Areas</p>
          <div className="space-y-1.5">
            {audit.gaps.map((g, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-text-secondary">{g}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel Summary Accuracy */}
      <div className="pt-3 border-t border-white/[0.06] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accCfg.dot}`} />
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Panel Summary Accuracy</p>
          <span className={`ml-auto text-[10px] font-black ${accCfg.color}`}>{audit.panelSummaryAccuracy}</span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed italic">{audit.panelSummaryNote}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClientAuditView({ stageData }: ClientAuditViewProps) {
  const { feedbackText, analysis: audit, completedAt } = stageData;
  const verdictCfg = VERDICT_CONFIG[audit.leakageVerdict] || VERDICT_CONFIG['No Leakage'];

  // Support both new and legacy schema
  const overallSummary = audit.overallAuditSummary || audit.leakageSummary || '';
  const evidenceList = audit.crossArtifactEvidence || audit.evidence || [];

  const isNewSchema = !!audit.overallAuditSummary;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Master Verdict Banner ────────────────────────────────────────── */}
      <div className={`relative rounded-2xl border ${verdictCfg.border} ${verdictCfg.bg} p-6 shadow-xl ${verdictCfg.glow}`}>
        <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-white/20 to-transparent pointer-events-none rounded-2xl" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${verdictCfg.bg} border ${verdictCfg.border} ${verdictCfg.color}`}>
              {verdictCfg.icon}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-0.5 flex items-center">
                Overall Audit Verdict
                <InfoTooltip position="bottom-right" type="Verdict" title="Overall Audit Verdict" content={VERDICT_TOOLTIP_CONTENT} />
              </p>
              <h2 className={`text-xl font-black ${verdictCfg.color}`}>{audit.leakageVerdict}</h2>
              {completedAt && (
                <p className="text-[10px] text-text-muted mt-0.5">
                  Audited on {new Date(completedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Rejection Reason Validity Badge */}
          {false && isNewSchema && audit.rejectionReasonValidity && (() => {
            const rCfg = REJECTION_CONFIG[audit.rejectionReasonValidity] || REJECTION_CONFIG['Partially Valid'];
            return (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${rCfg.border} ${rCfg.bg}`}>
                <span className={rCfg.color}>{rCfg.icon}</span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-text-muted flex items-center">
                    Rejection Reason
                    <InfoTooltip position="bottom-left" type="Analysis" title="Rejection Reason Validity" content={REJECTION_VALIDITY_TOOLTIP_CONTENT} />
                  </p>
                  <p className={`text-xs font-black ${rCfg.color}`}>{audit.rejectionReasonValidity}</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Overall Summary */}
        {overallSummary && (
          <div className="relative mt-5 pt-5 border-t border-white/[0.08]">
            <p className="text-sm text-text-secondary leading-relaxed">{overallSummary}</p>
          </div>
        )}

      </div>

      {isNewSchema && (
        <>
          {/* ── Stage 1 Screening Audit ─────────────────────────────────── */}
          {audit.screeningAudit && (() => {
            const sCfg = SCREENING_CONFIG[audit.screeningAudit.verdict] || SCREENING_CONFIG['Accurate'];
            return (
              <div className="bg-bg-card rounded-2xl border border-white/[0.06] p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30">
                      <Target className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Stage 1</p>
                      <h3 className="text-sm font-black text-violet-300">Screening Quality Audit</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-black border ${sCfg.color} ${sCfg.bg} ${sCfg.border}`}>
                      {audit.screeningAudit.verdict}
                    </span>
                    <InfoTooltip position="bottom-left" type="Screening" title="Screening Audit Verdicts" content={SCREENING_TOOLTIP_CONTENT} />
                  </div>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed bg-white/[0.015] rounded-xl p-4 border border-white/[0.04]">
                  {audit.screeningAudit.summary}
                </p>
                {audit.screeningAudit.gaps && audit.screeningAudit.gaps.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Screening Gaps</p>
                    <div className="space-y-1.5">
                      {audit.screeningAudit.gaps.map((g, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-text-secondary">{g}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── L1 & L2 Panel Audit Cards ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {audit.l1Audit && (
              <PanelAuditCard
                title="L1 Panel Audit"
                stageLabel="Stage 2 — L1 Interview"
                color="text-orange-300"
                borderColor="border-orange-500/25"
                bgColor="bg-orange-500/10"
                accentIcon={<Activity className="w-4 h-4 text-orange-400" />}
                audit={audit.l1Audit}
              />
            )}
            {audit.l2Audit && (
              <PanelAuditCard
                title="L2 Panel Audit"
                stageLabel="Stage 3 — L2 Interview"
                color="text-sky-300"
                borderColor="border-sky-500/25"
                bgColor="bg-sky-500/10"
                accentIcon={<Zap className="w-4 h-4 text-sky-400" />}
                audit={audit.l2Audit}
              />
            )}
          </div>

          {/* ── Rejection Reason Analysis ────────────────────────────────── */}
          {audit.rejectionReasonAnalysis && (() => {
            const rCfg = REJECTION_CONFIG[audit.rejectionReasonValidity || 'Partially Valid'];
            return (
              <div className={`bg-bg-card rounded-2xl border ${rCfg.border} p-6 space-y-4`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${rCfg.bg} border ${rCfg.border} ${rCfg.color}`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center">
                      Stage 4 Analysis
                    </p>
                    <h3 className={`text-sm font-black ${rCfg.color} flex items-center`}>
                      Client Rejection Reason Validation
                      <InfoTooltip type="Validation Details" title="Rejection Reason Validation" content="A detailed textual analysis confirming whether the client's stated reason for rejection is supported by the evidence in the interview transcripts." />
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-black border ${rCfg.color} ${rCfg.bg} ${rCfg.border}`}>
                      {audit.rejectionReasonValidity}
                    </span>
                    <InfoTooltip position="bottom-left" type="Analysis" title="Rejection Reason Validity" content={REJECTION_VALIDITY_TOOLTIP_CONTENT} />
                  </div>
                </div>
                <div className="bg-white/[0.015] rounded-xl p-4 border border-white/[0.04]">
                  <p className="text-sm text-text-secondary leading-relaxed">{audit.rejectionReasonAnalysis}</p>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── Cross-Artifact Evidence ──────────────────────────────────────── */}
      {false && evidenceList.length > 0 && (
        <div className="bg-bg-card rounded-2xl border border-white/[0.06] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
              <Star className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-sm font-black text-text-primary flex items-center">
              {isNewSchema ? 'Cross-Artifact Evidence' : 'Leakage Evidence Details'}
              <InfoTooltip type="Evidence Base" title="Cross-Artifact Evidence" content="Specific, numbered pieces of evidence pulled directly from the Job Description, Resume, and Interview Transcripts to support the audit verdict." />
            </h3>
            <span className="ml-auto px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black">
              {evidenceList.length} points
            </span>
          </div>
          <div className="space-y-2.5">
            {evidenceList.map((point, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-xl">
                <span className="mt-1.5 w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-indigo-400">{idx + 1}</span>
                </span>
                <p className="text-xs text-text-secondary leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommendations ─────────────────────────────────────────────── */}
      {isNewSchema && audit.recommendations && (
        <div className="bg-bg-card rounded-2xl border border-emerald-500/20 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-black text-emerald-300 flex items-center">
              Actionable Recommendations
              <InfoTooltip type="Guidance" title="Actionable Recommendations" content="AI-generated suggestions for the recruiters and panels on how to improve the process and avoid similar rejections in the future." />
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'screening', label: 'Stage 1 — Screening',    color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
              { key: 'l1Panel',   label: 'Stage 2 — L1 Panel',     color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
              { key: 'l2Panel',   label: 'Stage 3 — L2 Panel',     color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20'    },
              { key: 'process',   label: 'Overall Process',         color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20'},
            ].map(({ key, label, color, bg, border }) => {
              const rec = (audit.recommendations as any)[key];
              if (!rec || rec === 'N/A') return null;
              return (
                <div key={key} className={`${bg} border ${border} rounded-xl p-4 space-y-2`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{rec}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Client Feedback Document ─────────────────────────────────────── */}
      <FeedbackBox text={feedbackText} />

    </div>
  );
}
