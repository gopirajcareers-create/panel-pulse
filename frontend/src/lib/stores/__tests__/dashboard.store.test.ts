import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDashboardStore } from '../dashboard.store';
import { dashboardApi } from '../../api/dashboard.api';

vi.mock('../../api/dashboard.api', () => ({
  dashboardApi: {
    fetchStats: vi.fn(),
  },
}));

describe('Dashboard Store', () => {
  beforeEach(() => {
    useDashboardStore.setState({ stats: undefined, loading: false, error: undefined });
    vi.clearAllMocks();
  });

  describe('fetchStats action', () => {
    it('should fetch and set stats successfully', async () => {
      const mockStats = {
        totalEvaluations: 42,
        averageScore: 8.5,
        lastEvaluationDate: '2024-01-15',
        evaluationsThisWeek: 5,
        scoreDistribution: [
          { range: '8.0-10.0', count: 10 },
          { range: '6.0-8.0', count: 15 },
          { range: '4.0-6.0', count: 12 },
          { range: '0.0-4.0', count: 5 },
        ],
        dimensionTrends: [
          { date: '2024-01-08', dimension: 'Technical Skills', score: 8.2 },
          { date: '2024-01-08', dimension: 'Communication', score: 7.9 },
          { date: '2024-01-15', dimension: 'Technical Skills', score: 8.5 },
          { date: '2024-01-15', dimension: 'Communication', score: 8.1 },
        ],
        recentEvaluations: [],
      };

      vi.mocked(dashboardApi.fetchStats).mockResolvedValueOnce(mockStats);

      const store = useDashboardStore();
      await store.fetchStats();

      expect(store.stats).toEqual(mockStats);
      expect(store.loading).toBe(false);
      expect(store.error).toBeUndefined();
    });

    it('should set loading state during fetch', async () => {
      const store = useDashboardStore();
      let resolvePromise: () => void;
      const delayedPromise = new Promise<any>((resolve) => {
        resolvePromise = () => resolve({});
      });
      vi.mocked(dashboardApi.fetchStats).mockReturnValueOnce(delayedPromise);

      const fetchPromise = store.fetchStats();
      // Give state update time to process
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(store.loading).toBe(true);

      resolvePromise!();
      await fetchPromise;
      expect(store.loading).toBe(false);
    });

    it('should handle fetch errors', async () => {
      const mockError = 'Failed to fetch dashboard stats';
      vi.mocked(dashboardApi.fetchStats).mockRejectedValueOnce(new Error(mockError));

      const store = useDashboardStore();
      await store.fetchStats();

      expect(store.error).toBeDefined();
      expect(store.stats).toBeUndefined();
      expect(store.loading).toBe(false);
    });

    it('should clear error on successful refetch', async () => {
      const mockStats = {
        totalEvaluations: 42,
        averageScore: 8.5,
        lastEvaluationDate: '2024-01-15',
        evaluationsThisWeek: 5,
        scoreDistribution: [],
        dimensionTrends: [],
        recentEvaluations: [],
      };

      const store = useDashboardStore();
      // Simulate previous error state
      useDashboardStore.setState({ error: 'Previous error' });

      vi.mocked(dashboardApi.fetchStats).mockResolvedValueOnce(mockStats);

      await store.fetchStats();

      expect(store.error).toBeUndefined();
      expect(store.stats).toEqual(mockStats);
    });
  });

  describe('clear action', () => {
    it('should reset all state', () => {
      const mockStats = {
        totalEvaluations: 10,
        averageScore: 8,
        lastEvaluationDate: '2024-01-15',
        evaluationsThisWeek: 2,
        scoreDistribution: [{ range: '0-2', count: 0 }],
        dimensionTrends: [{ date: '2024-01-15', dimension: 'test', score: 5 }],
        recentEvaluations: [],
      };
      const store = useDashboardStore();
      useDashboardStore.setState({
        stats: mockStats,
        loading: true,
        error: 'Some error',
      });

      store.clear();

      expect(store.stats).toBeUndefined();
      expect(store.loading).toBe(false);
      expect(store.error).toBeUndefined();
    });
  });

  describe('state persistence', () => {
    it('should maintain stats across multiple accesses', async () => {
      const mockStats = {
        totalEvaluations: 42,
        averageScore: 8.5,
        lastEvaluationDate: '2024-01-15',
        evaluationsThisWeek: 5,
        scoreDistribution: [],
        dimensionTrends: [],
        recentEvaluations: [],
      };

      vi.mocked(dashboardApi.fetchStats).mockResolvedValueOnce(mockStats);

      const store1 = useDashboardStore();
      await store1.fetchStats();

      const store2 = useDashboardStore();
      expect(store2.stats).toEqual(mockStats);
    });
  });
});
