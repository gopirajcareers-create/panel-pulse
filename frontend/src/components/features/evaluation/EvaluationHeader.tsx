import React from 'react';
import { ExportButton } from './ExportButton';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  jobId: string;
  panelName?: string;
  candidateName?: string;
  evaluationId?: string;
  score?: number;
  categories?: Record<string, number>;
  evaluationData?: any | null;
  backUrl?: string;
  backLabel?: string;
}

export function EvaluationHeader({ jobId, panelName, candidateName, evaluationId, score, categories, evaluationData, backUrl, backLabel }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      {backUrl && (
        <button
          onClick={() => navigate(backUrl)}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel || 'Back'}
        </button>
      )}
      <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-3">Evaluation Results</h2>
        <div className="flex flex-wrap gap-2">
          {jobId && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs font-medium text-text-primary">
              <span className="text-text-muted">Job ID</span>
              <span>{jobId}</span>
            </span>
          )}
          {panelName && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-medium text-orange-300">
              <span className="text-orange-400/70">Panel</span>
              <span>{panelName}</span>
            </span>
          )}
          {candidateName && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-300">
              <span className="text-indigo-400/70">Candidate</span>
              <span>{candidateName}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex-none flex items-center gap-3">
        <ExportButton
          jobId={jobId}
          evaluationId={evaluationId}
          panelName={panelName}
          candidateName={candidateName}
          score={score}
          categories={categories}
          evaluationData={evaluationData}
        />
      </div>
      </div>
    </div>
  );
}
