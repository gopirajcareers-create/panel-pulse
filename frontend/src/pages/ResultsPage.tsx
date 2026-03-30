import { AppShell } from '@/components/layout/AppShell';
import { EvaluationHeader } from '@/components/features/evaluation/EvaluationHeader';
import { ScoreCard } from '@/components/features/evaluation/ScoreCard';
import DimensionGrid from '@/components/features/evaluation/DimensionGrid';
import { JdSkillsCard } from '@/components/features/evaluation/JdSkillsCard';
import { PanelSummaryCard } from '@/components/features/evaluation/PanelSummaryCard';
import { L2ValidatorCard } from '@/components/features/l2-validation/L2ValidatorCard';
import { EmptyState } from '@/components/common/EmptyState';
import { useEvaluationStore } from '@/lib/stores/evaluation.store';
import { dashboardApi } from '@/lib/api/dashboard.api';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const [cachedEvaluation, setCachedEvaluation] = useState<any>(null);
  const [loadingCached, setLoadingCached] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const jobId = useEvaluationStore((s) => s.jobId);
  const panelScore = useEvaluationStore((s) => s.panelScore);
  const dimensions = useEvaluationStore((s) => s.dimensions);
  const evidence = useEvaluationStore((s) => s.evidence);
  const scoreCategory = useEvaluationStore((s) => s.scoreCategory);
  const isLoading = useEvaluationStore((s) => s.isLoading);
  const timestamp = useEvaluationStore((s) => s.timestamp);
  const l1Transcript = useEvaluationStore((s) => s.l1Transcript);
  const l2RejectionReason = useEvaluationStore((s) => s.l2RejectionReason);

  const liveRef = useRef<HTMLDivElement | null>(null);

  // Load evaluation from DB whenever evaluationId is in the URL (from dashboard link)
  // Always fetch to ensure correct data is shown regardless of store state
  useEffect(() => {
    if (!evaluationId) return;
    setLoadingCached(true);
    setFetchError(null);
    setCachedEvaluation(null);
    dashboardApi.fetchCachedEvaluation(evaluationId)
      .then(data => {
        setCachedEvaluation(data);
        setLoadingCached(false);
      })
      .catch(error => {
        console.error('Failed to load cached evaluation:', error);
        setFetchError(error?.response?.data?.error || error?.message || 'Failed to load evaluation details');
        setLoadingCached(false);
      });
  }, [evaluationId]);

  useEffect(() => {
    if (panelScore !== null && liveRef.current) {
      liveRef.current.textContent = `Evaluation complete: score ${typeof panelScore === 'number' ? panelScore.toFixed(1) : panelScore}`;
    }
  }, [panelScore]);

  // Use cached evaluation if available
  const displayData = cachedEvaluation || {
    jobId,
    score: panelScore,
    categories: dimensions,
    evidence,
    scoreCategory,
    timestamp
  };

  const displayScore = cachedEvaluation?.score ?? panelScore;
  const displayDimensions = cachedEvaluation?.categories ?? dimensions;
  const displayEvidence = cachedEvaluation?.evidence ?? evidence;
  const displayScoreCategory = cachedEvaluation?.scoreCategory ?? scoreCategory;
  const displayTimestamp = cachedEvaluation?.evaluatedAt ?? timestamp;
  const displayJobId = cachedEvaluation?.jobId ?? jobId;
  const displayL2Reasons: string[] = cachedEvaluation?.l2RejectionReasons?.length
    ? cachedEvaluation.l2RejectionReasons
    : l2RejectionReason ? [l2RejectionReason] : [];
  const displayL1 = cachedEvaluation?.l1Transcript ?? l1Transcript ?? '';

  // Show error if fetch failed
  if (fetchError) {
    return (
      <AppShell>
        <div className="flex-1 p-6">
          <EmptyState
            title="Failed to load evaluation"
            description={fetchError}
            action={<button onClick={() => navigate('/dashboard')} className="inline-block px-4 py-2 bg-primary text-white rounded">Back to dashboard</button>}
          />
        </div>
      </AppShell>
    );
  }

  if (!cachedEvaluation && displayScore === null && !isLoading && !loadingCached) {
    return (
      <AppShell>
        <div className="flex-1 p-6">
          <EmptyState
            title="No evaluation found"
            description="Run an evaluation first or open a saved result."
            action={<button onClick={() => navigate('/evaluate')} className="inline-block px-4 py-2 bg-primary text-white rounded">Evaluate panel</button>}
          />
        </div>
      </AppShell>
    );
  }

  if (loadingCached) {
    return (
      <AppShell>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-text-secondary">Loading evaluation details...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-bg-base p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div aria-live="polite" aria-atomic="true" className="sr-only" ref={liveRef} />
          <EvaluationHeader
            jobId={displayJobId}
            panelName={cachedEvaluation?.panelName}
            candidateName={cachedEvaluation?.candidateName}
            evaluationId={evaluationId}
            score={displayScore ?? 0}
            categories={(displayDimensions as Record<string, number>) || undefined}
            evaluationData={cachedEvaluation}
            backUrl="/dashboard"
            backLabel="Back to Dashboard"
          />

          {/* Main Panel Efficiency Score */}
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <ScoreCard
                score={displayScore ?? 0}
                category={displayScoreCategory}
                panelName={cachedEvaluation?.panelName}
              />
            </div>

            {/* Dimension Grid */}
            <div className="lg:col-span-3">
              <DimensionGrid dimensions={displayDimensions} evidence={displayEvidence} />
            </div>
          </section>

          {/* JD Skills + Panel Summary row */}
          {(cachedEvaluation?.refinedJd || useEvaluationStore.getState().refinedJd || cachedEvaluation?.panelSummary || cachedEvaluation?.gapAnalysis || useEvaluationStore.getState().panelSummary) && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <JdSkillsCard refinedJd={cachedEvaluation?.refinedJd || (cachedEvaluation ? null : useEvaluationStore.getState().refinedJd)} />
              <PanelSummaryCard
                summary={cachedEvaluation?.panelSummary || (cachedEvaluation ? null : useEvaluationStore.getState().panelSummary)}
                gapAnalysis={cachedEvaluation?.gapAnalysis || (cachedEvaluation ? null : useEvaluationStore.getState().gapAnalysis)}
                scoreCategory={displayScoreCategory}
              />
            </section>
          )}

          {/* L2 Validation Section */}
          {displayL2Reasons.length > 0 && (
            <section>
              <L2ValidatorCard
                l1Transcript={displayL1}
                l2RejectionReason={displayL2Reasons[0]}
                autoValidate={true}
                jobId={displayJobId}
              />
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
