import { create } from 'zustand';

interface UIState {
  isLoading: boolean;
  isModalOpen: boolean;
  modalType: 'evaluation' | 'history' | 'settings' | null;
  modalData: any;
  toast: { type: 'success' | 'error' | 'info'; message: string } | null;
  setLoading: (v: boolean) => void;
  openModal: (type: 'evaluation' | 'history' | 'settings', data?: any) => void;
  closeModal: () => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  clearToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  isModalOpen: false,
  modalType: null,
  modalData: null,
  toast: null,
  setLoading: (v) => set({ isLoading: v }),
  openModal: (type, data) => set({ isModalOpen: true, modalType: type, modalData: data }),
  closeModal: () => set({ isModalOpen: false, modalType: null, modalData: null }),
  showToast: (type, message) => set({ toast: { type, message } }),
  clearToast: () => set({ toast: null }),
}));
