"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

type State = {
  last?: AnalysisResult;
  setLast: (r?: AnalysisResult) => void;

  editedYaml?: string;
  setEditedYaml: (yaml?: string) => void;
  clearEditedYaml: () => void;

  /** True while loading a version (re-analyzing YAML); patterns page shows overlay */
  regenerating: boolean;
  setRegenerating: (v: boolean) => void;

  /** Patterns graph fullscreen workspace — dashboard Topbar scrolls away with content when true. */
  patternsGraphFullscreen: boolean;
  setPatternsGraphFullscreen: (v: boolean) => void;

  /**
   * Last “committed” graph + YAML (after load, successful generate, version switch, or apply).
   * Not persisted — used only to reset canvas edits in-session.
   */
  baselineLast?: AnalysisResult;
  baselineEditedYaml?: string;
  commitGraphBaseline: () => void;
  resetGraphBaseline: () => boolean;
};

export const useAmgApdStore = create<State>()(
  persist(
    (set, get) => ({
      last: undefined,
      setLast: (r?: AnalysisResult) =>
        set({
          last: r,
        }),

      editedYaml: undefined,
      setEditedYaml: (yaml?: string) => set({ editedYaml: yaml }),
      clearEditedYaml: () => set({ editedYaml: undefined }),

      regenerating: false,
      setRegenerating: (v: boolean) => set({ regenerating: v }),

      patternsGraphFullscreen: false,
      setPatternsGraphFullscreen: (v: boolean) =>
        set({ patternsGraphFullscreen: v }),

      baselineLast: undefined,
      baselineEditedYaml: undefined,
      commitGraphBaseline: () => {
        const { last, editedYaml } = get();
        if (!last?.graph || editedYaml == null || editedYaml === "") return;
        set({
          baselineLast: JSON.parse(JSON.stringify(last)) as AnalysisResult,
          baselineEditedYaml: editedYaml,
        });
      },
      resetGraphBaseline: () => {
        const { baselineLast, baselineEditedYaml } = get();
        if (!baselineLast?.graph || baselineEditedYaml == null) return false;
        set({
          last: JSON.parse(JSON.stringify(baselineLast)) as AnalysisResult,
          editedYaml: baselineEditedYaml,
        });
        return true;
      },
    }),
    {
      name: "amg_apd_store",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        last: state.last,
        editedYaml: state.editedYaml,
      }),
    }
  )
);
