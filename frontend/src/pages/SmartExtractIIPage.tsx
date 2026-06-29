import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { pipelineApi } from '@/lib/api/pipeline.api';
import { apiClient } from '@/lib/api/client';
import toast from 'react-hot-toast';
import {
  Upload, FileText, X, CheckCircle, AlertCircle, Loader2,
  Zap, ChevronDown, ChevronUp, FileCode, LayoutDashboard,
  Info, ClipboardList, Shield, Brain, Target, Layers,
} from 'lucide-react';

// ─── Dimension reference table ────────────────────────────────────────────────

const L1_DIMENSIONS = [
  { name: 'Mandatory Skill Coverage',   max: 2.0, focus: 'Probing mandatory technologies explicitly listed in the JD.' },
  { name: 'Technical Depth',            max: 2.0, focus: 'Quality of follow-up questions ("how" and "why").' },
  { name: 'Resume Initial Screening',   max: 2.0, focus: 'Did L1 verify the specific experience and project claims written in the resume?' },
  { name: 'Scenario / Risk Evaluation', max: 2.0, focus: 'Presenting real-world coding / problem-solving scenarios.' },
  { name: 'Framework Knowledge',        max: 1.0, focus: 'Probing specific frameworks mentioned in the JD.' },
  { name: 'Hands-on Validation',        max: 1.0, focus: 'Probing actual coding, tools, and scripting practices.' },
];

const THINKING_STEPS = [
  'Reading L1 interview transcript…',
  'Evaluating Mandatory Skill Coverage…',
  'Assessing Technical Depth & follow-ups…',
  'Checking Resume Initial Screening…',
  'Evaluating Scenario / Risk questions…',
  'Scoring Framework & Hands-on probing…',
  'Running Interview Moderation check…',
  'Generating panel summary report…',
];

// ─── Stage 2 Upload Page ──────────────────────────────────────────────────────

export default function SmartExtractIIPage() {
  const navigate = useNavigate();

  // Form fields
  const [jobId, setJobId]               = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [panelName, setPanelName]       = useState('');
  const [panelEmail, setPanelEmail]     = useState('');
  const [panelId, setPanelId]           = useState('');
  const [l1File, setL1File]             = useState<File | null>(null);

  // Stage 1 check
  const [stage1Data, setStage1Data]     = useState<any>(null);
  const [stage1Loading, setStage1Loading] = useState(false);
  const [stage1Error, setStage1Error]   = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extracted transcript preview
  const [transcriptPreview, setTranscriptPreview] = useState('');
  const [previewOpen, setPreviewOpen]   = useState(false);

  // UI state
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);
  const [progress, setProgress]         = useState(0);
  const [stepIndex, setStepIndex]       = useState(0);
  const [stepVisible, setStepVisible]   = useState(true);
  const [showDimTable, setShowDimTable] = useState(false);

  // ── Auto-check Stage 1 completion ─────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!jobId.trim() || !candidateName.trim()) {
      setStage1Data(null);
      setStage1Error(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setStage1Loading(true);
      setStage1Error(null);
      try {
        const detail = await pipelineApi.getCandidate(jobId.trim(), candidateName.trim());
        if (!detail?.stage1?.completed) {
          setStage1Data(null);
          setStage1Error('Stage 1 (Initial Screening) must be completed before running L1 Scoring.');
        } else {
          setStage1Data(detail.stage1);
          setStage1Error(null);
          // Auto-fill panel info if available
          if (detail.panelName && !panelName)  setPanelName(detail.panelName);
          if (detail.panelEmail && !panelEmail) setPanelEmail(detail.panelEmail);
          if (detail.panelId && !panelId)       setPanelId(detail.panelId);
        }
      } catch {
        setStage1Data(null);
        setStage1Error('Candidate not found. Please complete Stage 1 first.');
      } finally {
        setStage1Loading(false);
      }
    }, 600);
  }, [jobId, candidateName]);

  // ── Extract transcript text on file selection ──────────────────────────────
  useEffect(() => {
    setTranscriptPreview('');
    setPreviewOpen(false);
    if (!l1File) return;
    (async () => {
      try {
        const fd = new FormData();
        fd.append('file', l1File);
        fd.append('jobId', jobId || 'preview');
        const res = await apiClient.post('/api/v1/extract/jd', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (res.data.success) {
          const text = String(res.data.data?.JD ?? '');
          setTranscriptPreview(text);
          if (!text) toast('⚠️ File was uploaded but no text was extracted. Please check the file.', { icon: '⚠️' });
        }
      } catch {
        // Non-fatal — preview just won't show
      }
    })();
  }, [l1File]);

  // ── Progress animation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading) { setProgress(0); setStepIndex(0); setStepVisible(true); return; }
    const prog = setInterval(() => setProgress(p => p >= 94 ? p : p + 1), 900);
    const step = setInterval(() => {
      setStepVisible(false);
      setTimeout(() => { setStepIndex(i => (i + 1) % THINKING_STEPS.length); setStepVisible(true); }, 300);
    }, 3500);
    return () => { clearInterval(prog); clearInterval(step); };
  }, [loading]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!jobId.trim())          return 'JD ID is required.';
    if (!candidateName.trim())  return 'Candidate Name is required.';
    if (stage1Error)            return stage1Error;
    if (!stage1Data)            return 'Please wait for Stage 1 verification to complete.';
    if (!l1File)                return 'Please upload the L1 Interview Transcript.';
    if (!transcriptPreview)     return 'No text could be extracted from the uploaded file. Please upload a valid PDF or DOCX.';
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await pipelineApi.submitStage2({
        jobId: jobId.trim(),
        candidateName: candidateName.trim(),
        panelName, panelEmail, panelId,
        l1Transcript: transcriptPreview,
      });
      setProgress(100);
      setSuccess(true);
      toast.success('✅ L1 Scoring complete — results saved to Dashboard I.');
      setTimeout(() => {
        navigate(`/dashboard-i/candidate?jobId=${encodeURIComponent(jobId.trim())}&candidateName=${encodeURIComponent(candidateName.trim())}&stage=stage2`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'L1 evaluation failed. Please try again.');
      toast.error(err.message || 'L1 evaluation failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Layers className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Stage 2 — L1 Interview Scoring</h1>
              <p className="text-xs text-text-muted">Upload L1 transcript → AI scores 6 dimensions → generates panel report + moderation</p>
            </div>
          </div>
        </div>

        {/* Scoring Dimensions Reference */}
        <div className="bg-bg-card border border-white/[0.06] rounded-xl overflow-hidden">
          <button
            onClick={() => setShowDimTable(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-500">
              <ClipboardList className="w-3.5 h-3.5" />
              L1 Scoring Dimensions — 10.0 pts Total
            </span>
            {showDimTable ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
          </button>
          {showDimTable && (
            <div className="border-t border-white/[0.06] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="text-left px-5 py-2.5 text-text-muted font-semibold uppercase tracking-wider">Parameter</th>
                    <th className="text-left px-4 py-2.5 text-text-muted font-semibold uppercase tracking-wider w-24">Max Score</th>
                    <th className="text-left px-4 py-2.5 text-text-muted font-semibold uppercase tracking-wider">Category Focus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {L1_DIMENSIONS.map(dim => (
                    <tr key={dim.name} className="hover:bg-white/[0.01]">
                      <td className="px-5 py-3 font-semibold text-text-primary">{dim.name}</td>
                      <td className="px-4 py-3 text-orange-400 font-bold">{dim.max.toFixed(1)}</td>
                      <td className="px-4 py-3 text-text-secondary">{dim.focus}</td>
                    </tr>
                  ))}
                  <tr className="bg-orange-500/5">
                    <td className="px-5 py-3 font-extrabold text-text-primary uppercase tracking-wide text-[11px]">Total L1 Score</td>
                    <td className="px-4 py-3 text-orange-400 font-extrabold">10.0</td>
                    <td className="px-4 py-3 text-text-muted text-[11px]">Sum of all 6 dimensions</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Main Form Card */}
        <div className="bg-bg-card border border-white/[0.06] rounded-2xl p-6 space-y-6">

          {/* Identity Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="JD ID *" id="s2-jdid" value={jobId} onChange={setJobId}
              placeholder="e.g. JD123" disabled={loading} />
            <FormField label="Candidate Name *" id="s2-candidate" value={candidateName} onChange={setCandidateName}
              placeholder="e.g. John Doe" disabled={loading} />
          </div>

          {/* Stage 1 verification status */}
          {(stage1Loading || stage1Error || stage1Data) && (
            <div className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm ${
              stage1Loading ? 'bg-white/[0.02] border-white/[0.06] text-text-muted' :
              stage1Error   ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                              'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              {stage1Loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" /> :
               stage1Error   ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> :
                               <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                {stage1Loading && <span>Verifying Stage 1 completion…</span>}
                {stage1Error   && <span>{stage1Error}</span>}
                {stage1Data    && (
                  <span>
                    Stage 1 verified ✓ — JD content ({stage1Data.jdText?.length ?? 0} chars) and resume ({stage1Data.resumeText?.length ?? 0} chars) ready.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Panel Info */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">Panel Member Info <span className="font-normal normal-case text-text-muted/50">(optional)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Panel Name" id="s2-panelname" value={panelName} onChange={setPanelName}
                placeholder="e.g. Amit Kumar" disabled={loading} />
              <FormField label="Panel Email" id="s2-panelemail" value={panelEmail} onChange={setPanelEmail}
                placeholder="e.g. amit@company.com" disabled={loading} />
              <FormField label="Panel ID" id="s2-panelid" value={panelId} onChange={setPanelId}
                placeholder="e.g. PNL-001" disabled={loading} />
            </div>
          </div>

          {/* JD Preview (from Stage 1) */}
          {stage1Data?.jdText && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
                JD Content <span className="ml-1 text-[10px] normal-case font-normal text-emerald-400/80">✓ Auto-filled from Stage 1</span>
              </p>
              <div className="bg-white/[0.02] border border-emerald-500/20 rounded-lg px-4 py-3 text-xs text-text-muted max-h-20 overflow-y-auto leading-relaxed">
                {stage1Data.jdText.slice(0, 500)}{stage1Data.jdText.length > 500 ? '…' : ''}
              </div>
            </div>
          )}

          {/* AI Banner */}
          <div className="flex items-center gap-2.5 p-3 bg-orange-500/5 border border-orange-500/15 rounded-xl text-xs text-orange-400">
            <Brain className="w-4 h-4 shrink-0" />
            <span>After upload, AI will score all 6 dimensions, generate a panel summary, evidence list, and interview moderation report.</span>
          </div>

          {/* L1 Transcript Upload */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">L1 Interview Transcript *</p>
            {!l1File ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-orange-500/30 rounded-xl p-10 cursor-pointer hover:bg-orange-500/5 transition-all group">
                <Upload className="w-8 h-8 mb-3 text-orange-400 opacity-40 group-hover:opacity-70 transition-opacity" />
                <span className="text-sm font-semibold text-orange-400 opacity-60 group-hover:opacity-90">Upload L1 Transcript</span>
                <span className="text-[11px] text-text-muted/50 mt-1">PDF, DOCX — max 25 MB</span>
                <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt"
                  onChange={e => { if (e.target.files?.[0]) { setL1File(e.target.files[0]); setError(null); } }} />
              </label>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-orange-500/5 border border-orange-500/30 rounded-xl">
                <FileText className="w-5 h-5 text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{l1File.name}</p>
                  <p className="text-[11px] text-text-muted">{(l1File.size / 1024).toFixed(1)} KB</p>
                </div>
                {transcriptPreview ? (
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {transcriptPreview.length} chars extracted ✓
                  </span>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                )}
                <button onClick={() => { setL1File(null); setTranscriptPreview(''); setPreviewOpen(false); }}
                  className="text-text-muted hover:text-red-400 transition-colors ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Transcript preview toggle */}
            {transcriptPreview && (
              <div className="bg-bg-card border border-white/[0.06] rounded-xl overflow-hidden">
                <button onClick={() => setPreviewOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs text-text-muted hover:text-text-primary hover:bg-white/[0.02] transition-colors">
                  <span className="flex items-center gap-2 font-semibold">
                    <FileCode className="w-3.5 h-3.5 text-orange-400" />
                    Transcript Preview
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    previewOpen ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : 'text-text-muted bg-white/[0.03] border-white/[0.06]'
                  }`}>
                    {previewOpen ? 'Hide' : 'Show'}
                  </span>
                </button>
                {previewOpen && (
                  <div className="border-t border-white/[0.06] p-4 bg-slate-950/40">
                    <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed p-3 bg-white/[0.01] rounded-lg border border-white/[0.04]">
                      {transcriptPreview.slice(0, 3000)}{transcriptPreview.length > 3000 ? '\n\n[... preview truncated — full text will be scored ...]' : ''}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Moderation info chip */}
          <div className="flex items-center gap-2 text-xs text-text-muted border-l-2 border-orange-500/30 pl-3">
            <Shield className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>Interview Moderation will automatically run to detect any discriminatory or inappropriate panel questions.</span>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && !loading && (
            <div className="flex items-center justify-between p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="w-4 h-4 shrink-0" />
                L1 Scoring complete — results saved. Redirecting…
              </div>
              <button onClick={() => navigate('/dashboard-i')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/30 transition-colors">
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard I
              </button>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <button onClick={handleSubmit} disabled={loading || success}
              className="flex items-center gap-2 px-7 py-3 bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
               : success ? <><CheckCircle className="w-4 h-4" />Submitted</>
               : <><Target className="w-4 h-4" />Upload &amp; Score L1</>}
            </button>
          </div>
        </div>

        {/* Score Legend */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Good', range: '8.0 – 10.0', color: 'emerald', desc: 'Thorough, deep probing across all dimensions.' },
            { label: 'Moderate', range: '5.0 – 7.9', color: 'orange', desc: 'Acceptable coverage with notable gaps.' },
            { label: 'Poor', range: '0.0 – 4.9', color: 'red', desc: 'Insufficient or superficial probing.' },
          ].map(({ label, range, color, desc }) => (
            <div key={label} className={`bg-${color}-500/5 border border-${color}-500/20 rounded-xl p-4 space-y-1`}>
              <p className={`text-xs font-bold text-${color}-400 uppercase tracking-wider`}>{label}</p>
              <p className={`text-sm font-bold text-${color}-300`}>{range}</p>
              <p className="text-[11px] text-text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Full-screen evaluation loader */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-md" />
          <div className="relative z-10 w-full max-w-lg mx-4 animate-in zoom-in-95 duration-300">
            <div className="bg-bg-card border border-white/10 rounded-2xl p-8 space-y-6">
              {/* Header */}
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-6 h-6 text-orange-400 animate-pulse" />
                </div>
                <h3 className="text-lg font-bold text-text-primary">AI L1 Evaluation in Progress</h3>
                <p className="text-xs text-text-muted">Scoring 6 dimensions across 10.0 pts</p>
              </div>
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Progress</span><span>{progress}%</span>
                </div>
                <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              {/* Dimension checklist */}
              <div className="space-y-1.5">
                {L1_DIMENSIONS.map((dim, i) => (
                  <div key={dim.name} className={`flex items-center gap-2.5 text-xs transition-all ${progress > (i + 1) * 14 ? 'text-emerald-400' : 'text-text-muted/40'}`}>
                    {progress > (i + 1) * 14
                      ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      : <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />}
                    <span>{dim.name}</span>
                    <span className="ml-auto text-[10px]">{dim.max.toFixed(1)} pts</span>
                  </div>
                ))}
              </div>
              {/* Thinking step */}
              <p className={`text-center text-sm text-orange-400/80 italic transition-opacity duration-300 ${stepVisible ? 'opacity-100' : 'opacity-0'}`}>
                {THINKING_STEPS[stepIndex]}
              </p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── FormField helper ─────────────────────────────────────────────────────────

function FormField({ label, id, value, onChange, placeholder, disabled }: {
  label: string; id: string; value: string;
  onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-widest text-text-muted">{label}</label>
      <input
        id={id} type="text" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.05] transition-all disabled:opacity-50"
      />
    </div>
  );
}
