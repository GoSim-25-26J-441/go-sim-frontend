"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/providers/auth-context";
import { updateUserProfile } from "@/lib/api-client/auth";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";

function wantsGuidesFromProfile(
  newDesigner: string | undefined,
): boolean {
  return newDesigner !== "No";
}

/**
 * Syncs patterns guide UI with `user.new_designer` and persists toggles via PUT /auth/profile.
 */
export function usePatternsGuidesWithProfile() {
  const { userProfile, isLoading, refreshProfile } = useAuth();
  const guidesActive = useAmgApdStore((s) => s.patternsGuidesEnabled);
  const togglePatternsGuides = useAmgApdStore((s) => s.togglePatternsGuides);

  useEffect(() => {
    if (isLoading) return;
    if (!userProfile) return;
    if (wantsGuidesFromProfile(userProfile.new_designer)) {
      useAmgApdStore.setState({
        patternsGuidesEnabled: true,
        patternsGuidesWelcomeOnEnable: true,
      });
    } else {
      useAmgApdStore.setState({
        patternsGuidesEnabled: false,
        patternsGuidesWelcomeOnEnable: false,
      });
    }
  }, [isLoading, userProfile?.new_designer]);

  const toggleGuides = useCallback(async () => {
    const cur = useAmgApdStore.getState().patternsGuidesEnabled;
    const nextDb = cur ? "No" : "Yes";
    togglePatternsGuides();
    try {
      await updateUserProfile({ new_designer: nextDb });
      await refreshProfile();
    } catch (e) {
      togglePatternsGuides();
      console.error("Failed to persist patterns guides preference:", e);
      throw e;
    }
  }, [togglePatternsGuides, refreshProfile]);

  const setGuidesEnabledAndPersist = useCallback(
    async (enabled: boolean) => {
      const nextDb = enabled ? "Yes" : "No";
      const prev = useAmgApdStore.getState().patternsGuidesEnabled;
      useAmgApdStore.getState().setPatternsGuidesEnabled(enabled);
      try {
        await updateUserProfile({ new_designer: nextDb });
        await refreshProfile();
      } catch (e) {
        useAmgApdStore.getState().setPatternsGuidesEnabled(prev);
        console.error("Failed to persist patterns guides preference:", e);
        throw e;
      }
    },
    [refreshProfile],
  );

  return { guidesActive, toggleGuides, setGuidesEnabledAndPersist };
}
