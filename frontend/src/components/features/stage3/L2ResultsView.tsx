/**
 * L2ResultsView — Stage 3 L2 Scoring Results Display
 *
 * Renders the full L2 evaluation from the new l2ScoringService schema:
 *  - Overall score ring + category badge
 *  - 8-dimension breakdown grid (with ⓘ tooltips)
 *  - Per-dimension evidence & summary
 *  - Panel summary + recommendations (with ⓘ tooltips)
 *  - Candidate Status badge (Selected/Rejected)
 *  - Interview Moderation card
 *  - Raw transcript collapsible
 */

import React, { useState } from 'react';
import {
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Shield, ShieldCheck, ShieldAlert, AlertTriangle,
  Brain, Star, Zap, Target, FileCode, Info,
} from 'lucide-react';

// ─── Dimension Config ─────────────────────────────────────────────────────────

const L2_DIMENSIONS = [
  {
    name: 'Mandatory Skill Coverage',
    max: 2.0,
    color: 'sky',
    tooltip: 'Verification of high-level mandatory requirements from the Job Description. A high score means the panel explicitly checked all critical technical requisites in detail.',
  },
  {
    name: 'Technical Depth',
    max: 2.0,
    color: 'teal',
    tooltip: 'System design, design patterns, scalability, latency, performance tuning, and architecture-level probing. Checks if the panel pushed for deep engineering decisions.',
  },
  {
    name: 'Resume Screening & Handoff',
    max: 2.0,
    color: 'cyan',
    tooltip: 'Did the L2 panel verify the candidate\'s specific resume claims and project history? Also checks if they followed up on unverified gaps or handoff items from the L1 interview.',
  },
  {
    name: 'Scenario / Risk Evaluation',
    max: 1.0,
    color: 'indigo',
    tooltip: 'Real-world architecture failure, scaling limits, disaster recovery, concurrency bottlenecks, or system downtime recovery scenarios.',
  },
  {
    name: 'Framework Knowledge',
    max: 1.0,
    color: 'violet',
    tooltip: 'Probing advanced framework patterns and internal workings (concurrency patterns, lifecycle, hook internals, dependency injection, caching).',
  },
  {
    name: 'Hands-on Validation',
    max: 1.0,
    color: 'emerald',
    tooltip: 'Verification of real-world implementation experience, code review practices, CI/CD pipelines, automated testing strategies, and deployments.',
  },
  {
    name: 'Leadership Evaluation',
    max: 0.5,
    color: 'orange',
    tooltip: 'Probing team leadership, mentoring other developers, design ownership, technical roadmap contributions, and stakeholder collaboration.',
  },
  {
    name: 'Behavioral Assessment',
    max: 0.5,
    color: 'pink',
    tooltip: 'Evaluating conflict resolution, professional communication, adaptability under pressure, handling ambiguity, and team culture fit.',
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400',     bar: 'bg-sky-500' },
  teal:    { bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    text: 'text-teal-400',    bar: 'bg-teal-500' },
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    text: 'text-cyan-400',    bar: 'bg-cyan-500' },
  indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  text: 'text-indigo-400',  bar: 'bg-indigo-500' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-400',  bar: 'bg-violet-500' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  text: 'text-orange-400',  bar: 'bg-orange-500' },
  pink:    { bg: 'bg-pink-500/10',    border: 'border-pink-500/30',    text: 'text-pink-400',    bar: 'bg-pink-500' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryStyles(cat: string | null) {
  if (cat === 'Good')     return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
  if (cat === 'Moderate') return 'bg-orange-500/15 border-orange-500/30 text-orange-300';
  return 'bg-red-500/15 border-red-500/30 text-red-300';
}

function ScoreRing({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const r = 36, circ = 2 * Math.PI * r;
  const strokeDash = (pct / 100) * circ;
  const color = score >= 8 ? '#38bdf8' : score >= 5 ? '#f97316' : '#f87171'; // L2 Sky theme color for good
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${strokeDash} ${circ}`} strokeLinecap="round" strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 1.2s ease' }} />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="15" fontWeight="700">
        {score.toFixed(1)}
      </text>
    </svg>
  );
}

// ─── Inline Tooltip helper ────────────────────────────────────────────────────

function InfoTooltip({ text, children, position = 'right' }: { text?: string; children?: React.ReactNode; position?: 'right' | 'top' | 'right-down' }) {
  const positionClasses = {
    'right': 'left-full top-1/2 -translate-y-1/2 ml-2',
    'top': 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    'right-down': 'left-full top-0 ml-2'
  }[position];

  return (
    <div className="relative group inline-flex items-center">
      <button
        type="button"
        className="text-text-muted hover:text-sky-400 transition-colors cursor-help p-0.5"
        aria-label="More information"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      <div className={`absolute z-50 w-72 bg-[#0d0d14] border border-white/10 rounded-xl p-3.5 shadow-2xl
        opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 text-[11px] leading-relaxed text-slate-300
        ${positionClasses}`}>
        {children || text}
        {/* Arrow */}
        {position === 'right' && (
          <div className="absolute top-1/2 -translate-y-1/2 right-full translate-x-px w-2 h-2 bg-[#0d0d14] border-l border-b border-white/10 rotate-45" />
        )}
        {position === 'top' && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-px w-2 h-2 bg-[#0d0d14] border-r border-b border-white/10 rotate-45" />
        )}
        {position === 'right-down' && (
          <div className="absolute top-2 right-full translate-x-px w-2 h-2 bg-[#0d0d14] border-l border-b border-white/10 rotate-45" />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  stageData: any;
  panelName?: string;
}

export function L2ResultsView({ stageData, panelName }: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const ev = stageData?.evaluation;
  if (!ev) {
    return (
      <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 text-center text-text-muted text-sm">
        L2 evaluation output is missing or corrupted.
      </div>
    );
  }

  const score: number     = typeof ev.score === 'number' ? ev.score : 0;
  const category: string  = ev.score_category ?? (score >= 8 ? 'Good' : score >= 5 ? 'Moderate' : 'Poor');
  const moderation        = ev.moderation ?? stageData.moderation ?? null;

  // Candidate status (Selected/Rejected)
  const rawStatus = stageData?.candidateStatus || ev.candidate_status || 'Selected';
  const isSelected = rawStatus === 'Selected' || rawStatus === 'Select';
  const statusBadge = isSelected ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-wide">
      Selected
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 uppercase tracking-wide">
      Rejected
    </span>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Row 1: Score Ring + Dimension Grid ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Score Card */}
        <div className="lg:col-span-1 bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 group relative">
                <h3 className="text-sm font-bold text-text-primary">Panel Efficiency</h3>
                <Info className="w-3.5 h-3.5 text-text-muted cursor-help" />
                <div className="absolute left-0 top-full mt-2 w-60 p-3 bg-[#111118] border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[11px] space-y-1.5">
                  <p className="font-bold text-text-primary text-xs mb-1">L2 Score Categories</p>
                  <p><span className="text-sky-400 font-semibold">Good (8.0–10.0):</span> Thorough probing across L2 dimensions.</p>
                  <p><span className="text-orange-400 font-semibold">Moderate (5.0–7.9):</span> Acceptable, with some gaps.</p>
                  <p><span className="text-red-400 font-semibold">Poor (0.0–4.9):</span> Insufficient or superficial L2 probing.</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${categoryStyles(category)}`}>
                  {category}
                </span>
                {statusBadge}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ScoreRing score={score} />
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-text-muted mb-0.5">L2 Score</p>
                  <p className="text-2xl font-bold text-text-primary leading-none">
                    {score.toFixed(1)}<span className="text-xs font-normal text-text-muted"> / 10.0</span>
                  </p>
                </div>
                {ev.score_percent != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-muted mb-0.5">Match</p>
                    <p className="text-sm font-bold text-sky-400">{ev.score_percent}%</p>
                  </div>
                )}
                {panelName && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-muted mb-0.5">Panel</p>
                    <p className="text-xs text-text-primary font-semibold truncate max-w-[110px]">{panelName}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Moderation quick badge */}
          {moderation && (
            <div className="mt-4">
              <ModerationBadge compliance={moderation.overall_compliance ?? 'pass'} />
            </div>
          )}
        </div>

        {/* Dimension Grid */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {L2_DIMENSIONS.map(dim => {
              const sc = typeof ev.categories?.[dim.name] === 'number' ? ev.categories[dim.name] : 0;
              const pct = Math.round((sc / dim.max) * 100);
              const clr = COLOR_MAP[dim.color] ?? COLOR_MAP.sky;
              const evLines: string[] = Array.isArray(ev.evidence?.[dim.name]) ? ev.evidence[dim.name] : [];
              const summary: string = ev.dimension_summaries?.[dim.name] ?? '';
              return (
                <DimensionCard
                  key={dim.name}
                  name={dim.name}
                  score={sc}
                  max={dim.max}
                  pct={pct}
                  colorCls={clr}
                  evidence={evLines}
                  summary={summary}
                  tooltip={dim.tooltip}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 2: Panel Summary + Recommendations ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel Summary */}
        <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-text-primary">Panel Performance Summary</h3>
            <InfoTooltip
              position="top"
              text="The AI reads the full L2 transcript and generates a qualitative summary of how well the L2 panel member conducted the interview — covering technical depth, design probing, leadership verification, and alignment. It evaluates the interviewer."
            />
          </div>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {ev.panel_summary || ev.overall_verdict || 'Panel summary not available.'}
          </p>
        </div>

        {/* Recommendations */}
        <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-bold text-text-primary">Improvement Recommendations</h3>
            <InfoTooltip
              position="top"
              text="Based on L2 scores and identified gaps, the AI generates specific, actionable recommendations for the panel member to improve their L2 interview technique — focusing on system design, scenarios, or leadership evaluation methods."
            />
          </div>
          {Array.isArray(ev.recommendations) && ev.recommendations.length > 0 ? (
            <ul className="space-y-2.5">
              {ev.recommendations.map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary">
                  <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No L2 recommendations available.</p>
          )}
        </div>
      </div>

      {/* ── Row 3: Moderation Card ─────────────────────────────────────────── */}
      {moderation ? (
        <FullModerationCard moderation={moderation} />
      ) : (
        <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 flex items-center gap-3">
          <Shield className="w-5 h-5 text-text-muted" />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-text-primary">Interview Moderation</p>
              <InfoTooltip position="right-down">
                <div className="space-y-2">
                  <p className="font-semibold text-text-primary text-xs">Interview Moderation</p>
                  <p className="text-text-secondary text-[11px] leading-normal">
                    Analyzes the L2 interview transcript to check for compliance and identify potentially biased, discriminatory, or inappropriate questions.
                  </p>
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <p className="font-semibold text-text-primary text-[10px] uppercase tracking-wider">Status Levels:</p>
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 font-bold shrink-0 text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">Pass</span>
                      <span className="text-text-secondary text-[10px] leading-snug">No discriminatory or inappropriate questions detected.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold shrink-0 text-[10px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Warning</span>
                      <span className="text-text-secondary text-[10px] leading-snug">Borderline or indirect compliance concerns flagged for review.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-red-400 font-bold shrink-0 text-[10px] bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">Fail</span>
                      <span className="text-text-secondary text-[10px] leading-snug">Potentially discriminatory or inappropriate questions explicitly detected.</span>
                    </div>
                  </div>
                </div>
              </InfoTooltip>
            </div>
            <p className="text-xs text-text-muted">Moderation analysis was not available for this evaluation.</p>
          </div>
        </div>
      )}

      {/* ── Row 4: Transcript collapsible ──────────────────────────────────── */}
      {stageData.l2Transcript && (
        <div className="bg-bg-card border border-white/[0.06] rounded-xl overflow-hidden">
          <button onClick={() => setTranscriptOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-text-primary hover:bg-white/[0.02] transition-colors">
            <span className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-sky-400" />
              Raw L2 Interview Transcript
            </span>
            {transcriptOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
          </button>
          {transcriptOpen && (
            <div className="border-t border-white/[0.06] p-5">
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {stageData.l2Transcript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dimension Card ───────────────────────────────────────────────────────────

function DimensionCard({ name, score, max, pct, colorCls, evidence, summary, tooltip }: {
  name: string; score: number; max: number; pct: number;
  colorCls: { bg: string; border: string; text: string; bar: string };
  evidence: string[]; summary: string; tooltip: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-bg-card border ${colorCls.border} rounded-xl p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs font-bold text-text-primary leading-snug truncate">{name}</p>
          {/* Info tooltip */}
          <div className="relative group flex-shrink-0">
            <button className="text-text-muted hover:text-sky-400 transition-colors cursor-help" aria-label={`About ${name}`}>
              <Info className="w-3.5 h-3.5" />
            </button>
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-60 bg-[#0d0d14] border border-white/10 rounded-xl p-3.5 shadow-2xl
              opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 text-[11px] leading-relaxed text-slate-300">
              {tooltip}
              <div className="absolute top-1/2 -translate-y-1/2 right-full translate-x-px w-2 h-2 bg-[#0d0d14] border-l border-b border-white/10 rotate-45" />
            </div>
          </div>
        </div>
        <span className={`shrink-0 text-xs font-bold ${colorCls.text}`}>{score.toFixed(1)}/{max.toFixed(1)}</span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full ${colorCls.bar} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
      {/* Summary */}
      {summary && <p className="text-[11px] text-text-muted leading-relaxed">{summary}</p>}
      {/* Evidence toggle */}
      {evidence.length > 0 && (
        <button onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${colorCls.text} hover:opacity-80 transition-opacity`}>
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {open ? 'Hide Evidence' : `Show Evidence (${evidence.length})`}
        </button>
      )}
      {open && (
        <ul className="space-y-1.5 animate-in fade-in duration-200">
          {evidence.map((e, i) => (
            <li key={i} className="text-[11px] text-text-secondary italic border-l-2 border-white/10 pl-2.5 leading-relaxed">
              "{e}"
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Moderation Badge (compact for ScoreCard) ─────────────────────────────────

function ModerationBadge({ compliance }: { compliance: 'pass' | 'warning' | 'fail' }) {
  const cfg = {
    pass:    { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: 'Moderation PASS', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
    warning: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Moderation WARNING', cls: 'bg-orange-500/15 border-orange-500/30 text-orange-300' },
    fail:    { icon: <ShieldAlert className="w-3.5 h-3.5" />, label: 'Moderation FAIL', cls: 'bg-red-500/15 border-red-500/30 text-red-300' },
  }[compliance] ?? { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: 'PASS', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' };

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${cfg.cls}`}>
      {cfg.icon}<span>{cfg.label}</span>
    </div>
  );
}

// ─── Full Moderation Card ─────────────────────────────────────────────────────

const MOD_CATEGORIES = [
  { key: 'age',            label: 'Age' },
  { key: 'marital_status', label: 'Marital Status' },
  { key: 'religion',       label: 'Religion' },
  { key: 'gender',         label: 'Gender' },
  { key: 'race_ethnicity', label: 'Race / Ethnicity' },
  { key: 'disability',     label: 'Disability' },
  { key: 'language_region',label: 'Language / Region' },
];

function FullModerationCard({ moderation }: { moderation: any }) {
  const compliance = moderation.overall_compliance ?? 'pass';
  const headerCfg = {
    pass:    { icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />, label: 'All Clear — No Issues Detected', cls: 'border-emerald-500/20 bg-emerald-500/5' },
    warning: { icon: <AlertTriangle className="w-5 h-5 text-orange-400" />, label: 'Warning — Some Borderline Questions Found', cls: 'border-orange-500/20 bg-orange-500/5' },
    fail:    { icon: <ShieldAlert className="w-5 h-5 text-red-400" />, label: 'Fail — Discriminatory Questions Detected', cls: 'border-red-500/20 bg-red-500/5' },
  }[compliance] ?? { icon: <Shield className="w-5 h-5 text-text-muted" />, label: 'Moderation Analysis', cls: 'border-white/[0.06]' };

  return (
    <div className={`bg-bg-card rounded-xl border ${headerCfg.cls} overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] ${headerCfg.cls}`}>
        {headerCfg.icon}
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-text-primary">Interview Moderation</h3>
            <InfoTooltip position="right-down">
              <div className="space-y-2">
                <p className="font-semibold text-text-primary text-xs">Interview Moderation</p>
                <p className="text-text-secondary text-[11px] leading-normal">
                  Analyzes the L2 interview transcript to check for compliance and identify potentially biased, discriminatory, or inappropriate questions.
                </p>
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <p className="font-semibold text-text-primary text-[10px] uppercase tracking-wider">Status Levels:</p>
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold shrink-0 text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">Pass</span>
                    <span className="text-text-secondary text-[10px] leading-snug">No discriminatory or inappropriate questions detected.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-bold shrink-0 text-[10px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Warning</span>
                    <span className="text-text-secondary text-[10px] leading-snug">Borderline or indirect compliance concerns flagged for review.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-red-400 font-bold shrink-0 text-[10px] bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">Fail</span>
                    <span className="text-text-secondary text-[10px] leading-snug">Potentially discriminatory or inappropriate questions explicitly detected.</span>
                  </div>
                </div>
              </div>
            </InfoTooltip>
          </div>
          <p className="text-xs text-text-muted">{headerCfg.label}</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold uppercase border ${
          compliance === 'pass' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
          : compliance === 'warning' ? 'bg-orange-500/15 border-orange-500/30 text-orange-300'
          : 'bg-red-500/15 border-red-500/30 text-red-300'
        }`}>{compliance}</span>
      </div>

      {/* Summary */}
      {moderation.summary && (
        <div className="px-5 py-3 text-xs text-text-muted border-b border-white/[0.04]">
          {moderation.summary}
        </div>
      )}

      {/* Category flags */}
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {MOD_CATEGORIES.map(({ key, label }) => {
            const flag = moderation.flags?.[key];
            if (!flag) return null;
            const detected = flag.detected;
            const severity = flag.severity ?? 'none';
            const sevColor = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : severity === 'low' ? 'yellow' : 'emerald';
            return (
              <div key={key} className={`rounded-xl border p-3 space-y-1.5 ${
                detected ? `bg-${sevColor}-500/5 border-${sevColor}-500/20` : 'bg-white/[0.01] border-white/[0.06]'
              }`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-text-primary">{label}</span>
                  {detected
                    ? <span className={`text-[10px] font-bold uppercase text-${sevColor}-400`}>{severity}</span>
                    : <span className="text-[10px] text-emerald-400 font-bold">✓ CLEAR</span>}
                </div>
                {detected && flag.evidence?.length > 0 && (
                  <p className="text-[10px] text-text-muted italic leading-relaxed line-clamp-2">
                    "{flag.evidence[0]}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
