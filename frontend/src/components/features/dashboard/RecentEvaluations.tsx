import { ArrowRight } from 'lucide-react';
import type { DashboardEvaluation } from '../../../types/dashboard.types';

interface RecentEvaluationsProps {
  evaluations?: DashboardEvaluation[];
  loading?: boolean;
  onRowClick?: (jobId: string) => void;
}

const categoryColor = {
  Good: 'text-green-400',
  Moderate: 'text-orange-400',
  Poor: 'text-red-400',
};

const getCategory = (score: number): 'Good' | 'Moderate' | 'Poor' => {
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Moderate';
  return 'Poor';
};

export function RecentEvaluations({ evaluations = [], loading = false, onRowClick }: RecentEvaluationsProps) {
  if (loading) {
    return <div className="p-6 text-center text-text-muted" role="status" aria-label="Loading evaluations">Loading evaluations...</div>;
  }

  if (!evaluations.length) {
    return null;
  }

  return (
    <div role="region" aria-label="Recent evaluations">
      <h3 className="text-heading text-text-primary font-semibold mb-6">Recent Evaluations</h3>
      <div className="border border-border-primary rounded-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-border-primary bg-bg-base">
                <th className="text-left px-card py-4 font-semibold text-text-primary" scope="col">Job ID</th>
                <th className="text-left px-card py-4 font-semibold text-text-primary" scope="col">Date</th>
                <th className="text-left px-card py-4 font-semibold text-text-primary" scope="col">Score</th>
                <th className="text-left px-card py-4 font-semibold text-text-primary" scope="col">Category</th>
                <th className="text-left px-card py-4 font-semibold text-text-primary" scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.slice(0, 10).map((item) => (
                <tr key={item._id || item.jobInterviewId} className="border-b border-border-primary hover:bg-bg-base transition-colors last:border-b-0">
                  <td className="px-card py-4 font-medium text-orange-400">{item.jobInterviewId}</td>
                  <td className="px-card py-4 text-text-secondary text-xs">{new Date(item.lastEvaluationDate).toLocaleDateString()}</td>
                  <td className="px-card py-4 font-semibold text-text-primary" aria-label={`Score: ${item.averageScore.toFixed(1)} out of 10`}>{item.averageScore.toFixed(1)}</td>
                  <td className={`px-card py-4 font-semibold ${categoryColor[getCategory(item.averageScore)]}`}>{getCategory(item.averageScore)}</td>
                  <td className="px-card py-4">
                    <button 
                      onClick={() => onRowClick?.(item.jobInterviewId)} 
                      className="text-accent-primary hover:text-accent-secondary flex items-center gap-1 font-medium transition-colors"
                      aria-label={`View details for job ${item.jobInterviewId}`}
                    >
                      View <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RecentEvaluations;
