"use client";
import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { onAuthStateChange, signOut as firebaseSignOut, User, getFirebaseIdToken } from "@/lib/firebase/auth";
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
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      setIsLoading(true);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          // First, try to fetch existing profile to check if user already has data
          let existingProfile: UserProfile | null = null;
          try {
            existingProfile = await getUserProfile();
          } catch (fetchError) {
            // User might not exist in backend yet, that's okay - will be created on sync
            console.log("User profile not found in backend, will create new one");
          }

          // Sync/ensure user exists in backend
          // Only send display_name and photo_url updates
          // Backend will preserve existing organization/role/preferences if not provided
          // This prevents overwriting data that was set during signup
          const syncData: { display_name?: string; photo_url?: string } = {};
          
          // Only include display_name if it exists and is different
          if (firebaseUser.displayName) {
            syncData.display_name = firebaseUser.displayName;
          }
          
          // Only include photo_url if it exists
          if (firebaseUser.photoURL) {
            syncData.photo_url = firebaseUser.photoURL;
          }

          await syncUser(syncData);
          
          // Then fetch the complete user profile with all backend data (role, organization, preferences, etc.)
          const profile = await getUserProfile();
          setUserProfile(profile);
        } catch (error) {
          console.error("Error syncing/fetching user profile:", error);
          // Continue even if sync/fetch fails - user is still authenticated
        }
      } else {
        setUserProfile(null);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
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

  const refreshProfile = async () => {
    if (!user) return;
    try {
      // Sync first to ensure user is up to date
      await syncUser({
        display_name: user.displayName || undefined,
        photo_url: user.photoURL || undefined,
      });
      
      // Then fetch the complete profile
      const profile = await getUserProfile();
      setUserProfile(profile);
    } catch (error) {
      console.error("Error refreshing profile:", error);
      throw error;
    }
  };

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
  }), [user, isLoading, subscription, userProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
