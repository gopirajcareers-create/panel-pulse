import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Upload, Loader2, X, AlertCircle, FileCode,
  CheckCircle, Shield, Star, Users, ClipboardCheck, LayoutDashboard, Zap,
  ChevronDown, ChevronUp, Brain, ClipboardList, Target, XCircle
} from 'lucide-react';
import { DocumentAnalysisLoader } from '@/components/common/DocumentAnalysisLoader';
import apiClient from '@/lib/api/client';
import { panelApi } from '@/lib/api/panel.api';
import { pipelineApi } from '@/lib/api/pipeline.api';
import type { UploadRequest } from '@/types/upload.types';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = 'stage1' | 'stage2' | 'stage3' | 'stage4';

interface StageRecord {
  jdId: string;
  candidateName: string;
  jdText: string;
  resumeText: string;
  completedAt: string;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'smart_extract_i_v1';

function buildKey(jdId: string, candidateName: string): string {
  return `${jdId.trim().toLowerCase()}__${candidateName.trim().toLowerCase()}`;
}

function loadRecord(jdId: string, candidateName: string): StageRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const store: Record<string, StageRecord> = JSON.parse(raw);
    return store[buildKey(jdId, candidateName)] ?? null;
  } catch { return null; }
}

function saveRecord(record: StageRecord) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const store: Record<string, StageRecord> = raw ? JSON.parse(raw) : {};
    store[buildKey(record.jdId, record.candidateName)] = record;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

// ─── Stage Config ─────────────────────────────────────────────────────────────

const STAGES: { id: Stage; label: string; shortLabel: string; color: string; borderColor: string; bgColor: string; desc: string }[] = [
  { id: 'stage1', label: 'Initial Screening', shortLabel: 'Stage 1', color: 'text-violet-400', borderColor: 'border-violet-500/40', bgColor: 'bg-violet-500/10', desc: 'Upload Resume & JD to verify initial eligibility' },
  { id: 'stage2', label: 'L1 Scoring Split', shortLabel: 'Stage 2', color: 'text-orange-400', borderColor: 'border-orange-500/40', bgColor: 'bg-orange-500/10', desc: 'Upload L1 Transcript — AI scores all 6 dimensions (10 pts)' },
  { id: 'stage3', label: 'L2 Scoring Split', shortLabel: 'Stage 3', color: 'text-sky-400', borderColor: 'border-sky-500/40', bgColor: 'bg-sky-500/10', desc: 'Upload L2 Transcript — AI scores all 8 dimensions (10 pts)' },
  { id: 'stage4', label: 'Client Audit', shortLabel: 'Stage 4', color: 'text-emerald-400', borderColor: 'border-emerald-500/40', bgColor: 'bg-emerald-500/10', desc: 'Upload Client Feedback — AI audits L1/L2 leakage' },
];

// ─── L1 Dimension Reference Table ────────────────────────────────────────────

const L1_DIMENSIONS = [
  { name: 'Mandatory Skill Coverage',   max: 2.0, focus: 'Probing mandatory technologies explicitly listed in the JD.' },
  { name: 'Technical Depth',            max: 2.0, focus: 'Quality of follow-up questions ("how" and "why").' },
  { name: 'Resume Initial Screening',   max: 2.0, focus: 'Did L1 verify the specific experience and project claims written in the resume?' },
  { name: 'Scenario / Risk Evaluation', max: 2.0, focus: 'Presenting real-world coding / problem-solving scenarios.' },
  { name: 'Framework Knowledge',        max: 1.0, focus: 'Probing specific frameworks mentioned in the JD.' },
  { name: 'Hands-on Validation',        max: 1.0, focus: 'Probing actual coding, tools, and scripting practices.' },
];

// ─── L2 Dimension Reference Table ────────────────────────────────────────────

const L2_DIMENSIONS = [
  { name: 'Mandatory Skill Coverage',   max: 2.0, focus: 'Verification of high-level mandatory requirements from the JD.' },
  { name: 'Technical Depth',            max: 2.0, focus: 'System design, design patterns, scalability, and latency probing.' },
  { name: 'Resume Screening & Handoff', max: 2.0, focus: 'Did the L2 panel check the unverified gaps passed in L1?' },
  { name: 'Scenario / Risk Evaluation', max: 1.0, focus: 'Real-world architecture failure, scaling, and recovery scenarios.' },
  { name: 'Framework Knowledge',        max: 1.0, focus: 'Advanced framework patterns (concurrency, lifecycle, hooks).' },
  { name: 'Hands-on Validation',        max: 1.0, focus: 'Validation of real-world implementation and deployments.' },
  { name: 'Leadership Evaluation',      max: 0.5, focus: 'Team leadership, mentoring, and strategic ownership.' },
  { name: 'Behavioral Assessment',      max: 0.5, focus: 'Conflict resolution, communication, and adaptability.' },
];

// ─── Evaluation progress steps ────────────────────────────────────────────────

const THINKING_STEPS = [
  'Reading interview transcripts…',
  'Analyzing panel behavior patterns…',
  'Evaluating technical depth & probing…',
  'Cross-referencing JD mandatory skills…',
  'Computing competency scores…',
  'Generating evaluation summary…',
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface SmartExtractIFormProps {
  initialJobId?: string;
  initialCandidateName?: string;
  initialStage?: Stage;
}

export function SmartExtractIForm({
  initialJobId = '',
  initialCandidateName = '',
  initialStage = 'stage1'
}: SmartExtractIFormProps = {}) {
  const navigate = useNavigate();
  const [activeStage, setActiveStage] = useState<Stage>(initialStage || 'stage1');
  const [completedStages, setCompletedStages] = useState<Set<Stage>>(new Set());

  // Shared identity fields
  const [jdId, setJdId] = useState(initialJobId);
  const [candidateName, setCandidateName] = useState(initialCandidateName);
  const [panelName, setPanelName] = useState('');
  const [panelEmail, setPanelEmail] = useState('');
  const [panelId, setPanelId] = useState('');

  // File state per stage
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [l1File, setL1File] = useState<File | null>(null);
  const [l2File, setL2File] = useState<File | null>(null);
  const [feedbackFile, setFeedbackFile] = useState<File | null>(null);

  // L1 transcript preview state
  const [l1ExtractedText, setL1ExtractedText] = useState('');
  const [l1Extracting, setL1Extracting] = useState(false);
  const [l1PreviewOpen, setL1PreviewOpen] = useState(false);
  const [showDimTable, setShowDimTable] = useState(false);
  const [showL2DimTable, setShowL2DimTable] = useState(false);
  const [candidateStatus, setCandidateStatus] = useState<'Selected' | 'Rejected' | null>(null);
  const [stage3CandidateStatus, setStage3CandidateStatus] = useState<string | null>(null);

  // L2 transcript preview state
  const [l2ExtractedText, setL2ExtractedText] = useState('');
  const [l2Extracting, setL2Extracting] = useState(false);
  const [l2PreviewOpen, setL2PreviewOpen] = useState(false);

  // Auto-filled JD from Stage 1
  const [autoJdText, setAutoJdText] = useState('');
  const [verifyRecord, setVerifyRecord] = useState<StageRecord | null>(null);
  const [showVerifyPopup, setShowVerifyPopup] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [evaluationStage, setEvaluationStage] = useState<'extracting' | 'analyzing' | 'validating' | 'scoring'>('extracting');
  const [stepIndex, setStepIndex] = useState(0);
  const [stepVisible, setStepVisible] = useState(true);

  // Progress animation
  useEffect(() => {
    if (!loading) {
      setEvaluationProgress(0);
      setStepIndex(0);
      setStepVisible(true);
      setEvaluationStage('extracting');
      return;
    }
    const progressInterval = setInterval(() => {
      setEvaluationProgress(prev => {
        if (prev >= 95) return prev;
        const n = prev + 1;
        if (n < 25) setEvaluationStage('extracting');
        else if (n < 50) setEvaluationStage('analyzing');
        else if (n < 75) setEvaluationStage('validating');
        else setEvaluationStage('scoring');
        return n;
      });
    }, 900);
    const stepInterval = setInterval(() => {
      setStepVisible(false);
      setTimeout(() => { setStepIndex(i => (i + 1) % THINKING_STEPS.length); setStepVisible(true); }, 300);
    }, 3000);
    return () => { clearInterval(progressInterval); clearInterval(stepInterval); };
  }, [loading]);

  // Auto-fill JD and load completed stages when key is recognised
  useEffect(() => {
    if (!jdId.trim() || !candidateName.trim()) {
      setAutoJdText('');
      setVerifyRecord(null);
      setShowVerifyPopup(false);
      setCompletedStages(new Set());
      setStage3CandidateStatus(null);
      return;
    }

    // First try loading from localStorage for instantaneous UI
    const rec = loadRecord(jdId, candidateName);
    if (rec) {
      setAutoJdText(rec.jdText);
      setVerifyRecord(rec);
      if (activeStage !== 'stage1') {
        setShowVerifyPopup(true);
      }
    }

    // Fetch candidate details to check completed stages and update JD from DB
    pipelineApi.getCandidate(jdId, candidateName)
      .then(detail => {
        if (detail) {
          const completed = new Set<Stage>(detail.completedStages as Stage[]);
          setCompletedStages(completed);
          if (detail.stage1) {
            setAutoJdText(detail.stage1.jdText);
            const updatedRec = {
              jdId: detail.jobId,
              candidateName: detail.candidateName,
              jdText: detail.stage1.jdText,
              resumeText: detail.stage1.resumeText,
              completedAt: detail.stage1.completedAt
            };
            setVerifyRecord(updatedRec);
            saveRecord(updatedRec); // sync to localStorage
            if (activeStage !== 'stage1') {
              setShowVerifyPopup(true);
            }
          }
          if (detail.stage3?.candidateStatus) {
            setStage3CandidateStatus(detail.stage3.candidateStatus);
          } else {
            setStage3CandidateStatus(null);
          }
        }
      })
      .catch(() => {
        // Candidate not in DB yet, reset completed stages except what might be in local
        if (rec) {
          setCompletedStages(new Set(['stage1']));
        } else {
          setCompletedStages(new Set());
        }
      });
  }, [jdId, candidateName, activeStage]);

  const handleStageChange = (stage: Stage) => {
    setActiveStage(stage); setError(null); setSuccess(false); setShowVerifyPopup(false);
  };

  // ── Extract file text ─────────────────────────────────────────────────────

  const extractFileText = async (file: File, endpoint: 'jd' | 'l1' | 'l2'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('jobId', jdId);
    formData.append('panelName', panelName);
    formData.append('candidateName', candidateName);
    formData.append('panelMemberId', panelId);
    formData.append('panelMemberEmail', panelEmail);
    formData.append('jdText', autoJdText);
    const res = await apiClient.post(`/api/v1/extract/${endpoint}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (!res.data.success) throw new Error(res.data.error || 'Extraction failed');
    if (endpoint === 'jd') return String(res.data.data?.JD ?? '');
    if (endpoint === 'l1') return String(res.data.data?.['L1 Transcript'] ?? '');
    return String(res.data.data?.['L2 Rejected Reason'] ?? res.data.data?.['L2 Rejection Reason'] ?? '');
  };

  // ── Stage 1 ───────────────────────────────────────────────────────────────

  const handleStage1Submit = async () => {
    if (!jdId.trim() || !candidateName.trim()) { setError('JD ID and Candidate Name are required.'); return; }
    if (!resumeFile && !jdFile) { setError('Please upload at least Resume or JD file.'); return; }
    setLoading(true); setError(null);
    const warnings: string[] = [];
    try {
      let jdText = '', resumeText = '';

      // Extract JD text
      if (jdFile) {
        try {
          jdText = await extractFileText(jdFile, 'jd');
          if (!jdText) warnings.push('JD text could not be extracted from the file.');
        } catch (e: any) {
          warnings.push(`JD extraction failed: ${e.message}`);
        }
      }

      // Extract Resume text (uses same /extract/jd endpoint for raw text)
      if (resumeFile) {
        try {
          const fd = new FormData();
          fd.append('file', resumeFile);
          fd.append('jobId', jdId);
          const res = await apiClient.post('/api/v1/extract/jd', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (res.data.success) {
            resumeText = String(res.data.data?.JD ?? '');
            if (!resumeText) warnings.push('Resume text could not be extracted from the file.');
          }
        } catch (e: any) {
          warnings.push(`Resume extraction failed: ${e.message}`);
        }
      }

      // Submit to pipeline (backend now accepts empty texts gracefully)
      await pipelineApi.submitStage1({
        jobId: jdId.trim(),
        candidateName: candidateName.trim(),
        panelName,
        panelEmail,
        panelId,
        jdText,
        resumeText
      });

      saveRecord({ jdId: jdId.trim(), candidateName: candidateName.trim(), jdText, resumeText, completedAt: new Date().toISOString() });
      setCompletedStages(prev => new Set([...prev, 'stage1']));
      setSuccess(true);

      if (warnings.length > 0) {
        toast.success('Stage 1 stored — but some files could not be read. Check warnings below.');
        setError(`⚠️ Warnings: ${warnings.join(' | ')} — The record was saved; re-upload corrected files to update.`);
      } else {
        toast.success('Stage 1 complete — JD & Resume stored on backend.');
      }

      // Navigate to CandidateResultsPage so user can see Stage 1 output
      setTimeout(() => {
        navigate(`/dashboard-i/candidate?jobId=${encodeURIComponent(jdId.trim())}&candidateName=${encodeURIComponent(candidateName.trim())}`);
      }, 1500);

    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
    } finally { setLoading(false); }
  };

  // ── Stage 2 ───────────────────────────────────────────────────────────────

  const handleStage2Submit = async () => {
    if (!jdId.trim() || !candidateName.trim()) { setError('JD ID and Candidate Name are required.'); return; }
    if (!l1File) { setError('Please upload the L1 Transcript.'); return; }
    if (!autoJdText) { setError('JD not found — please complete Stage 1 first before uploading L1 transcript.'); return; }
    setLoading(true); setError(null);
    try {
      // Extract transcript text (if not already done)
      let l1Text = l1ExtractedText;
      if (!l1Text) {
        l1Text = await extractFileText(l1File, 'l1');
        setL1ExtractedText(l1Text);
      }
      if (!l1Text) {
        setError('No text could be extracted from the L1 transcript file. Please upload a readable PDF or DOCX.');
        setLoading(false);
        return;
      }
      // Score via pipelineApi (calls new l1ScoringService on backend)
      await pipelineApi.submitStage2({
        jobId: jdId.trim(),
        candidateName: candidateName.trim(),
        panelName,
        panelEmail,
        panelId,
        l1Transcript: l1Text
      });
      setEvaluationProgress(100);
      setCompletedStages(prev => new Set([...prev, 'stage2']));
      setSuccess(true);
      toast.success('✅ L1 Scoring complete — results saved.');
      // Auto-navigate to Stage 2 results
      setTimeout(() => {
        navigate(`/dashboard-i/candidate?jobId=${encodeURIComponent(jdId.trim())}&candidateName=${encodeURIComponent(candidateName.trim())}&stage=stage2`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'L1 evaluation failed');
      toast.error(err.message || 'L1 evaluation failed');
    } finally { setLoading(false); }
  };

  // ── Stage 3 ───────────────────────────────────────────────────────────────

  const handleStage3Submit = async () => {
    if (!jdId.trim() || !candidateName.trim()) { setError('JD ID and Candidate Name are required.'); return; }
    if (!l2File) { setError('Please upload the L2 Transcript.'); return; }
    if (!autoJdText) { setError('JD not found for this candidate. Please complete Stage 1 first.'); return; }
    if (!candidateStatus) { setError('Candidate Status (Selected or Rejected) is mandatory.'); return; }
    setLoading(true); setError(null);
    try {
      let l2Text = l2ExtractedText;
      if (!l2Text) {
        const fd = new FormData();
        fd.append('file', l2File);
        fd.append('jobId', jdId || 'preview');
        const res = await apiClient.post('/api/v1/extract/jd', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (res.data.success) {
          l2Text = String(res.data.data?.JD ?? '');
          setL2ExtractedText(l2Text);
        }
      }
      if (!l2Text) {
        setError('No text could be extracted from the L2 transcript file. Please upload a readable PDF or DOCX.');
        setLoading(false);
        return;
      }
      await pipelineApi.submitStage3({
        jobId: jdId.trim(),
        candidateName: candidateName.trim(),
        panelName,
        panelEmail,
        panelId,
        l2Transcript: l2Text,
        candidateStatus: candidateStatus
      });
      setEvaluationProgress(100);
      setCompletedStages(prev => new Set([...prev, 'stage3']));
      setSuccess(true);
      toast.success('✅ L2 Scoring complete — results saved.');
      // Auto-navigate to Stage 3 results
      setTimeout(() => {
        navigate(`/dashboard-i/candidate?jobId=${encodeURIComponent(jdId.trim())}&candidateName=${encodeURIComponent(candidateName.trim())}&stage=stage3`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'L2 evaluation failed');
      toast.error(err.message || 'L2 evaluation failed');
    } finally { setLoading(false); }
  };

  // ── Stage 4 ───────────────────────────────────────────────────────────────

  const handleStage4Submit = async () => {
    if (!jdId.trim() || !candidateName.trim()) { setError('JD ID and Candidate Name are required.'); return; }
    if (!feedbackFile) { setError('Please upload the Client Feedback file.'); return; }
    setLoading(true); setError(null);
    try {
      // Extract client feedback text (reuse JD extractor for text)
      const fd = new FormData();
      fd.append('file', feedbackFile);
      fd.append('jobId', jdId);
      const res = await apiClient.post('/api/v1/extract/jd', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data.success) throw new Error(res.data.error || 'Feedback extraction failed');
      const feedbackText = String(res.data.data?.JD ?? '');

      await pipelineApi.submitStage4({
        jobId: jdId.trim(),
        candidateName: candidateName.trim(),
        feedbackText,
        feedbackFileName: feedbackFile.name
      });

      setCompletedStages(prev => new Set([...prev, 'stage4']));
      setSuccess(true);
      toast.success('Client Audit uploaded and audited successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Feedback upload failed');
    } finally { setLoading(false); }
  };

  const handleSubmit = () => {
    if (activeStage === 'stage1') return handleStage1Submit();
    if (activeStage === 'stage2') return handleStage2Submit();
    if (activeStage === 'stage3') return handleStage3Submit();
    return handleStage4Submit();
  };

  const cfg = STAGES.find(s => s.id === activeStage)!;

  return (
    <div className="space-y-6">
      {/* Stage Selector */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s, idx) => {
          const isActive = activeStage === s.id;
          const isDone = completedStages.has(s.id);
          return (
            <button key={s.id} onClick={() => handleStageChange(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                isActive ? `${s.bgColor} ${s.color} ${s.borderColor} shadow-sm`
                : isDone ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-white/[0.03] text-text-muted border-white/[0.07] hover:bg-white/[0.06] hover:text-text-primary'
              }`}>
              {isDone
                ? <CheckCircle className="w-4 h-4" />
                : <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${isActive ? `${s.borderColor} ${s.color} ${s.bgColor}` : 'border-white/20 text-text-muted'}`}>{idx + 1}</span>
              }
              <span className="hidden sm:inline">{s.shortLabel}:</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stage Panel */}
      <div className={`bg-bg-card rounded-xl border ${cfg.borderColor} p-6 space-y-6`}>

        {/* Stage Header */}
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${cfg.bgColor}`}>
            {activeStage === 'stage1' ? <Shield className={`w-5 h-5 ${cfg.color}`} />
            : activeStage === 'stage2' ? <Star className={`w-5 h-5 ${cfg.color}`} />
            : activeStage === 'stage3' ? <Users className={`w-5 h-5 ${cfg.color}`} />
            : <ClipboardCheck className={`w-5 h-5 ${cfg.color}`} />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">{cfg.shortLabel}: {cfg.label}</h2>
            <p className="text-xs text-text-muted mt-0.5">{cfg.desc}</p>
          </div>
        </div>

        {/* Identity Fields */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'JD ID', value: jdId, setter: setJdId, placeholder: 'e.g. JD2001', isPk: true },
              { label: 'Candidate Name', value: candidateName, setter: setCandidateName, placeholder: 'e.g. John Doe', isPk: true },
            ].map(({ label, value, setter, placeholder, isPk }) => (
              <div key={label}>
                <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                  {label} <span className="text-red-400">*</span>
                  {isPk && <span className="ml-2 text-[10px] normal-case tracking-normal text-primary/70 font-normal">(Primary Key)</span>}
                </label>
                <input type="text" value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                  className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white/[0.01] p-4 rounded-lg border border-white/[0.05]">
            {[
              { label: 'Panel Name', value: panelName, setter: setPanelName, placeholder: 'e.g. Amit Kumar', type: 'text' },
              { label: 'Panel Email', value: panelEmail, setter: setPanelEmail, placeholder: 'e.g. amit@hr.tech', type: 'email' },
              { label: 'Panel ID', value: panelId, setter: setPanelId, placeholder: 'e.g. PN01', type: 'text' },
            ].map(({ label, value, setter, placeholder, type }) => (
              <div key={label}>
                <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">{label}</label>
                <input type={type} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                  className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors" />
              </div>
            ))}
          </div>
        </div>

        {/* Verify Popup for Stages 2/3/4 */}
        {showVerifyPopup && verifyRecord && activeStage !== 'stage1' && (
          <VerifyCard record={verifyRecord} onClose={() => setShowVerifyPopup(false)} />
        )}

        {/* Auto-filled JD */}
        {activeStage !== 'stage1' && autoJdText && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted">
              JD Content <span className="ml-1 text-[10px] normal-case tracking-normal text-emerald-400/80 font-normal">✓ Auto-filled from Stage 1</span>
            </label>
            <div className="bg-white/[0.02] border border-emerald-500/20 rounded-lg px-4 py-3 text-xs text-text-muted max-h-24 overflow-y-auto leading-relaxed">
              {autoJdText.slice(0, 500)}{autoJdText.length > 500 ? '…' : ''}
            </div>
          </div>
        )}

        {/* AI info banner for Stage 2/3 */}
        {(activeStage === 'stage2' || activeStage === 'stage3') && (
          <div className="flex items-center gap-2 text-xs text-text-muted italic border-l-2 border-primary/30 pl-3">
            <Zap className="w-3 h-3 text-primary shrink-0" />
            <span className="text-primary font-semibold">
              After upload, AI will automatically score all dimensions and generate panel summary, evidence, and moderation report.
            </span>
          </div>
        )}

        {/* Stage 2 — L1 Dimension Table */}
        {activeStage === 'stage2' && (
          <div className="bg-white/[0.015] border border-orange-500/15 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowDimTable(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-500">
                <ClipboardList className="w-3.5 h-3.5" />
                L1 Scoring Dimensions — 10.0 pts Total
              </span>
              {showDimTable
                ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
                : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
            </button>
            {showDimTable && (
              <div className="border-t border-white/[0.06] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="text-left px-4 py-2 text-text-muted font-semibold uppercase tracking-wider">Parameter</th>
                      <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider w-20">Max</th>
                      <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">Category Focus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {L1_DIMENSIONS.map(dim => (
                      <tr key={dim.name} className="hover:bg-white/[0.01]">
                        <td className="px-4 py-2.5 font-semibold text-text-primary">{dim.name}</td>
                        <td className="px-3 py-2.5 text-orange-400 font-bold">{dim.max.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-text-muted">{dim.focus}</td>
                      </tr>
                    ))}
                    <tr className="bg-orange-500/5">
                      <td className="px-4 py-2.5 font-extrabold text-text-primary text-[11px] uppercase tracking-wide">Total L1 Score</td>
                      <td className="px-3 py-2.5 text-orange-400 font-extrabold">10.0</td>
                      <td className="px-3 py-2.5 text-text-muted text-[11px]">Sum of all 6 dimensions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}



        {/* Upload Area */}
        {activeStage === 'stage1' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FileSlot label="Resume" accept=".pdf,.docx,.doc" hint="PDF, DOCX" accent="violet" file={resumeFile}
              onChange={e => { if (e.target.files?.[0]) setResumeFile(e.target.files[0]); }} onRemove={() => setResumeFile(null)} />
            <FileSlot label="Job Description (JD)" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv" hint="PDF, DOCX, XLS, CSV" accent="indigo" file={jdFile}
              onChange={e => { if (e.target.files?.[0]) setJdFile(e.target.files[0]); }} onRemove={() => setJdFile(null)} />
          </div>
        )}
        {activeStage === 'stage2' && (
          <div className="space-y-3">
            {/* L1 file slot with auto-extraction */}
            {!l1File ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-orange-500/30 rounded-xl p-10 cursor-pointer hover:bg-orange-500/5 transition-all group">
                <Upload className="w-7 h-7 mb-2 text-orange-400 opacity-40 group-hover:opacity-70 transition-opacity" />
                <span className="text-sm font-semibold text-orange-400 opacity-60 group-hover:opacity-90">Upload L1 Transcript</span>
                <span className="text-[11px] text-text-muted/50 mt-1">PDF, DOCX — interview transcript file</span>
                <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setL1File(file);
                    setL1ExtractedText('');
                    setL1PreviewOpen(false);
                    setError(null);
                    // Auto-extract on file select
                    setL1Extracting(true);
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      fd.append('jobId', jdId || 'preview');
                      const res = await apiClient.post('/api/v1/extract/jd', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                      if (res.data.success) setL1ExtractedText(String(res.data.data?.JD ?? ''));
                    } catch { /* non-fatal */ }
                    finally { setL1Extracting(false); }
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-orange-500/5 border border-orange-500/30 rounded-xl">
                <FileText className="w-5 h-5 text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{l1File.name}</p>
                  <p className="text-[11px] text-text-muted">{(l1File.size / 1024).toFixed(1)} KB</p>
                </div>
                {l1Extracting
                  ? <Loader2 className="w-4 h-4 animate-spin text-orange-400 shrink-0" />
                  : l1ExtractedText
                    ? <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">{l1ExtractedText.length} chars ✓</span>
                    : <span className="text-[10px] text-orange-400/60 italic">extracting…</span>}
                <button onClick={() => { setL1File(null); setL1ExtractedText(''); setL1PreviewOpen(false); }}
                  className="text-text-muted hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Transcript preview toggle */}
            {l1ExtractedText && (
              <div className="bg-white/[0.015] border border-white/[0.06] rounded-xl overflow-hidden">
                <button onClick={() => setL1PreviewOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-text-muted hover:text-text-primary hover:bg-white/[0.02] transition-colors">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <FileCode className="w-3.5 h-3.5 text-orange-400" />
                    Transcript Preview
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    l1PreviewOpen ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : 'text-text-muted bg-white/[0.03] border-white/[0.06]'
                  }`}>{l1PreviewOpen ? 'Hide' : 'Show'}</span>
                </button>
                {l1PreviewOpen && (
                  <div className="border-t border-white/[0.06] p-4 bg-slate-950/40">
                    <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed p-3 bg-white/[0.01] rounded-lg border border-white/[0.04]">
                      {l1ExtractedText.slice(0, 3000)}{l1ExtractedText.length > 3000 ? '\n\n[... preview truncated — full text will be scored ...]' : ''}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {activeStage === 'stage3' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                Candidate Status <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setCandidateStatus('Selected')}
                  className={`py-3 px-4 rounded-lg text-sm font-semibold border transition-all ${
                    candidateStatus === 'Selected'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                      : 'bg-white/[0.02] border-white/10 text-text-muted hover:bg-white/[0.04] hover:text-text-primary'
                  }`}
                >
                  Selected
                </button>
                <button
                  type="button"
                  onClick={() => setCandidateStatus('Rejected')}
                  className={`py-3 px-4 rounded-lg text-sm font-semibold border transition-all ${
                    candidateStatus === 'Rejected'
                      ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-sm shadow-red-500/10'
                      : 'bg-white/[0.02] border-white/10 text-text-muted hover:bg-white/[0.04] hover:text-text-primary'
                  }`}
                >
                  Rejected
                </button>
              </div>
            </div>

            {/* L2 file slot with auto-extraction */}
            {!l2File ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-sky-500/30 rounded-xl p-10 cursor-pointer hover:bg-sky-500/5 transition-all group">
                <Upload className="w-7 h-7 mb-2 text-sky-400 opacity-40 group-hover:opacity-70 transition-opacity" />
                <span className="text-sm font-semibold text-sky-400 opacity-60 group-hover:opacity-90">Upload L2 Transcript</span>
                <span className="text-[11px] text-text-muted/50 mt-1">PDF, DOCX — interview transcript file</span>
                <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setL2File(file);
                    setL2ExtractedText('');
                    setL2PreviewOpen(false);
                    setError(null);
                    setL2Extracting(true);
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      fd.append('jobId', jdId || 'preview');
                      const res = await apiClient.post('/api/v1/extract/jd', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                      if (res.data.success) setL2ExtractedText(String(res.data.data?.JD ?? ''));
                    } catch { /* non-fatal */ }
                    finally { setL2Extracting(false); }
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-sky-500/5 border border-sky-500/30 rounded-xl">
                <FileText className="w-5 h-5 text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{l2File.name}</p>
                  <p className="text-[11px] text-text-muted">{(l2File.size / 1024).toFixed(1)} KB</p>
                </div>
                {l2Extracting
                  ? <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                  : l2ExtractedText
                    ? <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">{l2ExtractedText.length} chars ✓</span>
                    : <span className="text-[10px] text-sky-400/60 italic">extracting…</span>}
                <button onClick={() => { setL2File(null); setL2ExtractedText(''); setL2PreviewOpen(false); }}
                  className="text-text-muted hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Transcript preview toggle */}
            {l2ExtractedText && (
              <div className="bg-white/[0.015] border border-white/[0.06] rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                <button onClick={() => setL2PreviewOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-text-muted hover:text-text-primary hover:bg-white/[0.02] transition-colors">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <FileCode className="w-3.5 h-3.5 text-sky-400" />
                    Transcript Preview
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    l2PreviewOpen ? 'text-sky-400 bg-sky-500/10 border-sky-500/20' : 'text-text-muted bg-white/[0.03] border-white/[0.06]'
                  }`}>{l2PreviewOpen ? 'Hide' : 'Show'}</span>
                </button>
                {l2PreviewOpen && (
                  <div className="border-t border-white/[0.06] p-4 bg-slate-950/40">
                    <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed p-3 bg-white/[0.01] rounded-lg border border-white/[0.04]">
                      {l2ExtractedText.slice(0, 3000)}{l2ExtractedText.length > 3000 ? '\n\n[... preview truncated — full text will be scored ...]' : ''}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {activeStage === 'stage4' && (
          <div className="space-y-4">
            {stage3CandidateStatus && (
              <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                stage3CandidateStatus === 'Selected' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {stage3CandidateStatus === 'Selected' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                Stage 3 L2 Panel Decision: Candidate {stage3CandidateStatus}
              </div>
            )}
            <FileSlot label="Client Feedback" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv" hint="PDF, DOCX, XLS, CSV" accent="emerald" file={feedbackFile}
              onChange={e => { if (e.target.files?.[0]) setFeedbackFile(e.target.files[0]); }} onRemove={() => setFeedbackFile(null)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { label: 'L1 Leakage', desc: 'L1 missed critical checks — L1 failed to probe.', color: 'orange' },
                { label: 'L2 Leakage', desc: 'L2 missed critical checks — L2 failed to probe.', color: 'sky' },
                { label: 'Joint Failure', desc: 'Both L1 & L2 missed critical checks.', color: 'red' },
                { label: 'No Leakage', desc: 'Both probed correctly — subjective client mismatch.', color: 'emerald' },
              ].map(({ label, desc, color }) => (
                <div key={label} className={`p-2.5 rounded-lg border border-${color}-500/30 bg-${color}-500/5`}>
                  <p className={`text-[11px] font-semibold text-${color}-400 mb-0.5`}>{label}</p>
                  <p className="text-[11px] text-text-muted">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* Success */}
        {success && !loading && (
          <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {activeStage === 'stage1' ? 'Stage 1 complete — JD & Resume stored for all stages.'
               : activeStage === 'stage2' ? 'L1 Scoring complete — results saved to Dashboard.'
               : activeStage === 'stage3' ? 'L2 Scoring complete — results saved to Dashboard.'
               : 'Client Audit uploaded.'}
            </div>
            <button onClick={() => navigate('/dashboard-i')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 border border-primary/30 text-primary rounded-lg text-xs font-semibold hover:bg-primary/30 transition-colors">
              <LayoutDashboard className="w-3.5 h-3.5" />View in Dashboard
            </button>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end">
          <button onClick={handleSubmit} disabled={loading || (activeStage === 'stage3' && !candidateStatus)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50 ${cfg.bgColor} ${cfg.color} border ${cfg.borderColor} hover:opacity-90`}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
            : success ? <><CheckCircle className="w-4 h-4" />Submitted</>
            : <><FileCode className="w-4 h-4" />
              {activeStage === 'stage1' ? 'Upload & Store' :
               activeStage === 'stage2' ? 'Upload & Score L1' :
               activeStage === 'stage3' ? 'Upload & Score L2' :
               'Upload Client Feedback'}</>}
          </button>
        </div>
      </div>

      {/* Full-Screen Evaluation Loader */}
      {loading && (activeStage === 'stage2' || activeStage === 'stage3') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-md" style={{ backdropFilter: 'blur(12px)' }} />
          <div className="relative z-10 w-full max-w-3xl mx-4 animate-in zoom-in-95 duration-300">
            <div className="bg-bg-card/95 border border-white/10 rounded-2xl shadow-2xl p-8">
              <DocumentAnalysisLoader stage={evaluationStage} progress={evaluationProgress} showTimeEstimate={true} size="lg" />
              <p className={`text-center text-sm text-text-muted mt-4 transition-opacity duration-300 ${stepVisible ? 'opacity-100' : 'opacity-0'}`}>
                {THINKING_STEPS[stepIndex]}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── File Upload Slot ─────────────────────────────────────────────────────────

type Accent = 'violet' | 'indigo' | 'orange' | 'sky' | 'emerald';
const ACCENT_MAP: Record<Accent, { border: string; bg: string; text: string; hoverBg: string }> = {
  violet:  { border: 'border-violet-500/40',  bg: 'bg-violet-500/5',  text: 'text-violet-400',  hoverBg: 'hover:bg-violet-500/10' },
  indigo:  { border: 'border-indigo-500/40',  bg: 'bg-indigo-500/5',  text: 'text-indigo-400',  hoverBg: 'hover:bg-indigo-500/10' },
  orange:  { border: 'border-orange-500/40',  bg: 'bg-orange-500/5',  text: 'text-orange-400',  hoverBg: 'hover:bg-orange-500/10' },
  sky:     { border: 'border-sky-500/40',     bg: 'bg-sky-500/5',     text: 'text-sky-400',     hoverBg: 'hover:bg-sky-500/10' },
  emerald: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/5', text: 'text-emerald-400', hoverBg: 'hover:bg-emerald-500/10' },
};

function FileSlot({ label, accept, hint, accent, file, onChange, onRemove }: {
  label: string; accept: string; hint: string; accent: Accent;
  file: File | null; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void;
}) {
  const a = ACCENT_MAP[accent];
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted">
        {label} <span className="ml-1 text-[10px] normal-case tracking-normal text-text-muted/60 font-normal">{hint}</span>
      </label>
      {!file ? (
        <label className={`flex flex-col items-center justify-center border-2 border-dashed ${a.border} rounded-xl p-8 cursor-pointer transition-all ${a.hoverBg} group`}>
          <Upload className={`w-7 h-7 mb-2 opacity-30 group-hover:opacity-60 ${a.text} transition-opacity`} />
          <span className={`text-sm font-medium ${a.text} opacity-50 group-hover:opacity-80`}>Upload {label}</span>
          <span className="text-[11px] text-text-muted/40 mt-1">{hint}</span>
          <input type="file" className="hidden" accept={accept} onChange={onChange} />
        </label>
      ) : (
        <div className={`flex items-center gap-3 p-3.5 ${a.bg} border ${a.border} rounded-xl`}>
          <FileText className={`w-4 h-4 shrink-0 ${a.text}`} />
          <span className="text-sm text-text-primary truncate flex-1">{file.name}</span>
          <button onClick={onRemove} className="text-text-muted hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}

// ─── Verify Popup ─────────────────────────────────────────────────────────────

function VerifyCard({ record, onClose }: { record: StageRecord; onClose: () => void }) {
  const date = new Date(record.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <div className="relative p-4 bg-violet-500/5 border border-violet-500/30 rounded-xl space-y-3 animate-in fade-in duration-200">
      <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-primary">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-text-primary">Stage 1 — Initial Screening Verified</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'JD ID', value: record.jdId },
          { label: 'Candidate', value: record.candidateName },
          { label: 'Completed', value: date },
          { label: 'Status', value: record.resumeText && record.jdText ? 'Resume + JD ✓' : record.jdText ? 'JD ✓' : 'Resume ✓', highlight: true },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="bg-white/[0.03] rounded-lg p-2">
            <p className="text-[10px] uppercase tracking-widest text-text-muted">{label}</p>
            <p className={`text-xs font-semibold truncate ${highlight ? 'text-emerald-400' : 'text-text-primary'}`}>{value}</p>
          </div>
        ))}
      </div>
      {record.jdText && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">JD Preview</p>
          <p className="text-xs text-text-muted line-clamp-3">{record.jdText.slice(0, 300)}{record.jdText.length > 300 ? '…' : ''}</p>
        </div>
      )}
    </div>
  );
}
