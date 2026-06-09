/**
 * L1ResultsView — Stage 2 L1 Scoring Results Display
 *
 * Renders the full L1 evaluation from the new l1ScoringService schema:
 *  - Overall score ring + category badge
 *  - 6-dimension breakdown grid
 *  - Per-dimension evidence & summary
 *  - Panel summary + recommendations
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

const L1_DIMENSIONS = [
  { name: 'Mandatory Skill Coverage',   max: 2.0, color: 'violet' },
  { name: 'Technical Depth',            max: 2.0, color: 'indigo' },
  { name: 'Resume Initial Screening',   max: 2.0, color: 'orange' },
  { name: 'Scenario / Risk Evaluation', max: 2.0, color: 'sky' },
  { name: 'Framework Knowledge',        max: 1.0, color: 'emerald' },
  { name: 'Hands-on Validation',        max: 1.0, color: 'amber' },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-400',  bar: 'bg-violet-500' },
  indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  text: 'text-indigo-400',  bar: 'bg-indigo-500' },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  text: 'text-orange-400',  bar: 'bg-orange-500' },
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400',     bar: 'bg-sky-500' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   bar: 'bg-amber-500' },
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
  const color = score >= 8 ? '#34d399' : score >= 5 ? '#f97316' : '#f87171';
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

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  stageData: any;
  panelName?: string;
}

export function L1ResultsView({ stageData, panelName }: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const ev = stageData?.evaluation;
  if (!ev) {
    return (
      <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 text-center text-text-muted text-sm">
        L1 evaluation output is missing or corrupted.
      </div>
    );
  }

  const score: number     = typeof ev.score === 'number' ? ev.score : 0;
  const category: string  = ev.score_category ?? (score >= 8 ? 'Good' : score >= 5 ? 'Moderate' : 'Poor');
  const moderation        = ev.moderation ?? stageData.moderation ?? null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Row 1: Score Ring + Dimension Grid ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Score Card */}
        <div className="lg:col-span-1 bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 group relative">
              <h3 className="text-sm font-bold text-text-primary">Panel Efficiency</h3>
              <Info className="w-3.5 h-3.5 text-text-muted cursor-help" />
              <div className="absolute left-0 top-full mt-2 w-60 p-3 bg-[#111118] border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[11px] space-y-1.5">
                <p className="font-bold text-text-primary text-xs mb-1">L1 Score Categories</p>
                <p><span className="text-emerald-400 font-semibold">Good (8.0–10.0):</span> Thorough probing across all dimensions.</p>
                <p><span className="text-orange-400 font-semibold">Moderate (5.0–7.9):</span> Acceptable, with some gaps.</p>
                <p><span className="text-red-400 font-semibold">Poor (0.0–4.9):</span> Insufficient or superficial probing.</p>
              </div>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${categoryStyles(category)}`}>
              {category}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <ScoreRing score={score} />
            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted mb-0.5">L1 Score</p>
                <p className="text-2xl font-bold text-text-primary leading-none">
                  {score.toFixed(1)}<span className="text-sm font-normal text-text-muted"> / 10.0</span>
                </p>
              </div>
              {ev.score_percent != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-text-muted mb-0.5">Match</p>
                  <p className="text-base font-bold text-orange-400">{ev.score_percent}%</p>
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

          {/* Confidence */}
          {ev.confidence != null && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-muted mb-1.5">AI Confidence</p>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.round((ev.confidence ?? 0) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-text-muted mt-1">{Math.round((ev.confidence ?? 0) * 100)}%</p>
            </div>
          )}

          {/* Moderation quick badge */}
          {moderation && (
            <ModerationBadge compliance={moderation.overall_compliance ?? 'pass'} />
          )}
        </div>

        {/* Dimension Grid */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {L1_DIMENSIONS.map(dim => {
              const sc = typeof ev.categories?.[dim.name] === 'number' ? ev.categories[dim.name] : 0;
              const pct = Math.round((sc / dim.max) * 100);
              const clr = COLOR_MAP[dim.color] ?? COLOR_MAP.orange;
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
            <Brain className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-text-primary">Panel Performance Summary</h3>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {ev.panel_summary || ev.overall_verdict || 'Panel summary not available.'}
          </p>
        </div>

        {/* Recommendations */}
        <div className="bg-bg-card rounded-xl border border-white/[0.06] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-text-primary">Improvement Recommendations</h3>
          </div>
          {Array.isArray(ev.recommendations) && ev.recommendations.length > 0 ? (
            <ul className="space-y-2.5">
              {ev.recommendations.map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary">
                  <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No specific recommendations available.</p>
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
            <p className="text-sm font-semibold text-text-primary">Interview Moderation</p>
            <p className="text-xs text-text-muted">Moderation analysis was not available for this evaluation.</p>
          </div>
        </div>
      )}

      {/* ── Row 4: Transcript collapsible ──────────────────────────────────── */}
      {stageData.l1Transcript && (
        <div className="bg-bg-card border border-white/[0.06] rounded-xl overflow-hidden">
          <button onClick={() => setTranscriptOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-text-primary hover:bg-white/[0.02] transition-colors">
            <span className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-orange-400" />
              Raw L1 Interview Transcript
            </span>
            {transcriptOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
          </button>
          {transcriptOpen && (
            <div className="border-t border-white/[0.06] p-5">
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {stageData.l1Transcript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dimension Card ───────────────────────────────────────────────────────────

function DimensionCard({ name, score, max, pct, colorCls, evidence, summary }: {
  name: string; score: number; max: number; pct: number;
  colorCls: { bg: string; border: string; text: string; bar: string };
  evidence: string[]; summary: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-bg-card border ${colorCls.border} rounded-xl p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-text-primary leading-snug">{name}</p>
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
          <h3 className="text-sm font-bold text-text-primary">Interview Moderation</h3>
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
