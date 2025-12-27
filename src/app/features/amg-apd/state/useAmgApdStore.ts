"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

type State = {
  last?: AnalysisResult;
  setLast: (r?: AnalysisResult) => void;

  editedYaml?: string;
  setEditedYaml: (yaml?: string) => void;
};

export const useAmgApdStore = create<State>()(
  persist(
    (set) => ({
      last: undefined,
      setLast: (r?: AnalysisResult) =>
        set({
          last: r,
          // whenever we get a fresh analysis from backend,
          // clear any previous edited YAML
          editedYaml: undefined,
        }),

      editedYaml: undefined,
      setEditedYaml: (yaml?: string) => set({ editedYaml: yaml }),
    }),
    {
      // IMPORTANT: new key → avoids conflict with previous manual "amg_last"
      name: "amg_apd_store",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
