import React, { useEffect } from 'react';
import { useL2Validation } from '@/hooks/use-l2-validation';
import { ProbingDepthBadge } from './ProbingDepthBadge';
import { ValidationEvidence } from './ValidationEvidence';
import { Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  l1Transcript: string;
  l2RejectionReason?: string;
  autoValidate?: boolean;
  jobId?: string;
}

/** Strip CSV header rows / ID prefixes and return only the clean rejection reason for the given jobId */
function cleanRejectionReason(raw: string, jobId?: string): string {
  if (!raw) return '';

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // If jobId is provided and the stored content looks like a multi-row CSV,
  // extract only the row matching this jobId.
  if (jobId && lines.length > 1) {
    const firstLineLower = lines[0].toLowerCase();
    const looksLikeHeader =
      firstLineLower.includes(',') &&
      (firstLineLower.includes('job') || firstLineLower.includes(' id') || firstLineLower.startsWith('id'));
    const dataLines = looksLikeHeader ? lines.slice(1) : lines;
    const normalizedJobId = jobId.trim().toLowerCase();

    for (const line of dataLines) {
      const commaIdx = line.indexOf(',');
      if (commaIdx === -1) continue;
      const rowJobId = line.substring(0, commaIdx).trim().replace(/^"|"$/g, '').toLowerCase();
      if (rowJobId === normalizedJobId) {
        return line.substring(commaIdx + 1).trim().replace(/^"|"$/g, '');
      }
    }
  }

  // Fallback: strip any header-like rows then clean ID prefixes
  const headerPatterns = [
    /^job.{0,5}interview.{0,5}id/i,
    /^l2.{0,5}rejected?.{0,5}reason/i,
    /^job_id/i,
  ];
  const contentLines = lines.filter(
    (l) => !headerPatterns.some((p) => p.test(l))
  );

  // If the first content line still looks like it has an ID prefix (e.g. "JOB-001,reason text")
  // take everything after the first comma
  if (contentLines.length > 0) {
    const first = contentLines[0];
    const commaIdx = first.indexOf(',');
    if (commaIdx > 0 && !first.substring(0, commaIdx).includes(' ')) {
      contentLines[0] = first.substring(commaIdx + 1).trim();
    }
  }

  return contentLines.join(' ').trim();
}

export function L2ValidatorCard({
  l1Transcript,
  l2RejectionReason = '',
  autoValidate = false,
  jobId,
}: Props) {
  const { result, isLoading, error, validateL2Reason } = useL2Validation();

  const cleanedReason = cleanRejectionReason(l2RejectionReason, jobId);

  // Auto-validate once when both reason and transcript are available
  useEffect(() => {
    if (autoValidate && cleanedReason && l1Transcript?.trim() && !result && !isLoading) {
      validateL2Reason(l1Transcript, cleanedReason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoValidate, cleanedReason, l1Transcript]);

  const [showTooltip, setShowTooltip] = React.useState(false);

  if (!cleanedReason && !result) return null;

  return (
    <div
      className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-5"
      data-testid="l2-validator"
    >
      {/* Header */}
      <h3 className="text-base font-semibold text-text-primary">
        L2 Rejection Reason Validation
      </h3>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Rejection reason display */}
      {cleanedReason && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-widest text-red-400/80 mb-2">
            Rejection Reason
          </p>
          <ul className="space-y-3">
            {cleanedReason
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean)
              .map((reason, i) => {
                const jf = result?.justifications?.[reason];
                return (
                  <li key={i} className="space-y-1.5">
                    <div className="flex items-start gap-2 text-sm text-red-200 leading-snug">
                      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-red-400/70" />
                      {reason}
                    </div>
                    {jf && (
                      <div className="ml-3.5 space-y-2">
                        {/* Summary Justification (One line) */}
                        {typeof jf === 'object' && !Array.isArray(jf) && (jf as any).summary && (
                          <div className="text-[11px] text-red-100 font-medium leading-relaxed">
                            {(jf as any).summary}
                          </div>
                        )}
                        
                        {/* Evidence Points */}
                        <div className="space-y-1">
                          {(Array.isArray(jf) ? jf : ((jf as any).points || [])).map((point: string, idx: number) => (
                            <div key={idx} className="text-[11px] text-red-300/60 flex items-start gap-1.5 italic">
                              <span className="mt-1 shrink-0">→</span>
                              {point}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-orange-400 rounded-full animate-spin" />
          Validating against transcript…
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4 pt-2 border-t border-white/[0.06]">
          {/* Probing depth */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
                Probing Depth
              </p>
              <div className="relative">
                <button 
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="p-0.5 rounded-full hover:bg-white/10 transition-colors text-text-muted"
                >
                  <Info className="w-3 h-3" />
                </button>
                <AnimatePresence>
                  {showTooltip && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 5 }}
                      className="absolute left-0 top-full mt-2 w-72 p-4 bg-[#09090b] border border-white/20 rounded-lg shadow-2xl z-50 text-[11px] leading-relaxed text-text-secondary"
                    >
                      <ul className="space-y-2.5">
                        <li><strong className="text-emerald-400 uppercase font-bold">Deep Probing:</strong> Panelist asked multiple follow-up questions, edge cases, and technical "why/how" scenarios.</li>
                        <li><strong className="text-orange-400 uppercase font-bold">Surface Probing:</strong> Panelist asked standard questions but didn't push for deeper technical complexity.</li>
                        <li><strong className="text-red-400 uppercase font-bold">No Probing:</strong> Topics were mentioned but not explored or questions were accepted at face value.</li>
                      </ul>
                      <div className="absolute -top-1 left-3 w-2.5 h-2.5 bg-[#09090b] border-t border-l border-white/20 rotate-45" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <ProbingDepthBadge depth={result.probingDepth} />
          </div>

          {/* Matching questions */}
          {result.matchedQuestions && result.matchedQuestions.length > 0 && (
            <ValidationEvidence questions={result.matchedQuestions} />
          )}
        </div>
      )}
    </div>
  );
}
