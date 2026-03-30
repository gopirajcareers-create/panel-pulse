import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useDashboardStore } from '@/lib/stores/dashboard.store';
import dashboardApi from '@/lib/api/dashboard.api';
import { DashboardHeader } from '@/components/features/dashboard/DashboardHeader';
import { QuickStatsCards } from '@/components/features/dashboard/QuickStatsCards';
import { RecentEvaluations } from '@/components/features/dashboard/RecentEvaluations';
import { ScoreDistribution } from '@/components/features/dashboard/ScoreDistribution';
import { PanelEfficiency } from '@/components/features/dashboard/PanelEfficiency';
import { SearchFilter, type SearchFilters } from '@/components/features/dashboard/SearchFilter';
import { EvaluationsList } from '@/components/features/dashboard/EvaluationsList';
import { AppShell } from '@/components/layout/AppShell';
import type { SearchResponse } from '@/types/dashboard.types';

export default function DashboardPage() {
  const { stats, loading, error, fetchStats } = useDashboardStore();
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalPanels, setTotalPanels] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [currentFilters, setCurrentFilters] = useState<SearchFilters>({
    jobInterviewId: '',
    panelName: '',
    candidateName: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchStats();
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }

      try {
        await loadAllEvaluations(sortBy, sortOrder, scoreFilter);
      } catch (err) {
        console.error('Failed to load evaluations:', err);
      }

      try {
        await loadTotalPanels();
      } catch (err) {
        console.error('Failed to load total panels:', err);
      }
    };

    loadData();
  }, [fetchStats]);

  const loadTotalPanels = async () => {
    try {
      const efficiency = await dashboardApi.fetchPanelEfficiency();
      setTotalPanels(efficiency?.totalPanels ?? 0);
    } catch {
      setTotalPanels(0);
    }
  };

  const loadAllEvaluations = async (sort: string, order: 'asc' | 'desc', filter: string) => {
    setSearchLoading(true);
    try {
      const results = await dashboardApi.searchEvaluations(
        undefined, undefined, undefined, 50, 0, sort, order, filter
      );
      setSearchResults(results);
      setHasSearched(false);
    } catch (err) {
      console.error('Failed to load evaluations:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = async (filters: SearchFilters) => {
    setSearchLoading(true);
    setCurrentFilters(filters);
    try {
      const results = await dashboardApi.searchEvaluations(
        filters.jobInterviewId || undefined,
        filters.panelName || undefined,
        filters.candidateName || undefined,
        50, 0, sortBy, sortOrder, scoreFilter
      );
      setSearchResults(results);
      setHasSearched(true);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSort = async (newSortBy: string, newSortOrder: 'asc' | 'desc', newScoreFilter: string = 'all') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setScoreFilter(newScoreFilter);
    setSearchLoading(true);
    try {
      const results = await dashboardApi.searchEvaluations(
        currentFilters.jobInterviewId || undefined,
        currentFilters.panelName || undefined,
        currentFilters.candidateName || undefined,
        50, 0, newSortBy, newSortOrder, newScoreFilter
      );
      setSearchResults(results);
    } catch (err) {
      console.error('Sort error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleReset = () => {
    setSearchResults(null);
    setHasSearched(false);
    setSortBy('created_at');
    setSortOrder('desc');
    setScoreFilter('all');
    setCurrentFilters({
      jobInterviewId: '',
      panelName: '',
      candidateName: ''
    });
    fetchStats();
    loadAllEvaluations('created_at', 'desc', 'all');
  };

  const displayEvaluations = searchResults ? searchResults.evaluations : [];
  const displayStats = hasSearched && searchResults
    ? {
        totalEvaluations: searchResults.totalEvaluations,
        averageScore: searchResults.averageScore,
        scoreDistribution: searchResults.scoreDistribution,
      }
    : stats;

  return (
    <AppShell>
      <main className="min-h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" role="main" aria-label="Dashboard">
        {/* Lean Header */}
        <div className="bg-slate-800/40 border-b border-slate-700/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-8 py-3">
            <DashboardHeader />
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-8 py-6 space-y-5">
          {/* Error Alert */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-6 py-4 rounded-lg backdrop-blur-sm" role="alert">
              <p className="font-bold">Error loading dashboard</p>
              <p className="text-sm mt-1 opacity-90">{error}</p>
            </div>
          )}

          {/* Quick Stats Grid — 3 compact cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickStatsCards
              totalEvaluations={displayStats?.totalEvaluations}
              averageScore={displayStats?.averageScore ?? 0}
              totalPanels={totalPanels}
              loading={loading || searchLoading}
            />
          </div>

          {/* Search and Filter */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl backdrop-blur-sm">
            <SearchFilter onSearch={handleSearch} onReset={handleReset} loading={searchLoading} />
          </div>

          {/* All Evaluations */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary tracking-tight">
                  {hasSearched ? 'Search Results' : 'All Evaluations'}
                </h3>
                <p className="text-text-muted text-xs mt-1 font-medium italic">
                  {displayEvaluations.length} evaluation{displayEvaluations.length !== 1 ? 's' : ''} found
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-text-primary text-xs font-semibold rounded-lg border border-slate-600/50 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  View All
                </button>
                
                <div className="h-6 w-px bg-slate-700/50 mx-1" />

                <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-700/50 rounded-lg px-3 py-1.5 shadow-inner">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Sort:</span>
                  <select
                    value={scoreFilter !== 'all' ? scoreFilter : sortOrder}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'asc' || val === 'desc') {
                        handleSort('averageScore', val as 'asc' | 'desc', 'all');
                      } else {
                        handleSort('averageScore', 'desc', val);
                      }
                    }}
                    className="bg-transparent border-none text-xs font-bold text-orange-400 focus:ring-0 cursor-pointer min-w-[100px]"
                  >
                    <option value="desc" className="bg-slate-900">Descending</option>
                    <option value="asc" className="bg-slate-900">Ascending</option>
                    <option value="good" className="bg-slate-900 text-emerald-400">Good (8.0+)</option>
                    <option value="moderate" className="bg-slate-900 text-orange-400">Moderate (5-7.9)</option>
                    <option value="low" className="bg-slate-900 text-red-400">Low (&lt; 5)</option>
                  </select>
                </div>
              </div>
            </div>
            <EvaluationsList
              evaluations={displayEvaluations}
              loading={searchLoading}
              pagination={hasSearched && searchResults ? searchResults.pagination : undefined}
              onSort={handleSort}
              sortBy={sortBy}
              sortOrder={sortOrder}
              scoreFilter={scoreFilter}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl hover:border-slate-600/70 transition-all duration-300 backdrop-blur-sm">
              <PanelEfficiency />
            </div>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl hover:border-slate-600/70 transition-all duration-300 backdrop-blur-sm">
              <ScoreDistribution data={displayStats?.scoreDistribution} loading={loading || searchLoading} />
            </div>
          </div>

          {/* Recent Evaluations */}
          {!hasSearched && stats?.recentEvaluations && stats.recentEvaluations.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl backdrop-blur-sm">
              <RecentEvaluations evaluations={stats.recentEvaluations} loading={loading} />
            </div>
          )}
        </div>

        <div className="h-8"></div>
      </main>
    </AppShell>
  );
}
