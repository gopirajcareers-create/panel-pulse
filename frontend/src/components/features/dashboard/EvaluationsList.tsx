import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardEvaluation } from '@/types/dashboard.types';

interface EvaluationsListProps {
  evaluations?: DashboardEvaluation[];
  loading?: boolean;
  pagination?: {
    total: number;
    limit: number;
    skip: number;
    pages: number;
  };
  onPageChange?: (skip: number) => void;
  onSort?: (sortBy: string, order: 'asc' | 'desc', scoreFilter?: string) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  scoreFilter?: string;
}

function getScoreBadgeClass(score: number): string {
  if (score >= 8) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  if (score >= 5) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
  return 'bg-red-500/20 text-red-300 border border-red-500/30';
}

export function EvaluationsList({
  evaluations = [],
  loading = false,
  pagination,
  onPageChange,
  onSort,
  sortBy = 'created_at',
  sortOrder = 'desc',
  scoreFilter = 'all'
}: EvaluationsListProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const navigate = useNavigate();

  const handleScoreAction = (action: string) => {
    if (!onSort) return;
    
    if (action === 'asc' || action === 'desc') {
      onSort('averageScore', action as 'asc' | 'desc', 'all');
    } else {
      onSort('averageScore', 'desc', action);
    }
  };

  useEffect(() => {
    if (onPageChange) {
      onPageChange(currentPage * (pagination?.limit || 50));
    }
  }, [currentPage, pagination?.limit, onPageChange]);

  const handleJobInterviewIdClick = (evaluationId: string) => {
    navigate(`/results/${evaluationId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-slate-400">Loading evaluations...</div>
      </div>
    );
  }

  if (!evaluations || evaluations.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-slate-400">No evaluations found. Try adjusting your search filters.</div>
      </div>
    );
  }

  return (
    <div className="border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1e293b' }}>
            <tr className="border-b border-slate-700/50">
              <th className="px-6 py-3 text-left font-bold text-white">Job Interview ID</th>
              <th className="px-6 py-3 text-left font-bold text-white">Panel Name</th>
              <th className="px-6 py-3 text-left font-bold text-white">Candidate Name</th>
              <th className="px-6 py-3 text-left font-bold text-white min-w-[150px]">
                Average Score
              </th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((evaluation, idx) => (
              <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors last:border-b-0">
                <td className="px-6 py-3 font-mono">
                  <button
                    onClick={() => handleJobInterviewIdClick(evaluation._id || evaluation.jobInterviewId)}
                    className="text-orange-400 hover:text-orange-300 underline font-semibold transition-colors"
                    title="Click to view evaluation details"
                  >
                    {evaluation.jobInterviewId}
                  </button>
                </td>
                <td className="px-6 py-3 text-white">{evaluation.panelName}</td>
                <td className="px-6 py-3 text-white">{evaluation.candidateName}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${getScoreBadgeClass(evaluation.averageScore)}`}>
                    {evaluation.averageScore.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="px-6 py-4 bg-slate-700/20 border-t border-slate-700/50 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Page {currentPage + 1} of {pagination.pages} ({pagination.total} total)
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 text-sm bg-orange-500/20 text-orange-300 rounded-lg hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(pagination.pages - 1, currentPage + 1))}
              disabled={currentPage >= pagination.pages - 1}
              className="px-4 py-2 text-sm bg-orange-500/20 text-orange-300 rounded-lg hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
