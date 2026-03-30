import { create } from 'zustand';
import { dashboardApi } from '@/lib/api/dashboard.api';
import type { DashboardStats } from '@/types/dashboard.types';

interface DashboardState {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  clear: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  loading: false,
  error: null,
  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await dashboardApi.fetchStats();
      set({ stats, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? 'Failed to load dashboard stats' });
    }
  },
  clear: () => set({ stats: null, loading: false, error: null }),
}));

export default useDashboardStore;
