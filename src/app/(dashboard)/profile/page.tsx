"use client";

import { useAuth } from "@/providers/auth-context";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { InputField } from "@/components/common/inputFeild/page";
import { updateUserProfile } from "@/lib/api-client/auth";
import { Edit2, Save, X, ArrowLeft } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { user, userProfile, refreshProfile } = useAuth();
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    display_name: "",
    organization: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string>("");

  useEffect(() => {
    if (user && user.providerData) {
      const providers = user.providerData.map((provider) => provider.providerId);
      setLinkedProviders(providers);
    }
  }, [user]);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        display_name: userProfile.display_name || "",
        organization: userProfile.organization || "",
      });
    }
  }, [userProfile]);

  const displayName = userProfile?.display_name || user?.displayName || user?.email || "User";
  const photoUrl = userProfile?.photo_url || user?.photoURL;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
    if (successMessage) {
      setSuccessMessage("");
    }
  };

  const handleCancel = () => {
    if (userProfile) {
      setFormData({
        display_name: userProfile.display_name || "",
        organization: userProfile.organization || "",
      });
    }
    setErrors({});
    setSuccessMessage("");
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrors({});
    setSuccessMessage("");

    try {
      await updateUserProfile({
        display_name: formData.display_name.trim() || undefined,
        organization: formData.organization.trim() || undefined,
      });

      await refreshProfile();

      setSuccessMessage("Profile updated successfully!");
      setIsEditing(false);

      setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error updating profile:", error);
      setErrors({
        general: error instanceof Error ? error.message : "Failed to update profile. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/40 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-md font-bold text-white">Profile</h1>
            <p className="mt-0.5 text-xs text-white/60">
              Manage your account settings and connected accounts
            </p>
          </div>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-white/90"
          >
            <Edit2 className="h-3 w-3" />
            Edit Profile
          </button>
        )}
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-5">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Personal Information</h2>
          <div className="overflow-hidden rounded-lg bg-white/4">
            <div className="flex flex-col gap-6 p-4 md:flex-row md:items-start md:p-5">
              <div className="flex shrink-0 justify-center md:justify-start">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    className="h-24 w-24 rounded-full border-2 border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 bg-blue-600 text-2xl font-semibold text-white">
                    {initials}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                {successMessage && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-sm text-emerald-200">{successMessage}</p>
                  </div>
                )}

                {errors.general && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-sm text-red-300">{errors.general}</p>
                  </div>
                )}

                {isEditing ? (
                  <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-2 md:divide-x md:divide-y-0">
                    <div className="min-w-0 py-3 md:px-4 md:py-3">
                      <InputField
                        name="display_name"
                        label="Display Name"
                        placeholder="Enter your display name"
                        value={formData.display_name}
                        onChange={handleChange}
                        error={errors.display_name}
                        required={false}
                      />
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-3">
                      <p className="text-xs text-white/60">Email</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        {userProfile?.email || user?.email || "N/A"}
                      </p>
                      <p className="mt-1 text-xs text-white/45">Email cannot be changed</p>
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-3">
                      <InputField
                        name="organization"
                        label="Organization"
                        placeholder="Enter your organization"
                        value={formData.organization}
                        onChange={handleChange}
                        error={errors.organization}
                        required={false}
                      />
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-3">
                      <p className="text-xs text-white/60">Role</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{userProfile?.role || "Not set"}</p>
                      <p className="mt-1 text-xs text-white/45">Role cannot be changed</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-2 md:divide-x md:divide-y-0">
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Display Name</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{displayName}</p>
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Email</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        {userProfile?.email || user?.email || "N/A"}
                      </p>
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Organization</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        {userProfile?.organization || "Not set"}
                      </p>
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Role</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{userProfile?.role || "Not set"}</p>
                    </div>
                  </div>
                )}

                <div className="border-t border-white/40 pt-4">
                  <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-3 md:divide-x md:divide-y-0">
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Account Created</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{formatDate(userProfile?.created_at)}</p>
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Last Updated</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{formatDate(userProfile?.updated_at)}</p>
                    </div>
                    <div className="min-w-0 py-3 md:px-4 md:py-2">
                      <p className="text-xs text-white/60">Last Login</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{formatDate(userProfile?.last_login_at)}</p>
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/40 pt-4">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-600/80 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" />
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Connected Accounts</h2>
            <p className="mt-1 text-xs text-white/50">
              Manage your sign-in methods and connected accounts
            </p>
          </div>

          <ul className="divide-y divide-white/40">
            <li className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
                  <svg className="h-6 w-6" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Google</p>
                  <p className="text-xs text-white/55">
                    {linkedProviders.some((p) => p === "google.com") ? "Connected" : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {linkedProviders.some((p) => p === "google.com") ? (
                  <span className="rounded border border-green-500/30 bg-green-500/20 px-3 py-1 text-xs font-medium text-green-400">
                    Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-white/90"
                    disabled
                    title="Account linking coming soon"
                  >
                    Connect
                  </button>
                )}
              </div>
            </li>

            <li className="flex flex-wrap items-center justify-between gap-4 py-5 opacity-60">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">GitHub</p>
                  <p className="text-xs text-white/55">Coming soon</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="cursor-not-allowed rounded-lg bg-white/50 px-3 py-1 text-xs font-medium text-black/50"
                  disabled
                  title="GitHub connection coming soon"
                >
                  Connect
                </button>
              </div>
            </li>

            <li className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-700">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Email/Password</p>
                  <p className="text-xs text-white/55">
                    {linkedProviders.includes("password") ? "Connected" : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {linkedProviders.includes("password") ? (
                  <span className="rounded border border-green-500/30 bg-green-500/20 px-3 py-1 text-xs font-medium text-green-400">
                    Connected
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-white/90"
                    disabled
                    title="Account linking coming soon"
                  >
                    Connect
                  </button>
                )}
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
