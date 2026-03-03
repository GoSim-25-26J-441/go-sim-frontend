import { create } from 'zustand';

interface LoadingStore {
  isLoading: boolean;
  loadingCount: number;
  setLoading: (loading: boolean) => void;
}

export const useLoading = create<LoadingStore>((set) => ({
  isLoading: false,
  loadingCount: 0,
  setLoading: (loading: boolean) => {
    set((state) => {
      const newCount = loading ? state.loadingCount + 1 : Math.max(0, state.loadingCount - 1);
      return {
        loadingCount: newCount,
        isLoading: newCount > 0,
      };
    });
  },
}));
