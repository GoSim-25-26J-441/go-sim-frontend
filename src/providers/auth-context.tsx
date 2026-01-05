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
          // First sync/ensure user exists in backend (creates if new, updates last_login if existing)
          await syncUser({
            display_name: firebaseUser.displayName || undefined,
            photo_url: firebaseUser.photoURL || undefined,
          });
          
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
