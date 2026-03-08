import React, { useState, useEffect } from 'react';
import { useL2Validation } from '@/hooks/use-l2-validation';
import { ProbingDepthBadge } from './ProbingDepthBadge';
import { ValidationEvidence } from './ValidationEvidence';

interface Props {
  l1Transcript: string;
  l2RejectionReason?: string;
  autoValidate?: boolean;
}

export function L2ValidatorCard({ l1Transcript, l2RejectionReason = '', autoValidate = false }: Props) {
  const [rejectionReason, setRejectionReason] = useState(l2RejectionReason);
  const { result, isLoading, error, validateL2Reason, clearResult } = useL2Validation();

  // Auto-validate if provided with autoValidate flag (disabled by default to prevent rate limiting)
  useEffect(() => {
    if (autoValidate && l2RejectionReason?.trim() && l1Transcript?.trim() && !result && !isLoading) {
      validateL2Reason(l1Transcript, l2RejectionReason);
    }
  }, [autoValidate, l2RejectionReason, l1Transcript, result, isLoading, validateL2Reason]);

  const handleValidate = async () => {
    if (!rejectionReason.trim()) {
      return;
    }
    await validateL2Reason(l1Transcript, rejectionReason);
  };

  const handleClear = () => {
    setRejectionReason(l2RejectionReason);
    clearResult();
  };

  const isAutoMode = autoValidate && l2RejectionReason;

  return (
    <div className="bg-bg-card rounded-lg border border-white/[0.06] p-6 space-y-4" data-testid="l2-validator">
      <h3 className="text-lg font-semibold text-text-primary">L2 Rejection Reason Validation</h3>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {/* Auto mode: show the actual L2 rejection reason for this interview */}
      {isAutoMode ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-widest text-text-muted">
            L2 Rejected Reason
          </label>
          <div className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-3 py-2 text-sm text-text-primary">
            {String(l2RejectionReason)
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)[0] || ''}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-text-muted">
              Rejection Reason
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter the L2 rejection reason..."
              disabled={isLoading}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleValidate}
              disabled={isLoading || !rejectionReason.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Validating...
                </>
              ) : (
                'Validate Against Transcript'
              )}
            </button>
            {result && (
              <button
                onClick={handleClear}
                className="px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded hover:bg-white/[0.05] text-sm text-text-muted"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {/* Show result */}
      {result && (
        <div className="space-y-4 pt-4 border-t border-white/[0.08]">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-text-muted">Probing Depth</p>
            <ProbingDepthBadge depth={result.probingDepth} />
            <p className="text-xs text-text-muted">
              Validation Confidence: {(result.confidence * 100).toFixed(0)}%
            </p>
          </div>

          {result.matchedQuestions && result.matchedQuestions.length > 0 && (
            <ValidationEvidence questions={result.matchedQuestions} />
          )}
        </div>
      )}
    </div>
  );
}
