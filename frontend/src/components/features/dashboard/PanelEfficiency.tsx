import { useEffect, useState } from 'react';
import { dashboardApi, type PanelEfficiency as PanelEfficiencyType, type PanelEfficiencyResponse } from '@/lib/api/dashboard.api';

export function PanelEfficiency() {
  const [data, setData] = useState<PanelEfficiencyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEfficiency() {
      setLoading(true);
      const response = await dashboardApi.fetchPanelEfficiency();
      setData(response);
      setLoading(false);
    }

    loadEfficiency();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-border-primary rounded-card h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.panels.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {/* Panel Details Table */}
      <div className="border border-border-primary rounded-card overflow-hidden">
        <div className="p-card border-b border-border-primary bg-bg-surface">
          <h3 className="text-heading text-text-primary font-semibold">Panel Efficiency Breakdown</h3>
        </div>
        
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border-primary bg-bg-base">
                <th className="px-card py-4 text-left font-semibold text-text-primary">Panel Name</th>
                <th className="px-card py-4 text-center font-semibold text-text-primary">Avg Score</th>
                <th className="px-card py-4 text-center font-semibold text-text-primary">Evaluations</th>
                <th className="px-card py-4 text-center font-semibold text-text-primary">Score Range</th>
              </tr>
            </thead>
            <tbody>
              {data.panels.map((panel, index) => (
                <tr 
                  key={index} 
                  className="border-b border-border-primary hover:bg-bg-base transition-colors last:border-b-0"
                >
                  <td className="px-card py-4 font-medium text-text-primary">{panel.panelName}</td>
                  <td className="px-card py-4 text-center">
                    <span className={`font-bold ${getScoreColor(panel.averageScore)}`}>
                      {panel.averageScore}
                    </span>
                  </td>
                  <td className="px-card py-4 text-center text-text-secondary">{panel.evaluationCount}</td>
                  <td className="px-card py-4 text-center text-text-muted text-xs">{panel.scoreRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-accent-success';
  if (score >= 6) return 'text-accent-primary';
  return 'text-accent-error';
}
