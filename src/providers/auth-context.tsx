"use client";
import { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { onAuthStateChange, signOut as firebaseSignOut, User } from "@/lib/firebase/auth";
import { syncUser, getUserProfile, type UserProfile } from "@/lib/api-client/auth";

type Subscription = "free" | "pro";
type AuthCtx = {
  user: User | null;
  userId: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  subscription: Subscription;
  userProfile: UserProfile | null;
  signOut: () => Promise<void>;
  setSubscription: (sub: Subscription) => void;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription>("free");
  const [isLoading, setIsLoading] = useState(true);

  // Listen to Firebase auth state changes
  useEffect(() => {
    let isMounted = true;
    let currentRequestId = 0;

    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      const requestId = ++currentRequestId;

      setIsLoading(true);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          // Sync/ensure user exists in backend
          // Only send display_name and photo_url updates
          // Backend will preserve existing organization/role/preferences if not provided
          // This prevents overwriting data that was set during signup
          const syncData: { display_name?: string; photo_url?: string } = {};

          // Only include display_name if it exists
          if (firebaseUser.displayName) {
            syncData.display_name = firebaseUser.displayName;
          }

          // Only include photo_url if it exists
          if (firebaseUser.photoURL) {
            syncData.photo_url = firebaseUser.photoURL;
          }

          await syncUser(syncData);

          // Check if this request is still valid before updating state
          if (!isMounted || requestId !== currentRequestId) {
            return;
          }

          // Then fetch the complete user profile with all backend data (role, organization, preferences, etc.)
          const profile = await getUserProfile();

          if (!isMounted || requestId !== currentRequestId) {
            return;
          }

          setUserProfile(profile);
        } catch (error) {
          console.error("Error syncing/fetching user profile:", error);
          
          if (!isMounted || requestId !== currentRequestId) {
            return;
          }
          
          // Mark profile as unavailable so UI can detect partial authentication state
          setUserProfile(null);
        }
      } else {
        if (!isMounted || requestId !== currentRequestId) {
          return;
        }
        setUserProfile(null);
      }

      if (!isMounted || requestId !== currentRequestId) {
        return;
      }

      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await firebaseSignOut();
      setUser(null);
      setUserProfile(null);
      setSubscription("free");
    } catch (error) {
      console.error("Error signing out:", error);
      throw error;
    }
  };

  const refreshProfile = useCallback(async () => {
    const currentUser = user;
    if (!currentUser) return;
    
    try {
      // Sync first to ensure user is up to date
      await syncUser({
        display_name: currentUser.displayName || undefined,
        photo_url: currentUser.photoURL || undefined,
      });
      
      // Check if user is still logged in after async operation
      if (!user) {
        console.log("User signed out during profile refresh");
        return;
      }
      
      // Then fetch the complete profile
      const profile = await getUserProfile();
      
      // Final check before updating state
      if (!user) {
        console.log("User signed out during profile refresh");
        return;
      }
      
      setUserProfile(profile);
    } catch (error) {
      console.error("Error refreshing profile:", error);
      throw error;
    }
  }, [user]);

  const value = useMemo<AuthCtx>(() => ({
    user,
    userId: user?.uid || null,
    isLoggedIn: !!user,
    isLoading,
    subscription,
    userProfile,
    signOut: handleSignOut,
    setSubscription,
    refreshProfile,
  }), [user, isLoading, subscription, userProfile, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
