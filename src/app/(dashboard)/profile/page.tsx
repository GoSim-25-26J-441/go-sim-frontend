"use client";

import { useAuth } from "@/providers/auth-context";
import { useState, useEffect } from "react";
import { InputField } from "@/components/common/inputFeild/page";
import { updateUserProfile } from "@/lib/api-client/auth";
import { Edit2, Save, X } from "lucide-react";

export default function ProfilePage() {
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

  // Initialize form data from user profile
  useEffect(() => {
    if (userProfile) {
      setFormData({
        display_name: userProfile.display_name || "",
        organization: userProfile.organization || "",
      });
    }
  }, [userProfile]);

  // Get display name and photo for avatar
  const displayName = userProfile?.display_name || user?.displayName || user?.email || "User";
  const photoUrl = userProfile?.photo_url || user?.photoURL;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Format date for display
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
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
    // Clear success message when user starts editing
    if (successMessage) {
      setSuccessMessage("");
    }
  };

  const handleCancel = () => {
    // Reset form data to original values
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
      // Update profile via API
      await updateUserProfile({
        display_name: formData.display_name.trim() || undefined,
        organization: formData.organization.trim() || undefined,
      });

      // Refresh profile data
      await refreshProfile();

      setSuccessMessage("Profile updated successfully!");
      setIsEditing(false);

      // Clear success message after 3 seconds
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-white/60 mt-1">Manage your account settings and connected accounts</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit Profile
          </button>
        )}
      </div>

      {/* User Information Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Personal Information</h2>
          
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  className="w-24 h-24 rounded-full object-cover border-2 border-border"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-semibold border-2 border-border">
                  {initials}
                </div>
              )}
            </div>

            {/* User Details */}
            <div className="flex-1 space-y-4">
              {/* Success Message */}
              {successMessage && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-green-400 text-sm">{successMessage}</p>
                </div>
              )}

              {/* General Error Message */}
              {errors.general && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">{errors.general}</p>
                </div>
              )}

              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField
                    name="display_name"
                    label="Display Name"
                    placeholder="Enter your display name"
                    value={formData.display_name}
                    onChange={handleChange}
                    error={errors.display_name}
                    required={false}
                  />

                  <div>
                    <p className="text-sm text-white/60 mb-1">Email</p>
                    <p className="font-medium text-white/40">{userProfile?.email || user?.email || "N/A"}</p>
                    <p className="text-xs text-white/40 mt-1">Email cannot be changed</p>
                  </div>

                  <InputField
                    name="organization"
                    label="Organization"
                    placeholder="Enter your organization"
                    value={formData.organization}
                    onChange={handleChange}
                    error={errors.organization}
                    required={false}
                  />

                  <div>
                    <p className="text-sm text-white/60 mb-1">Role</p>
                    <p className="font-medium text-white/40">{userProfile?.role || "Not set"}</p>
                    <p className="text-xs text-white/40 mt-1">Role cannot be changed</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-white/60 mb-1">Display Name</p>
                    <p className="font-medium">{displayName}</p>
                  </div>

                  <div>
                    <p className="text-sm text-white/60 mb-1">Email</p>
                    <p className="font-medium">{userProfile?.email || user?.email || "N/A"}</p>
                  </div>

                  <div>
                    <p className="text-sm text-white/60 mb-1">Organization</p>
                    <p className="font-medium">{userProfile?.organization || "Not set"}</p>
                  </div>

                  <div>
                    <p className="text-sm text-white/60 mb-1">Role</p>
                    <p className="font-medium">{userProfile?.role || "Not set"}</p>
                  </div>
                </div>
              )}

              {/* Read-only information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-sm text-white/60 mb-1">Account Created</p>
                  <p className="font-medium">{formatDate(userProfile?.created_at)}</p>
                </div>

                <div>
                  <p className="text-sm text-white/60 mb-1">Last Updated</p>
                  <p className="font-medium">{formatDate(userProfile?.updated_at)}</p>
                </div>

                <div>
                  <p className="text-sm text-white/60 mb-1">Last Login</p>
                  <p className="font-medium">{formatDate(userProfile?.last_login_at)}</p>
                </div>
              </div>

              {/* Edit Mode Actions */}
              {isEditing && (
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Connected Accounts Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Connected Accounts</h2>
          <p className="text-sm text-white/60">Manage your sign-in methods and connected accounts</p>
        </div>

        <div className="space-y-3">
          {/* Google Account */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-black/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
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
              <div>
                <p className="font-medium">Google</p>
                <p className="text-sm text-white/60">
                  {linkedProviders.includes("google.com") ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {linkedProviders.includes("google.com") ? (
                <span className="px-3 py-1 text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 rounded">
                  Connected
                </span>
              ) : (
                <button
                  className="px-3 py-1 text-xs font-medium bg-white text-black hover:bg-white/90 rounded transition-colors"
                  disabled
                  title="Account linking coming soon"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* GitHub Account (placeholder for future) */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-black/50 opacity-60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">GitHub</p>
                <p className="text-sm text-white/60">Coming soon</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 text-xs font-medium bg-white/50 text-black/50 rounded cursor-not-allowed"
                disabled
                title="GitHub connection coming soon"
              >
                Connect
              </button>
            </div>
          </div>

          {/* Email/Password Account */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-black/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium">Email/Password</p>
                <p className="text-sm text-white/60">
                  {linkedProviders.includes("password") ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {linkedProviders.includes("password") ? (
                <span className="px-3 py-1 text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 rounded">
                  Connected
                </span>
              ) : (
                <button
                  className="px-3 py-1 text-xs font-medium bg-white text-black hover:bg-white/90 rounded transition-colors"
                  disabled
                  title="Account linking coming soon"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
