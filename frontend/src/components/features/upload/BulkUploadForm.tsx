/**
 * BulkUploadForm
 *
 * One-touch file upload UI for batch panel evaluation.
 *
 * Flow:
 *  Phase 1 – File selection: 3 drop zones (JD CSV, L1 CSV, L2 CSV)
 *  Phase 2 – Preview:        table of detected evaluations + "Evaluate All" button
 *  Phase 3 – Processing:     live progress table with status badges and scores
 *  Phase 4 – Complete:       summary banner + "View Dashboard" link
 */

import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileText,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Info,
  LayoutDashboard,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { useBulkUpload, type EvaluationTask, type BulkParseError } from '@/hooks/use-bulk-upload';

// ── File Drop Zone ────────────────────────────────────────────────────────────

interface DropZoneProps {
  label: string;
  hint: string;
  file: { name: string } | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
  accent: string; // tailwind colour token e.g. 'indigo' | 'orange' | 'emerald'
}

function FileDropZone({ label, hint, file, onFile, onRemove, disabled, accent }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    disabled,
    maxFiles: 1,
    onDrop: (accepted) => accepted[0] && onFile(accepted[0]),
  });

  const accentMap: Record<string, string> = {
    indigo: 'border-indigo-500/50 bg-indigo-500/5',
    orange: 'border-orange-500/50 bg-orange-500/5',
    emerald: 'border-emerald-500/50 bg-emerald-500/5',
  };
  const fileAccentMap: Record<string, string> = {
    indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
    orange: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  };

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">{label}</p>
      {file ? (
        <div
          className={`flex items-center gap-2 border rounded-lg px-3 py-3 ${fileAccentMap[accent] ?? fileAccentMap.indigo}`}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span className="text-sm truncate flex-1">{file.name}</span>
          {!disabled && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="shrink-0 text-text-muted hover:text-red-400 transition-colors"
              aria-label={`Remove ${label} file`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all
            ${isDragActive ? accentMap[accent] ?? accentMap.indigo : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          <FileText className="w-6 h-6 text-text-muted mx-auto mb-2" />
          <p className="text-xs text-text-muted leading-relaxed">{hint}</p>
        </div>
      )}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EvaluationTask['status'] }) {
  const map: Record<string, { label: string; cls: string; spin?: boolean }> = {
    pending:    { label: 'Pending',    cls: 'bg-white/5 text-text-muted border-white/10' },
    checking:   { label: 'Checking',  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', spin: true },
    skipped:    { label: 'Skipped',   cls: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
    processing: { label: 'Processing',cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20', spin: true },
    done:       { label: 'Done ✓',    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    error:      { label: 'Error',     cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.spin && <Loader2 className="w-3 h-3 animate-spin" />}
      {cfg.label}
    </span>
  );
}

// ── Score Chip ────────────────────────────────────────────────────────────────

function ScoreChip({ score, category }: { score?: number; category?: string }) {
  if (score == null) return <span className="text-text-muted text-xs">—</span>;
  const cls =
    category === 'Good'
      ? 'text-emerald-400'
      : category === 'Moderate'
      ? 'text-orange-400'
      : 'text-red-400';
  return (
    <span className={`text-sm font-bold ${cls}`}>
      {score.toFixed(1)}
      <span className="text-xs font-normal ml-1 text-text-muted">{category}</span>
    </span>
  );
}

// ── CSV Format Info ───────────────────────────────────────────────────────────

function CsvFormatInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm text-text-muted">
          <Info className="w-4 h-4" />
          Required CSV column headers
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-white/[0.06] pt-4">
          {[
            {
              label: '📄 JD File (2 columns)',
              accent: 'text-indigo-400',
              cols: [
                { name: 'Job Interview ID', note: 'Unique job identifier' },
                { name: 'Job Description', note: 'Full JD text (can be long)' },
              ],
            },
            {
              label: '🎙 L1 Transcript File (6 columns)',
              accent: 'text-orange-400',
              cols: [
                { name: 'Job Interview ID', note: 'Must match JD file' },
                { name: 'Panel Name', note: 'Interviewer / panel' },
                { name: 'panel_member_id', note: 'Unique panel member ID' },
                { name: 'panel_member_email', note: 'Panel member email' },
                { name: 'Candidate Name', note: 'Interviewee name' },
                { name: 'L1 Transcript', note: 'Full interview transcript' },
              ],
            },
            {
              label: '🚫 L2 Rejection File (4 columns)',
              accent: 'text-emerald-400',
              cols: [
                { name: 'Job Interview ID', note: 'Must match JD file' },
                { name: 'panel_member_id', note: 'Unique panel member ID' },
                { name: 'panel_member_email', note: 'Panel member email' },
                { name: 'L2 Rejected Reason', note: 'Why the candidate was rejected' },
              ],
            },
          ].map((sec) => (
            <div key={sec.label}>
              <p className={`text-xs font-semibold mb-2 ${sec.accent}`}>{sec.label}</p>
              <div className="space-y-1">
                {sec.cols.map((col) => (
                  <div key={col.name} className="flex flex-col">
                    <code className="text-xs text-text-primary bg-white/[0.04] px-1.5 py-0.5 rounded">{col.name}</code>
                    <span className="text-[10px] text-text-muted mt-0.5">{col.note}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Preview / Progress Table ──────────────────────────────────────────────────

function EvaluationTable({
  tasks,
  isRunning,
  onEvaluateSingle,
}: {
  tasks: EvaluationTask[];
  isRunning: boolean;
  onEvaluateSingle?: (taskId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left text-xs font-medium text-text-muted py-2 pr-4 w-8">#</th>
            <th className="text-left text-xs font-medium text-text-muted py-2 pr-4">Job ID</th>
            <th className="text-left text-xs font-medium text-text-muted py-2 pr-4">Panel Name</th>
            <th className="text-left text-xs font-medium text-text-muted py-2 pr-4">Candidate</th>
            <th className="text-left text-xs font-medium text-text-muted py-2 pr-4">Status</th>
            <th className="text-left text-xs font-medium text-text-muted py-2">Score</th>
            <th className="text-right text-xs font-medium text-text-muted py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, idx) => (
            <tr key={task.id} className="border-b border-white/[0.03] hover:bg-white/[0.015]">
              <td className="py-2.5 pr-4 text-text-muted text-xs">{idx + 1}</td>
              <td className="py-2.5 pr-4 font-medium text-text-primary">{task.jobId}</td>
              <td className="py-2.5 pr-4 text-text-muted">{task.panelName}</td>
              <td className="py-2.5 pr-4 text-text-muted">{task.candidateName}</td>
              <td className="py-2.5 pr-4">
                <div className="flex flex-col gap-0.5">
                  <StatusBadge status={task.status} />
                  {task.message && task.status !== 'done' && (
                    <span className="text-[10px] text-text-muted">{task.message}</span>
                  )}
                </div>
              </td>
              <td className="py-2.5">
                <ScoreChip score={task.score} category={task.scoreCategory} />
              </td>
              <td className="py-2.5 text-right">
                {task.status !== 'done' && task.status !== 'processing' && onEvaluateSingle && (
                  <button
                    onClick={() => onEvaluateSingle(task.id)}
                    disabled={isRunning}
                    className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Evaluate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface FileEntry {
  file: File;
  content: string;
}

export function BulkUploadForm() {
  const navigate = useNavigate();
  const { tasks, isRunning, isComplete, summary, progress, parseFiles, startBatch, startSingle, reset } =
    useBulkUpload();

  const [jd, setJd] = useState<FileEntry | null>(null);
  const [l1, setL1] = useState<FileEntry | null>(null);
  const [l2, setL2] = useState<FileEntry | null>(null);
  const [parseErrors, setParseErrors] = useState<BulkParseError[]>([]);

  const jdRef = useRef<FileEntry | null>(null);
  const l1Ref = useRef<FileEntry | null>(null);
  const l2Ref = useRef<FileEntry | null>(null);

  const readFile = async (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result ?? ''));
      reader.onerror = () => rej(new Error('Failed to read file'));
      reader.readAsText(file);
    });

  // Re-parse whenever any file changes (using refs to get latest values)
  const tryParse = useCallback(
    (jdEntry: FileEntry | null, l1Entry: FileEntry | null, l2Entry: FileEntry | null) => {
      if (!jdEntry || !l1Entry || !l2Entry) {
        setParseErrors([]);
        return;
      }
      const errs = parseFiles(jdEntry.content, l1Entry.content, l2Entry.content);
      setParseErrors(errs);
    },
    [parseFiles]
  );

  const handleJd = useCallback(async (file: File) => {
    const content = await readFile(file);
    const entry = { file, content };
    setJd(entry);
    jdRef.current = entry;
    tryParse(entry, l1Ref.current, l2Ref.current);
  }, [tryParse]);

  const handleL1 = useCallback(async (file: File) => {
    const content = await readFile(file);
    const entry = { file, content };
    setL1(entry);
    l1Ref.current = entry;
    tryParse(jdRef.current, entry, l2Ref.current);
  }, [tryParse]);

  const handleL2 = useCallback(async (file: File) => {
    const content = await readFile(file);
    const entry = { file, content };
    setL2(entry);
    l2Ref.current = entry;
    tryParse(jdRef.current, l1Ref.current, entry);
  }, [tryParse]);

  const handleRemoveJd = () => { setJd(null); jdRef.current = null; reset(); setParseErrors([]); };
  const handleRemoveL1 = () => { setL1(null); l1Ref.current = null; reset(); setParseErrors([]); };
  const handleRemoveL2 = () => { setL2(null); l2Ref.current = null; reset(); setParseErrors([]); };

  const handleReset = () => {
    setJd(null); setL1(null); setL2(null);
    jdRef.current = null; l1Ref.current = null; l2Ref.current = null;
    setParseErrors([]);
    reset();
  };

  const allFilesLoaded = !!(jd && l1 && l2);
  const hardErrors = parseErrors.filter((e) => e.level === 'error');
  const warnings = parseErrors.filter((e) => e.level === 'warning');
  const canRun = allFilesLoaded && hardErrors.length === 0 && tasks.length > 0 && !isRunning && !isComplete;

  return (
    <div className="space-y-6">
      {/* ── File Drop Zones ─────────────────────────────────────────────── */}
      <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-400" />
          <h2 className="text-base font-semibold text-text-primary">Upload Files</h2>
          <span className="ml-auto text-xs text-text-muted">All 3 files required</span>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <FileDropZone
            label="JD File"
            hint={'Job descriptions CSV\nJob Interview ID + Job Description'}
            file={jd?.file ?? null}
            onFile={handleJd}
            onRemove={handleRemoveJd}
            disabled={isRunning}
            accent="indigo"
          />
          <FileDropZone
            label="L1 Transcript File"
            hint={'Interview transcripts CSV\nJob ID + Panel + Candidate + Transcript'}
            file={l1?.file ?? null}
            onFile={handleL1}
            onRemove={handleRemoveL1}
            disabled={isRunning}
            accent="orange"
          />
          <FileDropZone
            label="L2 Rejection File"
            hint={'Rejection reasons CSV\nJob Interview ID + L2 Rejected Reason'}
            file={l2?.file ?? null}
            onFile={handleL2}
            onRemove={handleRemoveL2}
            disabled={isRunning}
            accent="emerald"
          />
        </div>

        <CsvFormatInfo />
      </div>

      {/* ── Parse Errors / Warnings ─────────────────────────────────────── */}
      {parseErrors.length > 0 && (
        <div className="space-y-2">
          {hardErrors.map((e, i) => (
            <div
              key={i}
              className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-300"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {e.message}
            </div>
          ))}
          {warnings.map((e, i) => (
            <div
              key={i}
              className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 text-sm text-yellow-300"
            >
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              {e.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Preview + Evaluate Button + Progress ──────────────────────── */}
      {tasks.length > 0 && !isComplete && (
        <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {tasks.length} evaluation{tasks.length !== 1 ? 's' : ''} detected
              </h3>
              {isRunning ? (
                <div className="flex items-center gap-2 mt-1">
                  <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                  <span className="text-sm font-medium text-text-primary">Processing…</span>
                  <span className="text-xs text-text-muted ml-1 pb-[1px]">
                    ({summary.done + summary.skipped + summary.errors} / {summary.total})
                  </span>
                </div>
              ) : (
                <p className="text-xs text-text-muted mt-0.5">
                  Review the list below then click "Evaluate All" to start
                </p>
              )}
            </div>
            
            <button
              onClick={startBatch}
              disabled={!canRun || isRunning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
                bg-gradient-to-r from-primary to-accent text-white transition-opacity
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              Evaluate All {tasks.length}
            </button>
          </div>
          
          {isRunning && (
            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
               <div
                 className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 rounded-full"
                 style={{ width: `${progress}%` }}
               />
             </div>
          )}

          <EvaluationTable tasks={tasks} isRunning={isRunning} onEvaluateSingle={startSingle} />
        </div>
      )}

      {/* ── Completion Summary ──────────────────────────────────────────── */}
      {isComplete && (
        <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-5">
          {/* Summary banner */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">
            <div className="flex-1">
              <p className="text-base font-semibold text-text-primary mb-1">Bulk evaluation complete</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-emerald-400">✓ {summary.done} evaluated</span>
                {summary.skipped > 0 && (
                  <span className="text-blue-400">↩ {summary.skipped} skipped (cached)</span>
                )}
                {summary.errors > 0 && (
                  <span className="text-red-400">✕ {summary.errors} failed</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-text-muted
                  border border-white/10 hover:border-white/20 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Upload more
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                  bg-primary/90 text-white hover:bg-primary transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                View Dashboard
              </button>
            </div>
          </div>

          {/* Full results table */}
          <EvaluationTable tasks={tasks} isRunning={false} onEvaluateSingle={startSingle} />
        </div>
      )}
    </div>
  );
}
