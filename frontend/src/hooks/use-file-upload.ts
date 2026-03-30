import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUploadStore } from '@/lib/stores/upload.store';
import { useEvaluationStore } from '@/lib/stores/evaluation.store';
import { panelApi } from '@/lib/api/panel.api';
import type { UploadRequest } from '@/types/upload.types';
import toast from 'react-hot-toast';

/**
 * Parse a CSV/text file and extract the content for a specific job ID.
 * Expects the first column to be the Job Interview ID and the second column
 * to be the actual content (JD text or L2 rejection reason).
 * Handles optional header row, quoted fields, and comma-containing content.
 * Returns null when:
 *   - The content is not a multi-row CSV (single entry — use as-is)
 *   - No row matches the given jobId
 */
function extractCsvRowForJobId(rawContent: string, jobId: string): string | null {
  if (!rawContent || !jobId) return null;

  const lines = rawContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Need at least 2 lines to be a multi-row CSV worth filtering
  if (lines.length < 2) return null;

  // Detect and skip a header row
  const firstLineLower = lines[0].toLowerCase();
  const looksLikeHeader =
    firstLineLower.includes(',') &&
    (firstLineLower.includes('job') || firstLineLower.includes(' id') || firstLineLower.startsWith('id'));

  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const normalizedJobId = jobId.trim().toLowerCase();

  for (const line of dataLines) {
    // Better CSV split that respects quotes
    const columns = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
    if (!columns || columns.length < 2) continue;

    const rowJobId = columns[0]
      .trim()
      .replace(/^"|"$/g, '')
      .toLowerCase();

    if (rowJobId === normalizedJobId) {
      // Find the JD column. According to the user, it is named "JD".
      // If we have headers, we can be smart. If not, assume it's the 2nd column.
      let jdContent = '';
      if (looksLikeHeader) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
        const jdIdx = headers.indexOf('jd');
        if (jdIdx !== -1 && columns[jdIdx]) {
          jdContent = columns[jdIdx];
        } else {
          // Fallback to column index 1 (second column)
          jdContent = columns[1];
        }
      } else {
        jdContent = columns[1];
      }

      return jdContent.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
    }
  }

  return null;
}

export function useFileUpload() {
  const { addFile, removeFile, setProgress, setStatus, setMessage, clear, files, setL1Transcript: setUploadL1Transcript } = useUploadStore();
  const { setEvaluation, setLoading, setL1Transcript, setL2RejectionReason } = useEvaluationStore();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);

  async function readFileAsText(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async function handleFilesSelected(newFiles: File[]) {
    // Map incoming files to jd/l1/l2 by filename heuristics if possible
    const jdFiles = newFiles.filter((f) => f.name.toLowerCase().includes('jd'));
    const l1Files = newFiles.filter((f) => f.name.toLowerCase().includes('l1'));
    const l2Files = newFiles.filter((f) => f.name.toLowerCase().includes('l2'));

    const toProcess: Array<{ type: 'jd' | 'l1' | 'l2'; file: File }> = [];

    if (jdFiles.length > 0) toProcess.push({ type: 'jd', file: jdFiles[0] });
    if (l1Files.length > 0) toProcess.push({ type: 'l1', file: l1Files[0] });
    if (l2Files.length > 0) toProcess.push({ type: 'l2', file: l2Files[0] });

    // As a fallback, if user selected exactly 3 files without naming, assign by order
    if (toProcess.length === 0 && newFiles.length === 3) {
      toProcess.push({ type: 'jd', file: newFiles[0] });
      toProcess.push({ type: 'l1', file: newFiles[1] });
      toProcess.push({ type: 'l2', file: newFiles[2] });
    }

    if (toProcess.length === 0 && newFiles.length > 0) {
      // If only one file provided, try to infer by content or name; otherwise add first as JD
      toProcess.push({ type: 'jd', file: newFiles[0] });
    }

    setProgress(5);
    setMessage('Reading selected files...');

    for (const item of toProcess) {
      try {
        const content = await readFileAsText(item.file);
        addFile(item.type, {
          name: item.file.name,
          type: item.type,
          content: content,
          size: item.file.size,
        });
        const curr = useUploadStore.getState().uploadProgress || 0;
        setProgress(Math.min(95, curr + 20));
      } catch (err) {
        toast.error(`Failed to read ${item.file.name}`);
      }
    }

    setMessage('Files ready');
    setProgress(100);
  }

  function removeFileByType(type: 'jd' | 'l1' | 'l2') {
    removeFile(type);
  }

  async function submitEvaluation(jobId: string, panelName: string, candidateName: string) {
    if (!files.get('jd') || !files.get('l1') || !files.get('l2')) {
      toast.error('Please select all three files (JD, L1, L2)');
      return;
    }

    if (!jobId.trim() || !panelName.trim() || !candidateName.trim()) {
      toast.error('Please enter Job ID, Panel Name, and Candidate Name');
      return;
    }

    setIsUploading(true);
    setStatus('uploading');
    setMessage('Preparing payload...');
    setProgress(10);

    try {
      // Read raw file contents
      let jd = files.get('jd')?.content ?? '';
      const l1 = files.get('l1')?.content ?? '';
      let l2 = files.get('l2')?.content ?? '';

      // If the JD or L2 file is a multi-row CSV (one row per job ID),
      // extract only the row for the current jobId so the backend receives
      // data relevant to this interview only.
      const jdForJob = extractCsvRowForJobId(jd, jobId.trim());
      if (jdForJob !== null) jd = jdForJob;

      const l2ForJob = extractCsvRowForJobId(l2, jobId.trim());
      if (l2ForJob !== null) l2 = l2ForJob;

      const request: UploadRequest = {
        jobId: jobId.trim(),
        panelName: panelName.trim(),
        candidateName: candidateName.trim(),
        jd,
        l1Transcript: l1,
        l2RejectionReason: l2,
      };

      setProgress(30);
      setMessage('Sending to evaluation API...');

      setLoading(true);
      const response = await panelApi.scorePanel(request);

      setProgress(90);
      setMessage('Finalizing results...');

      // Store L1 transcript and L2 rejection reason for L2 validation on results page
      setL1Transcript(l1);
      setL2RejectionReason(l2);
      
      setEvaluation(response);
      
      setProgress(100);
      setStatus('success');
      setMessage('Evaluation complete!');

      toast.success('Evaluation completed successfully');

      // Navigate to results page after a short delay
      setTimeout(() => {
        try {
          const id = (response as any).jobId || (response as any).job_id;
          if (id) navigate(`/results/${id}`);
        } catch (e) {
          // ignore navigation errors
        }
        // Reset upload form but keep evaluation data
        setProgress(0);
        setStatus('idle');
        setMessage('');
      }, 500);
    } catch (error) {
      const msg = (error as any)?.message ?? 'Evaluation failed.';
      setStatus('error');
      setMessage(msg.includes('rate limit') ? 'Service temporarily unavailable. Please try again later.' : 'Upload failed. Please try again.');
      setProgress(0);
      setIsUploading(false);
      setLoading(false);
      toast.error(msg.includes('rate limit') ? 'Scoring service rate-limited. Try again shortly.' : 'Evaluation failed.');
    } finally {
      setIsUploading(false);
      setLoading(false);
    }
  }

  return {
    handleFilesSelected,
    removeFileByType,
    submitEvaluation,
    isUploading,
    files,
  };
}
