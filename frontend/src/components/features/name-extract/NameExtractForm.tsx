import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Upload,
  Loader2,
  X,
  AlertCircle,
  FileCode,
  Zap,
  Play,
  CheckCircle
} from 'lucide-react';
import { DocumentAnalysisLoader } from '@/components/common/DocumentAnalysisLoader';

const THINKING_STEPS = [
  'Reading interview transcripts...',
  'Analyzing panel behavior patterns...',
  'Evaluating technical depth & probing...',
  'Cross-referencing L2 rejection reasons...',
  'Computing competency scores...',
  'Generating evaluation summary...',
];
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import apiClient from '@/lib/api/client';
import { panelApi } from '@/lib/api/panel.api';
import type { UploadRequest } from '@/types/upload.types';

interface ExtractionResult {
  data: any;
  type: 'jd' | 'l1' | 'l2';
  fileName: string;
}

export function NameExtractForm() {
  const navigate = useNavigate();

  const [jobId, setJobId] = useState('');
  const [panelName, setPanelName] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [panelMemberId, setPanelMemberId] = useState('');
  const [panelMemberEmail, setPanelMemberEmail] = useState('');
  const [jdText, setJdText] = useState('');
  
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [l1File, setL1File] = useState<File | null>(null);
  const [l2File, setL2File] = useState<File | null>(null);
  
  const [loading, setLoading] = useState<Record<string, boolean>>({
    jd: false,
    l1: false,
    l2: false
  });
  
  const [results, setResults] = useState<Record<string, ExtractionResult | null>>({
    jd: null,
    l1: null,
    l2: null
  });

  const [error, setError] = useState<string | null>(null);

  // Evaluation state
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationScore, setEvaluationScore] = useState<number | null>(null);
  const [evaluationCategory, setEvaluationCategory] = useState<string | null>(null);

  // Progress tracking
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [evaluationStage, setEvaluationStage] = useState<'extracting' | 'analyzing' | 'validating' | 'scoring'>('extracting');

  // Thinking steps animation
  const [stepIndex, setStepIndex] = useState(0);
  const [stepVisible, setStepVisible] = useState(true);

  useEffect(() => {
    if (!evaluationLoading) {
      setStepIndex(0);
      setStepVisible(true);
      setEvaluationProgress(0);
      setEvaluationStage('extracting');
      return;
    }

    // Simulate progress over ~90 seconds (typical evaluation time)
    const progressInterval = setInterval(() => {
      setEvaluationProgress(prev => {
        if (prev >= 95) return prev; // Stop at 95%, complete on API response

        const newProgress = prev + 1;

        // Update stage based on progress
        if (newProgress < 25) {
          setEvaluationStage('extracting');
        } else if (newProgress < 50) {
          setEvaluationStage('analyzing');
        } else if (newProgress < 75) {
          setEvaluationStage('validating');
        } else {
          setEvaluationStage('scoring');
        }

        return newProgress;
      });
    }, 900); // ~90 seconds total (90000ms / 100 steps = 900ms per step)

    // Original step animation for backwards compatibility
    const interval = setInterval(() => {
      setStepVisible(false);
      setTimeout(() => {
        setStepIndex(i => (i + 1) % THINKING_STEPS.length);
        setStepVisible(true);
      }, 300);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [evaluationLoading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'jd' | 'l1' | 'l2') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (type === 'jd') setJdFile(file);
      if (type === 'l1') setL1File(file);
      if (type === 'l2') setL2File(file);
      setError(null);
    }
  };

  const handleExtract = async (type: 'jd' | 'l1' | 'l2') => {
    const file = type === 'jd' ? jdFile : type === 'l1' ? l1File : l2File;
    if (!file || !jobId) {
      setError('Please provide at least a Job ID and a file.');
      return;
    }

    setLoading(prev => ({ ...prev, [type]: true }));
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('jobId', jobId);
    formData.append('panelName', panelName);
    formData.append('candidateName', candidateName);
    formData.append('panelMemberId', panelMemberId);
    formData.append('panelMemberEmail', panelMemberEmail);
    formData.append('jdText', jdText);

    try {
      const response = await apiClient.post(`/api/v1/extract/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setResults(prev => ({
          ...prev,
          [type]: {
            data: response.data.data,
            type,
            fileName: `${type.toUpperCase()}_${jobId}.csv`
          }
        }));
        // Auto-populate JD text so L1/L2 extractions receive JD context automatically
        if (type === 'jd' && response.data.data?.JD) {
          setJdText(String(response.data.data.JD));
        }
      } else {
        setError(response.data.error || 'Extraction failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'An error occurred during extraction');
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const downloadCSV = (result: ExtractionResult) => {
    try {
      const data = result.data;
      const l1Headers = ['Job Interview ID', 'Candidate Name', 'role', 'panel_member_id', 'Panel Name', 'panel_member_email', 'JD', 'L1_decision', 'L1 Transcript'];
      const l2Headers = ['Job Interview ID', 'candidate_name', 'role', 'panel_member_id', 'panel_member_name', 'JD', 'l2_decision', 'L2 Rejected Reason'];
      const jdHeaders = ['Job Interview ID', 'JD'];

      let headers = result.type === 'l1' ? l1Headers : result.type === 'l2' ? l2Headers : jdHeaders;
      Object.keys(data).forEach(key => { if (!headers.includes(key)) headers.push(key); });

      const formatValue = (val: any, header?: string) => {
        if (val === null || val === undefined) return '""';
        let str = String(val);
        str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, ' ');

        const isLongField = header === 'L1 Transcript' || header === 'L2 Rejected Reason' || header === 'JD';
        if (isLongField) {
          str = str.replace(/\n+/g, ' ');
          str = str.replace(/  +/g, ' ').trim();
        }
        return `"${str.replace(/"/g, '""')}"`;
      };

      const hRow = headers.map(h => formatValue(h)).join(',');
      const dRow = headers.map(h => formatValue(data[h], h)).join(',');
      const content = hRow + '\r\n' + dRow;

      const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err: any) { setError('Failed to generate CSV: ' + err.message); }
  };

  const removeFile = (type: 'jd' | 'l1' | 'l2') => {
    if (type === 'jd') setJdFile(null);
    if (type === 'l1') setL1File(null);
    if (type === 'l2') setL2File(null);
    setResults(prev => ({ ...prev, [type]: null }));
  };

  const getUploadRequestData = (): UploadRequest | null => {
    if (!jobId || !panelName || !candidateName || !panelMemberId || !panelMemberEmail) {
      setError('Please fill in all mandatory identifier fields for evaluation.');
      return null;
    }

    const jdRes = results.jd?.data?.JD || jdText || '';
    const l1Res = results.l1?.data?.['L1 Transcript'] || '';
    const l2Res = results.l2?.data?.['L2 Rejected Reason'] || '';

    return {
      jobId,
      panelName,
      candidateName,
      jd: String(jdRes),
      l1Transcript: String(l1Res),
      l2RejectionReason: String(l2Res),
      panel_member_id: panelMemberId,
      panel_member_email: panelMemberEmail
    };
  };

  const handleEvaluateDirectly = async () => {
    const data = getUploadRequestData();
    if (!data) return;

    setEvaluationLoading(true);
    setError(null);
    setEvaluationScore(null);
    setEvaluationProgress(0);

    try {
      const result = await panelApi.scorePanel(data);
      // Complete the progress
      setEvaluationProgress(100);
      setEvaluationStage('scoring');

      // Small delay to show 100% before showing result
      setTimeout(() => {
        setEvaluationScore(result.panelEfficiencyScore);
        setEvaluationCategory(result.scoreCategory);
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to evaluate panel.');
      toast.error(err.message || 'Evaluation failed. Please try again.');
    } finally {
      setEvaluationLoading(false);
    }
  };



  const allThreeExtracted = results.jd && results.l1 && results.l2;

  return (
    <div className="space-y-8">
      {/* Extract Details Form Wrapper */}
      <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-400" />
          <h2 className="text-xl font-bold text-text-primary">Extract Details</h2>
        </div>

        {/* Primary Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
              Job / Zoho ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="e.g. JD2001"
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
              Panel Name (Interviewer) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={panelName}
              onChange={(e) => setPanelName(e.target.value)}
              placeholder="e.g. Sarah Smith"
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
              Candidate Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        {/* Panel Details Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.01] p-4 rounded-lg border border-white/5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
              Panel Member ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={panelMemberId}
              onChange={(e) => setPanelMemberId(e.target.value)}
              placeholder="e.g. PN01"
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
              Panel Member Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={panelMemberEmail}
              onChange={(e) => setPanelMemberEmail(e.target.value)}
              placeholder="e.g. arun@hr.tech"
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted italic border-l-2 border-primary/30 pl-3">
          <Zap className="w-3 h-3 text-primary shrink-0" />
          <span className="font-semibold text-primary">Extract JD first — its content is automatically passed to L1 &amp; L2. Once all three are extracted, the Evaluate button will appear.</span>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* JD Extraction */}
          <ExtractionCard
            title="JD"
            subtitle="Support .docx, .pdf"
            file={jdFile}
            onFileChange={(e) => handleFileChange(e, 'jd')}
            onRemove={() => removeFile('jd')}
            onExtract={() => handleExtract('jd')}
            loading={loading.jd}
            result={results.jd}
            onDownload={() => results.jd && downloadCSV(results.jd)}
            accentColor="indigo"
          />
          <ExtractionCard
            title="L1"
            subtitle="Support .docx, .pdf"
            file={l1File}
            onFileChange={(e) => handleFileChange(e, 'l1')}
            onRemove={() => removeFile('l1')}
            onExtract={() => handleExtract('l1')}
            loading={loading.l1}
            result={results.l1}
            onDownload={() => results.l1 && downloadCSV(results.l1)}
            accentColor="orange"
          />
          <ExtractionCard
            title="L2"
            subtitle="Support .docx, .pdf, .xlsx, .csv"
            file={l2File}
            onFileChange={(e) => handleFileChange(e, 'l2')}
            onRemove={() => removeFile('l2')}
            onExtract={() => handleExtract('l2')}
            loading={loading.l2}
            result={results.l2}
            onDownload={() => results.l2 && downloadCSV(results.l2)}
            accentColor="emerald"
          />
        </div>
      </div>

      {/* Action panel conditionally appears after all 3 or whenever there's evaluation success */}
      {(allThreeExtracted || evaluationScore !== null) && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4">
          {/* Header + button row */}
          <div className="sm:flex sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Ready for Evaluation
              </h3>
              <p className="text-sm text-text-muted mt-1">
                Job ID: <span className="text-text-primary font-medium">{jobId || 'N/A'}</span> &bull;
                Candidate: <span className="text-text-primary font-medium">{candidateName || 'N/A'}</span> &bull;
                Panel: <span className="text-text-primary font-medium">{panelName || 'N/A'}</span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-end mt-4 sm:mt-0">
              {evaluationScore !== null ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-4 group"
                >
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-text-muted uppercase tracking-widest">Score</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-text-primary group-hover:text-orange-400 transition-colors">{evaluationScore}</span>
                      <span className="text-xs text-text-muted">/10</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      evaluationCategory === 'Good' ? 'text-emerald-400' :
                      evaluationCategory === 'Moderate' ? 'text-orange-400' :
                      'text-red-400'
                    }`}>
                      {evaluationCategory}
                    </span>
                  </div>
                  <span className="px-6 py-2.5 bg-orange-600 text-white group-hover:bg-orange-700 rounded-lg font-medium text-sm transition-colors shadow-lg shadow-orange-900/40">
                    View in Dashboard
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleEvaluateDirectly}
                  disabled={evaluationLoading}
                  className="px-5 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 shadow-lg shadow-orange-900/40 disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  Evaluate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Loader Modal Overlay */}
      {evaluationLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300">
          {/* Backdrop with blur */}
          <div
            className="absolute inset-0 bg-bg-base/80 backdrop-blur-md animate-in fade-in duration-300"
            style={{ backdropFilter: 'blur(12px)' }}
          />

          {/* Loader Container */}
          <div className="relative z-10 w-full max-w-3xl mx-4 animate-in zoom-in-95 duration-300">
            <div className="bg-bg-card/95 border border-white/10 rounded-2xl shadow-2xl p-8">
              <DocumentAnalysisLoader
                stage={evaluationStage}
                progress={evaluationProgress}
                showTimeEstimate={true}
                size="lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ExtractionCardProps {
  title: string;
  subtitle: string;
  file: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onExtract: () => void;
  loading: boolean;
  result: ExtractionResult | null;
  onDownload: () => void;
  accentColor: 'indigo' | 'orange' | 'emerald';
}

function ExtractionCard({
  title,
  subtitle,
  file,
  onFileChange,
  onRemove,
  onExtract,
  loading,
  result,
  onDownload,
  accentColor
}: ExtractionCardProps) {
  const accentClasses = {
    indigo: 'hover:border-indigo-500/50 bg-indigo-500/5 text-indigo-400',
    orange: 'hover:border-orange-500/50 bg-orange-500/5 text-orange-400',
    emerald: 'hover:border-emerald-500/50 bg-emerald-500/5 text-emerald-400'
  };

  const accentColorValue = accentColor === 'indigo' ? 'text-indigo-400' : accentColor === 'orange' ? 'text-orange-400' : 'text-emerald-400';

  const acceptMimeTypes = title.includes('L2') 
    ? ".pdf,.doc,.docx,.xlsx,.xls,.csv" 
    : ".pdf,.doc,.docx";

  return (
    <div className="flex flex-col space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-[10px] uppercase tracking-widest text-text-muted">{subtitle}</p>
      
      {!file ? (
        <label className={`flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-lg p-6 cursor-pointer transition-all ${accentClasses[accentColor]}`}>
          <Upload className="w-6 h-6 mb-2 opacity-50" />
          <span className="text-xs">Upload Document</span>
          <input type="file" className="hidden" onChange={onFileChange} accept={acceptMimeTypes} />
        </label>
      ) : (
        <div className="flex flex-col space-y-3">
          <div className="flex items-center gap-2 p-3 bg-white/[0.04] border border-white/10 rounded-lg">
            <FileText className={`w-4 h-4 ${accentColorValue}`} />
            <span className="text-xs text-text-primary truncate flex-1">{file.name}</span>
            <button onClick={onRemove} className="text-text-muted hover:text-red-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {!result ? (
            <button
              onClick={onExtract}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <FileCode className="w-4 h-4" />
                  Extract Data
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onDownload}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              title="Download CSV"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          )}
        </div>
      )}
    </div>
  );
}
