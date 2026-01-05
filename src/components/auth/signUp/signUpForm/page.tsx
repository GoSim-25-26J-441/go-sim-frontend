"use client";

import { InputField } from "@/components/common/inputFeild/page";
import { TextAreaField } from "@/components/common/inputFeild/page";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signUpWithEmail } from "@/lib/firebase/auth";
import { updateProfile } from "firebase/auth";
import { syncUser } from "@/lib/api-client/auth";
import { useAuth } from "@/providers/auth-context";
import { AuthError } from "firebase/auth";

export default function SignUpForm() {
  const router = useRouter();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
    organization: "",
    purpose: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [sendUpdates, setSendUpdates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && isLoggedIn) {
      router.push("/dashboard");
    }
  }, [isLoggedIn, authLoading, router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
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
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));
    validateField(field);
  };

  const validateField = (field: string) => {
    const value = formData[field as keyof typeof formData];
    let error = "";

    if (!value.trim() && field !== "purpose") {
      error = "Please fill this field";
    } else if (
      field === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
      error = "Please enter a valid email";
    } else if (field === "password" && value.length < 6) {
      error = "Password must be at least 6 characters";
    } else if (field === "confirmPassword" && value !== formData.password) {
      error = "Passwords do not match. Please try again.";
    }

    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));

    return error;
  };

  const getFirebaseErrorMessage = (error: AuthError): string => {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/invalid-email":
        return "Invalid email address.";
      case "auth/weak-password":
        return "Password is too weak. Please use a stronger password.";
      case "auth/operation-not-allowed":
        return "Email/password accounts are not enabled. Please contact support.";
      case "auth/network-request-failed":
        return "Network error. Please check your connection.";
      default:
        return "Failed to create account. Please try again.";
    }
  };

  const handleSubmit = async () => {
    // Validate all required fields
    const requiredFields = [
      "fullName",
      "email",
      "password",
      "confirmPassword",
      "role",
      "organization",
    ];
    const newErrors: Record<string, string> = {};

    requiredFields.forEach((field) => {
      const error = validateField(field);
      if (error) newErrors[field] = error;
    });

    // Mark all required fields as touched
    const newTouched: Record<string, boolean> = {};
    requiredFields.forEach((field) => {
      newTouched[field] = true;
    });
    setTouched(newTouched);

    // Check terms agreement
    if (!agreeTerms) {
      setErrors({ general: "Please agree to the Terms and Privacy Policy to continue." });
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Create Firebase account
      const { user, error: signUpError } = await signUpWithEmail(
        formData.email,
        formData.password
      );

      if (signUpError) {
        setErrors({ general: getFirebaseErrorMessage(signUpError) });
        setIsSubmitting(false);
        return;
      }

      if (!user) {
        setErrors({ general: "Failed to create account. Please try again." });
        setIsSubmitting(false);
        return;
      }

      // Update Firebase profile with display name
      try {
        await updateProfile(user, {
          displayName: formData.fullName,
        });
      } catch (profileError) {
        console.warn("Failed to update display name:", profileError);
        // Continue even if profile update fails
      }

      // Sync user with backend including additional profile data
      // This must complete before redirect, otherwise AuthProvider's onAuthStateChange
      // will sync again with only display_name/photo_url and might overwrite our data
      try {
        const syncPayload = {
          display_name: formData.fullName.trim(),
          organization: formData.organization.trim(),
          role: formData.role.trim(),
          preferences: {
            ...(formData.purpose.trim() && { purpose: formData.purpose.trim() }),
            sendUpdates: sendUpdates,
          },
        };
        
        console.log("Syncing user data with backend:", syncPayload);
        
        const syncedProfile = await syncUser(syncPayload);
        console.log("User synced successfully with backend:", syncedProfile);
        
        // Verify that the data was saved correctly
        if (syncedProfile) {
          if (syncedProfile.organization !== formData.organization.trim() || 
              syncedProfile.role !== formData.role.trim()) {
            console.warn("Synced profile data doesn't match submitted data:", {
              submitted: { organization: formData.organization, role: formData.role },
              received: { organization: syncedProfile.organization, role: syncedProfile.role },
            });
          }
        }
        
        // Small delay to ensure backend has fully processed and stored the data
        // This prevents AuthProvider from overwriting during initial sync
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (syncError: any) {
        console.error("Failed to sync user with backend:", syncError);
        const errorMessage = syncError?.message || "Unknown error occurred";
        setErrors({ 
          general: `Account created but failed to save profile information: ${errorMessage}. Please update your profile after signing in.` 
        });
        setIsSubmitting(false);
        return;
      }

      // Success - redirect after sync completes
      router.push("/dashboard");
    } catch (error) {
      console.error("Sign up error:", error);
      setErrors({ general: "An unexpected error occurred. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = () => {
    router.push("/");
  };

  const isFormValid =
    formData.fullName.trim() &&
    formData.email.trim() &&
    formData.password.trim() &&
    formData.confirmPassword.trim() &&
    formData.role.trim() &&
    formData.organization.trim() &&
    agreeTerms &&
    !isSubmitting;

  return (
    <section className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col justify-start gap-2 py-8">
          <h1 className="text-2xl font-bold text-white">GO-SIM</h1>
          <h2 className="text-4xl font-bold text-white">Create your account</h2>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <p className="text-xs font-normal text-white/80">
              Start analyzing your microservice architectures in minutes.
            </p>
            <p className="text-xs font-normal text-white/80">
              Free plan • No credit card required
            </p>
          </div>

          <div className="bg-white w-full h-0.5" />
        </div>

        <div className="space-y-6">
          {/* Full Name and Email */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <InputField
                name="fullName"
                type="text"
                label="Full name"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={handleChange}
                onBlur={() => handleBlur("fullName")}
                error={touched.fullName ? errors.fullName : ""}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Use the name you registered with.
              </p>
            </div>

            <div>
              <InputField
                name="email"
                type="email"
                label="Email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                onBlur={() => handleBlur("email")}
                error={touched.email ? errors.email : ""}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {"We'll send important updates to this email."}
              </p>
            </div>
          </div>

          {/* Password and Confirm Password */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <InputField
                name="password"
                type="password"
                label="Password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                onBlur={() => handleBlur("password")}
                error={touched.password ? errors.password : ""}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Password must be at least 6 characters.
              </p>
            </div>

            <div>
              <InputField
                name="confirmPassword"
                type="password"
                label="Confirm password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={() => handleBlur("confirmPassword")}
                error={touched.confirmPassword ? errors.confirmPassword : ""}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Passwords do not match. Please try again.
              </p>
            </div>
          </div>

          {/* Optional Details Divider */}
          <div className="pt-4">
            <h3 className="text-lg font-bold text-white mb-4">
              Optional details
            </h3>
          </div>

          {/* Role and Organization */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <InputField
                name="role"
                type="text"
                label="I am a..."
                placeholder="e.g., Software Engineer"
                value={formData.role}
                onChange={handleChange}
                onBlur={() => handleBlur("role")}
                error={touched.role ? errors.role : ""}
                required
              />
            </div>

            <div>
              <InputField
                name="organization"
                type="text"
                label="Organization / Institution"
                placeholder="e.g., SLIIT, Team Alpha"
                value={formData.organization}
                onChange={handleChange}
                onBlur={() => handleBlur("organization")}
                error={touched.organization ? errors.organization : ""}
                required
              />
            </div>
          </div>

          {/* Purpose TextArea */}
          <div>
            <TextAreaField
              name="purpose"
              label="What will you use GO-SIM for?"
              placeholder="e.g., Academic research, production system design..."
              value={formData.purpose}
              onChange={handleChange}
              onBlur={() => handleBlur("purpose")}
              error={touched.purpose ? errors.purpose : ""}
              rows={4}
              required={false}
            />
            <p className="text-xs text-gray-500 mt-1">
              {"These fields help us understand who we're building for. Optional!"}
            </p>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-white/80">
                I agree to the{" "}
                <a
                  href="/terms"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Privacy Policy
                </a>
                . You need to agree to the Terms and Privacy Policy to continue.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendUpdates}
                onChange={(e) => setSendUpdates(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-white/80">
                Send me occasional updates about new features and research.
              </span>
            </label>
          </div>

          {/* General Error */}
          {errors.general && (
            <p className="text-red-400 text-sm">{errors.general}</p>
          )}

          {/* Submit Button */}
          <div className="flex flex-col pt-6">
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              className="w-full px-4 py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/80 transition-all disabled:bg-gray-600 disabled:text-white disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>
          </div>
        </div>

        {/* Sign In Link */}
        <div className="flex justify-center items-center my-8">
          <p className="text-sm font-normal text-white/90">
            Already have an account?{" "}
            <button
              onClick={handleSignIn}
              className="font-bold text-white hover:text-white/80 transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}