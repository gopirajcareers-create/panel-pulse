import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { panelApi } from '@/lib/api/panel.api';
import { Users, Search, ChevronRight, ArrowLeft } from 'lucide-react';

interface PanelDirectoryRow {
  panelName: string;
  totalEvaluations: number;
  averageScore: number;
  lastEvaluationDate: string;
}

export default function PanelInsightsPage() {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<PanelDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');

  useEffect(() => {
    panelApi.getPanelDirectory().then((res) => {
      if (res.success) {
        setDirectory(res.data);
      }
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const filteredData = directory.filter(row => {
    const matchesSearch = row.panelName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (scoreFilter === 'good') return row.averageScore >= 8;
    if (scoreFilter === 'moderate') return row.averageScore >= 5 && row.averageScore < 8;
    if (scoreFilter === 'poor') return row.averageScore < 5;
    return true;
  });

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-bg-base p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">Panel Insights Directory</h1>
              <p className="text-text-muted">Track and review individual panel member performance across all evaluations.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-bg-card rounded-lg border border-white/[0.06]">
                  <Users className="w-5 h-5 text-indigo-400" />
                  <span className="text-sm font-medium text-text-primary">{directory.length} Panelists</span>
              </div>
            </div>
          </div>

          <div className="bg-bg-card rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search panelists..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Filter by Score:</label>
                <select
                  value={scoreFilter}
                  onChange={(e) => setScoreFilter(e.target.value)}
                  className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary/50 transition-colors"
                >
                  <option value="all">All Scores</option>
                  <option value="good" className="bg-slate-900">Good (8.0 - 10.0)</option>
                  <option value="moderate" className="bg-slate-900">Moderate (5.0 - 7.9)</option>
                  <option value="poor" className="bg-slate-900">Poor (0.0 - 4.9)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-muted uppercase bg-white/[0.02] border-b border-white/[0.06]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Panel Member</th>
                    <th className="px-6 py-4 font-semibold text-center">Interviews Conducted</th>
                    <th className="px-6 py-4 font-semibold text-center">Average Score</th>
                    <th className="px-6 py-4 content-end text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                        Loading directory...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                        No panel members found.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((row) => {
                      const scoreCategory = row.averageScore >= 8 ? 'text-emerald-400' : row.averageScore >= 5 ? 'text-orange-400' : 'text-red-400';
                      
                      return (
                        <tr 
                          key={row.panelName}
                          onClick={() => navigate(`/panels/${encodeURIComponent(row.panelName)}`)}
                          className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4 font-medium text-text-primary flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                              {row.panelName.substring(0, 2)}
                            </div>
                            {row.panelName}
                          </td>
                          <td className="px-6 py-4 text-center text-text-secondary">
                            {row.totalEvaluations}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-semibold ${scoreCategory}`}>{row.averageScore.toFixed(1)}</span>
                            <span className="text-text-muted text-xs ml-1">/ 10</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 text-text-muted text-xs">
                              <span>View Profile</span>
                              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
