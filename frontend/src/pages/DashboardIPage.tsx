import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  Layers, Search, FileText, Calendar, ArrowRight,
  TrendingUp, Award, Clock, Sparkles, AlertCircle, RefreshCw, RotateCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { pipelineApi, type PipelineCandidate } from '@/lib/api/pipeline.api';
import toast from 'react-hot-toast';
import { RestartButton } from '@/components/features/dashboard/RestartButton';

export default function DashboardIPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pipelineApi.getCandidates();
      setCandidates(data || []);
    } catch (err: any) {
      console.error('Failed to load pipeline candidates:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to fetch pipeline candidates.');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestartCandidate = async (jobId: string, candidateName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (!confirm(`Are you sure you want to restart the entire evaluation for ${candidateName}? This will delete all stages.`)) {
      return;
    }
    try {
      // Call restart API endpoint
      await pipelineApi.restartCandidate(jobId, candidateName);
      toast.success(`Evaluation deleted for ${candidateName}`);
      // Reload the candidates list to reflect the deletion
      loadCandidates();
    } catch (err: any) {
      console.error('Failed to restart candidate:', err);
      toast.error(err?.response?.data?.error || 'Failed to restart evaluation');
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const filteredCandidates = (candidates || []).filter(c => {
    const q = searchQuery.toLowerCase();
    return (c.candidateName || '').toLowerCase().includes(q) || (c.jobId || '').toLowerCase().includes(q);
  });

  const getStageBadge = (status: 'completed' | 'pending', label: string) => {
    if (status === 'completed') {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {label}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.03] text-text-muted border border-white/[0.05] rounded-full text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
        {label}
      </span>
    );
  };

  // Stats calculation
  const totalCount = (candidates || []).length;
  const fullyCompleted = (candidates || []).filter(c => (c.completedStages || []).length === 4).length;
  const avgScore = (candidates || []).reduce((acc, c) => acc + (c.latestScore || 0), 0) / ((candidates || []).filter(c => c.latestScore !== null).length || 1);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02] border border-white/[0.05] p-6 rounded-2xl backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                <Layers className="w-7 h-7 text-indigo-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-text-primary tracking-tight">Dashboard</h1>
                <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mt-0.5">
                  4-Stage Pipeline Candidates & Smart Extract Results
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadCandidates} className="p-2.5 bg-white/[0.03] hover:bg-white/[0.06] text-text-primary rounded-xl border border-white/[0.05] transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/smart-extract-i')} className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                New Extract
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Total Candidates', value: totalCount, icon: FileText, color: 'indigo' },
              { label: 'Completed Pipeline', value: `${fullyCompleted} / ${totalCount}`, icon: Award, color: 'emerald' },
              { label: 'Average Score', value: avgScore > 0 ? `${avgScore.toFixed(1)} / 10` : 'N/A', icon: TrendingUp, color: 'amber' }
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
                  <p className="text-xl font-extrabold text-text-primary mt-1">{value}</p>
                </div>
                <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400 border border-${color}-500/20`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="flex items-center bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2.5 gap-3">
            <Search className="w-4 h-4 text-text-muted shrink-0" />
            <input
              type="text"
              placeholder="Filter by Candidate Name or JD ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-text-primary placeholder-text-muted/50 w-full"
            />
          </div>

          {/* Error Alert */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          {/* Candidate Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm font-semibold">Fetching candidates...</p>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-2xl p-16 text-center">
              <FileText className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
              <p className="text-base font-bold text-text-primary">No Candidates Found</p>
              <p className="text-text-muted text-xs mt-1">Upload files through Smart Extract to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredCandidates.map(c => {
                const date = c.updatedAt
                  ? new Date(c.updatedAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })
                  : 'N/A';
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/dashboard-i/candidate?jobId=${c.jobId}&candidateName=${encodeURIComponent(c.candidateName)}`)}
                    className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-indigo-500/30 p-5 rounded-2xl transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-extrabold text-text-primary group-hover:text-indigo-400 transition-colors">
                          {c.candidateName}
                        </h3>
                        <span className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] text-text-muted rounded text-[10px] font-bold">
                          {c.jobId}
                        </span>
                        <button
                          onClick={(e) => handleRestartCandidate(c.jobId, c.candidateName, e)}
                          className="ml-auto p-1.5 hover:bg-orange-500/10 text-text-muted hover:text-orange-400 rounded-lg transition-all border border-transparent hover:border-orange-500/30"
                          title="Restart evaluation"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Updated: {date}</span>
                        {c.panelName && <span className="flex items-center gap-1">Panel: {c.panelName}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Stage status chips */}
                      <div className="flex items-center gap-2">
                        {getStageBadge(c.stage1Status, 'S1')}
                        {getStageBadge(c.stage2Status, 'S2')}
                        {getStageBadge(c.stage3Status, 'S3')}
                        {getStageBadge(c.stage4Status, 'S4')}
                      </div>

                      {/* Score chip */}
                      <div className="flex items-center gap-3 pl-4 md:border-l border-white/10">
                        <div>
                          <p className="text-[9px] uppercase tracking-wider font-bold text-text-muted text-right">Latest Score</p>
                          <p className={`text-base font-black text-right ${
                            c.latestScore !== null
                              ? c.latestScore >= 8 ? 'text-emerald-400' : c.latestScore >= 5 ? 'text-amber-400' : 'text-red-400'
                              : 'text-text-muted'
                          }`}>
                            {c.latestScore !== null ? `${c.latestScore.toFixed(1)}/10` : 'N/A'}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-text-muted group-hover:translate-x-1 group-hover:text-indigo-400 transition-all shrink-0" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
