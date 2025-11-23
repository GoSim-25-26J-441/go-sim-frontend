"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

type State = {
  last?: AnalysisResult;
  setLast: (r?: AnalysisResult) => void;
};

export const useAmgApdStore = create<State>()(
  persist(
    (set) => ({
      last: undefined,
      setLast: (r?: AnalysisResult) => set({ last: r }),
    }),
    {
      name: "amg_last", // storage key
      storage: createJSONStorage(() => sessionStorage), // survive route change/refresh (per tab)
    }
  )
);
