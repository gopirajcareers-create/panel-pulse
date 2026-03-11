import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchStats();
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
      
      try {
        await loadAllEvaluations();
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

  const loadAllEvaluations = async () => {
    setSearchLoading(true);
    try {
      const results = await dashboardApi.searchEvaluations();
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
    try {
      const results = await dashboardApi.searchEvaluations(
        filters.jobInterviewId || undefined,
        filters.panelName || undefined,
        filters.candidateName || undefined
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

  const handleReset = () => {
    setSearchResults(null);
    setHasSearched(false);
    fetchStats();
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
            <div className="mb-4">
              <h3 className="text-base font-semibold text-text-primary">
                {hasSearched ? 'Search Results' : 'All Evaluations'}
              </h3>
              <p className="text-text-secondary text-xs mt-0.5">
                {displayEvaluations.length} evaluation{displayEvaluations.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <EvaluationsList
              evaluations={displayEvaluations}
              loading={searchLoading}
              pagination={hasSearched && searchResults ? searchResults.pagination : undefined}
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
