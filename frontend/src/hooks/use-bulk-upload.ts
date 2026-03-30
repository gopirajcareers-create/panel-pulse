/**
 * Bulk Upload Hook
 *
 * Orchestrates one-touch bulk panel evaluation:
 *  1. parseFiles()  – parse 3 CSV files and cross-join rows by Job Interview ID
 *  2. runBatch()    – process each EvaluationTask sequentially with live status updates
 *
 * Expected CSV formats
 * ─────────────────────
 * JD file  (2 cols):  Job Interview ID | Job Description
 * L1 file  (4 cols):  Job Interview ID | Panel Name | Candidate Name | L1 Transcript
 * L2 file  (2 cols):  Job Interview ID | L2 Rejected Reason
 *
 * Column header names are matched case-insensitively with common aliases.
 * The L1 file drives the evaluation list – one task per L1 row.
 */

import { useState, useCallback, useRef } from 'react';
import { parseCsvString, findColumnKey } from '@/lib/utils/csv-parser';
import { panelApi } from '@/lib/api/panel.api';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'checking'
  | 'skipped'
  | 'processing'
  | 'done'
  | 'error';

export interface EvaluationTask {
  /** Unique key used as React key */
  id: string;
  jobId: string;
  panelName: string;
  candidateName: string;
  jd: string;
  l1Transcript: string;
  l2RejectionReason: string;
  panelMemberId?: string;
  panelMemberEmail?: string;
  status: TaskStatus;
  /** Human-readable status message / error detail */
  message?: string;
  score?: number;
  scoreCategory?: string;
  evaluationId?: string;
}

export interface BulkParseError {
  /** 'error' = blocks processing; 'warning' = non-fatal, task included with partial data */
  level: 'error' | 'warning';
  message: string;
}

export interface BulkUploadSummary {
  total: number;
  done: number;
  skipped: number;
  errors: number;
}

// ── Column aliases ────────────────────────────────────────────────────────────

const COL_JOB_ID = [
  'job interview id', 'job_interview_id', 'jobinterviewid',
  'job id', 'job_id', 'jobid', 'id',
];
const COL_PANEL = [
  'panel name', 'panel_name', 'panelname', 'panel',
  'interviewer name', 'interviewer_name', 'interviewer',
];
const COL_CANDIDATE = [
  'candidate name', 'candidate_name', 'candidatename', 'candidate',
];
const COL_TRANSCRIPT = [
  'l1 transcript', 'l1_transcript', 'l1transcript',
  'transcript', 'interview transcript', 'interview_transcript', 'l1',
];
const COL_JD = [
  'job description', 'job_description', 'jobdescription',
  'jd', 'description',
];
const COL_L2 = [
  'l2 rejected reason', 'l2_rejected_reason', 'l2rejectedreason',
  'l2 rejection reason', 'l2_rejection_reason', 'l2rejectionreason',
  'l2 reason', 'l2_reason', 'l2reason',
  'rejection reason', 'rejection_reason', 'l2',
];
const COL_PANEL_ID = ['panel_member_id', 'panel id', 'panel_id', 'panelid', 'employee id', 'employee_id'];
const COL_PANEL_EMAIL = ['panel_member_email', 'panel email', 'panel_email', 'panelemail', 'email'];

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBulkUpload() {
  const [tasks, setTasks] = useState<EvaluationTask[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef(false);

  const isComplete = tasks.length > 0 && tasks.every(
    (t) => t.status === 'done' || t.status === 'skipped' || t.status === 'error'
  );

  // ── Parse ──────────────────────────────────────────────────────────────────

  /**
   * Parse the 3 raw CSV strings into a list of EvaluationTasks.
   * Returns an array of parse errors/warnings (empty = all good).
   * Call setTasks automatically so the preview table renders immediately.
   */
  const parseFiles = useCallback(
    (
      jdContent: string,
      l1Content: string,
      l2Content: string
    ): BulkParseError[] => {
      const issues: BulkParseError[] = [];

      // ── Parse raw CSVs
      const jdCsv = parseCsvString(jdContent);
      const l1Csv = parseCsvString(l1Content);
      const l2Csv = parseCsvString(l2Content);

      // ── Validate JD columns
      const jdIdCol = findColumnKey(jdCsv.headers, COL_JOB_ID);
      const jdTextCol = findColumnKey(jdCsv.headers, COL_JD);
      if (!jdIdCol)
        issues.push({ level: 'error', message: 'JD file: "Job Interview ID" column not found.' });
      if (!jdTextCol)
        issues.push({ level: 'error', message: 'JD file: "Job Description" / "JD" column not found.' });

      // ── Validate L1 columns
      const l1IdCol = findColumnKey(l1Csv.headers, COL_JOB_ID);
      const l1PanelCol = findColumnKey(l1Csv.headers, COL_PANEL);
      const l1CandCol = findColumnKey(l1Csv.headers, COL_CANDIDATE);
      const l1TxCol = findColumnKey(l1Csv.headers, COL_TRANSCRIPT);
      if (!l1IdCol)
        issues.push({ level: 'error', message: 'L1 file: "Job Interview ID" column not found.' });
      if (!l1PanelCol)
        issues.push({ level: 'error', message: 'L1 file: "Panel Name" column not found.' });
      if (!l1CandCol)
        issues.push({ level: 'error', message: 'L1 file: "Candidate Name" column not found.' });
      if (!l1TxCol)
        issues.push({ level: 'error', message: 'L1 file: "L1 Transcript" column not found.' });

      // ── Validate L2 columns
      const l2IdCol = findColumnKey(l2Csv.headers, COL_JOB_ID);
      const l2ReasonCol = findColumnKey(l2Csv.headers, COL_L2);
      if (!l2IdCol)
        issues.push({ level: 'error', message: 'L2 file: "Job Interview ID" column not found.' });
      if (!l2ReasonCol)
        issues.push({ level: 'error', message: 'L2 file: "L2 Rejected Reason" column not found.' });

      // Panel details extraction
      const l1PanelIdCol = findColumnKey(l1Csv.headers, COL_PANEL_ID);
      const l1PanelEmailCol = findColumnKey(l1Csv.headers, COL_PANEL_EMAIL);
      const l2PanelIdCol = findColumnKey(l2Csv.headers, COL_PANEL_ID);
      const l2PanelEmailCol = findColumnKey(l2Csv.headers, COL_PANEL_EMAIL);

      // Stop if any hard errors
      if (issues.some((i) => i.level === 'error')) {
        setTasks([]);
        return issues;
      }

      // ── Build lookup maps (keyed by uppercase Job Interview ID)
      const jdMap = new Map<string, string>();
      if (jdIdCol && jdTextCol) {
        jdCsv.rows.forEach((row) => {
          const id = row[jdIdCol]?.trim().toUpperCase();
          if (id) jdMap.set(id, row[jdTextCol]?.trim() ?? '');
        });
      }

      const l2Map = new Map<string, { reason: string; id?: string; email?: string }>();
      if (l2IdCol && l2ReasonCol) {
        l2Csv.rows.forEach((row) => {
          const id = row[l2IdCol]?.trim().toUpperCase();
          if (id) {
            l2Map.set(id, {
              reason: row[l2ReasonCol]?.trim() ?? '',
              id: l2PanelIdCol ? row[l2PanelIdCol]?.trim() : undefined,
              email: l2PanelEmailCol ? row[l2PanelEmailCol]?.trim() : undefined,
            });
          }
        });
      }

      // ── Build tasks from L1 rows (L1 drives the list)
      const parsed: EvaluationTask[] = [];
      if (l1IdCol && l1PanelCol && l1CandCol && l1TxCol) {
        l1Csv.rows.forEach((row, idx) => {
          const jobId = row[l1IdCol]?.trim();
          const panelName = row[l1PanelCol]?.trim() || 'Unknown Panel';
          const candidateName = row[l1CandCol]?.trim() || 'Unknown Candidate';
          const l1Transcript = row[l1TxCol]?.trim();

          if (!jobId || !l1Transcript) return; // skip empty rows

          const keyUpper = jobId.toUpperCase();
          const jd = jdMap.get(keyUpper) ?? '';
          const l2Data = l2Map.get(keyUpper);
          const l2Reason = l2Data?.reason ?? '';

          // Prefer info from L1, fallback to L2 if present
          const panelMemberId = (l1PanelIdCol ? row[l1PanelIdCol]?.trim() : '') || l2Data?.id || '';
          const panelMemberEmail = (l1PanelEmailCol ? row[l1PanelEmailCol]?.trim() : '') || l2Data?.email || '';

          if (!jd) {
            issues.push({
              level: 'warning',
              message: `No JD found for Job ID "${jobId}" — will evaluate without JD context.`,
            });
          }

          parsed.push({
            id: `${jobId}-${panelName}-${candidateName}-${idx}`,
            jobId,
            panelName,
            candidateName,
            jd,
            l1Transcript,
            l2RejectionReason: l2Reason,
            panelMemberId,
            panelMemberEmail,
            status: 'pending',
          });
        });
      }

      if (parsed.length === 0) {
        issues.push({
          level: 'error',
          message: 'No valid evaluation rows found in L1 file.',
        });
      }

      setTasks(parsed);
      return issues;
    },
    []
  );

  // ── Batch runner ───────────────────────────────────────────────────────────

  const updateTask = useCallback((id: string, updates: Partial<EvaluationTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const runBatch = useCallback(
    async (tasksToRun: EvaluationTask[]) => {
      if (tasksToRun.length === 0) return;
      setIsRunning(true);
      abortRef.current = false;

      let doneCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const task of tasksToRun) {
        if (abortRef.current) break;

        // ── 1. Check for existing (duplicate) evaluation
        updateTask(task.id, { status: 'checking', message: 'Checking for existing result…' });
        try {
          const check = await panelApi.checkExisting(
            task.jobId,
            task.panelName,
            task.candidateName
          );
          if (check.exists) {
            updateTask(task.id, {
              status: 'skipped',
              message: 'Already evaluated — cached result exists.',
            });
            skippedCount++;
            continue;
          }
        } catch {
          // If the duplicate check fails, proceed with evaluation anyway
        }

        // ── 2. Run evaluation
        updateTask(task.id, { status: 'processing', message: 'Evaluating…' });
        try {
          const response = await panelApi.scorePanel({
            jobId: task.jobId,
            panelName: task.panelName,
            candidateName: task.candidateName,
            jd: task.jd,
            l1Transcript: task.l1Transcript,
            l2RejectionReason: task.l2RejectionReason,
            panel_member_id: task.panelMemberId,
            panel_member_email: task.panelMemberEmail,
          });

          updateTask(task.id, {
            status: 'done',
            score: response.panelEfficiencyScore,
            scoreCategory: response.scoreCategory,
            evaluationId: response.jobId,
            message: undefined,
          });
          doneCount++;
        } catch (err: any) {
          const raw = err?.message ?? 'Evaluation failed';
          const msg = /rate limit|429/i.test(raw)
            ? 'Rate limited — please re-run this row later.'
            : raw;
          updateTask(task.id, { status: 'error', message: msg });
          errorCount++;
        }

        // Brief pause between calls to avoid hammering the LLM rate limit
        await new Promise((r) => setTimeout(r, 600));
      }

      setIsRunning(false);

      if (doneCount > 0)
        toast.success(`Bulk complete: ${doneCount} of ${tasksToRun.length} evaluated ✓`);
      if (errorCount > 0)
        toast.error(`${errorCount} evaluation(s) failed — check the table for details.`);
      if (skippedCount > 0)
        toast(`${skippedCount} already evaluated (skipped)`, { icon: 'ℹ️' });
    },
    [updateTask]
  );

  // ── Public API ─────────────────────────────────────────────────────────────

  const startBatch = useCallback(() => {
    runBatch(tasks);
  }, [runBatch, tasks]);

  const startSingle = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      runBatch([task]);
    }
  }, [runBatch, tasks]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setTasks([]);
    setIsRunning(false);
  }, []);

  const summary: BulkUploadSummary = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    skipped: tasks.filter((t) => t.status === 'skipped').length,
    errors: tasks.filter((t) => t.status === 'error').length,
  };

  const progress =
    tasks.length > 0
      ? Math.round(
          ((summary.done + summary.skipped + summary.errors) / tasks.length) * 100
        )
      : 0;

  return {
    tasks,
    isRunning,
    isComplete,
    summary,
    progress,
    parseFiles,
    startBatch,
    startSingle,
    reset,
  };
}
