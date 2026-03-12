import { useState, useRef } from 'react';
import { apiClient } from '@/lib/api/client';
import toast from 'react-hot-toast';
import { useEvaluationStore } from '@/lib/stores/evaluation.store';

export interface L2ValidationResult {
  probingDepth: 'NO PROBING' | 'SURFACE PROBING' | 'DEEP PROBING';
  matchedQuestions: string[];
  justifications?: Record<string, string[]>;
  validated: boolean;
  confidence: number;
}

/**
 * Transform backend response to frontend format
 */
function transformBackendResponse(backendData: any): L2ValidationResult {
  // Map backend probing_verdict to frontend probingDepth
  const verdictMap: Record<string, 'NO PROBING' | 'SURFACE PROBING' | 'DEEP PROBING'> = {
    'NO PROBING': 'NO PROBING',
    'SURFACE PROBING': 'SURFACE PROBING',
    'DEEP PROBING': 'DEEP PROBING',
    'NO_PROBING': 'NO PROBING',
    'SURFACE_PROBING': 'SURFACE PROBING',
    'DEEP_PROBING': 'DEEP PROBING',
  };

  const backendVerdict = backendData.probing_verdict || backendData.full_validation?.probing_verdict || 'NO PROBING';
  const probingDepth = verdictMap[backendVerdict as keyof typeof verdictMap] || 'NO PROBING';

  // Extract matched questions from evidence
  const evidence = backendData.full_validation?.evidence || backendData.evidence || [];
  const matchedQuestions = Array.isArray(evidence)
    ? evidence.map((e: any) => e.quote || e).filter((q: any) => q)
    : [];

  // Extract justifications
  const justifications = backendData.full_validation?.justifications || backendData.justifications;

  return {
    probingDepth,
    matchedQuestions,
    justifications,
    validated: true,
    confidence: backendData.confidence || 0.5,
  };
}

export function useL2Validation() {
  const [result, setResult] = useState<L2ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorShownRef = useRef(false);

  async function validateL2Reason(transcript: string, rejectionReason: string): Promise<L2ValidationResult | null> {
    if (!transcript || !rejectionReason) {
      const msg = 'Both transcript and rejection reason are required';
      setError(msg);
      if (!errorShownRef.current) {
        toast.error(msg);
        errorShownRef.current = true;
      }
      return null;
    }

    setIsLoading(true);
    setError(null);
    errorShownRef.current = false;

    try {
      const response = await apiClient.post<any>('/api/v1/panel/validate-l2', {
        job_id: '(unknown)',
        l2_reason: rejectionReason,
        l1_transcripts: [transcript],
      });

      // Transform backend response to frontend format
      const transformedResult = transformBackendResponse(response.data);
      setResult(transformedResult);
      // Persist to store so ExportButton can include it in the PDF
      useEvaluationStore.getState().setL2Validation(transformedResult);
      return transformedResult;
    } catch (err: any) {
      const raw = err.response?.data?.error || err.message || 'Failed to validate L2 reason';
      let userMessage = raw;
      const status = err.response?.status;
      if (status === 429 || status === 503 || /Failed after \d+ attempts/i.test(raw)) {
        userMessage = 'Validation service temporarily unavailable. Please try again later.';
      }

      setError(userMessage);
      if (!errorShownRef.current) {
        toast.error(userMessage);
        errorShownRef.current = true;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  function clearResult() {
    setResult(null);
    setError(null);
    errorShownRef.current = false;
  }

  return {
    result,
    isLoading,
    error,
    validateL2Reason,
    clearResult,
  };
}
