"use client";

import { InputField } from "@/components/common/inputFeild/page";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmPasswordReset } from "@/lib/firebase/auth";
import { isFirebaseInitialized } from "@/lib/firebase/config";
import { getFirebaseErrorMessage } from "@/utils/firebase-errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Extract oobCode from URL on mount
  useEffect(() => {
    const code = searchParams.get("oobCode");
    if (!code) {
      setCodeError("Invalid or missing reset code. Please request a new password reset.");
    } else {
      setOobCode(code);
    }
  }, [searchParams]);

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
    
    // Clear confirm password error when either password changes
    if (name === "password" && errors.confirmPassword) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: "",
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

  const validateField = (field: string): boolean => {
    const value = formData[field as keyof typeof formData];
    let error = "";

    if (!value.trim()) {
      error = "Please fill this field";
    } else if (field === "password" && value.length < 6) {
      error = "Password must be at least 6 characters";
    } else if (field === "confirmPassword") {
      if (value !== formData.password) {
        error = "Passwords do not match";
      }
    }

    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));

    return !error;
  };

  const validateForm = (): boolean => {
    const passwordValid = validateField("password");
    const confirmPasswordValid = validateField("confirmPassword");
    return passwordValid && confirmPasswordValid;
  };

  const checkFirebaseInitialized = () => {
    if (!isFirebaseInitialized) {
      console.error(
        "❌ Firebase is not initialized.\n" +
        "Please ensure you have:\n" +
        "1. Created a .env.local file from .env.example\n" +
        "2. Filled in all Firebase configuration variables\n" +
        "3. Restarted your development server (npm run dev)"
      );
      setErrors({ 
        general: "Firebase authentication is not configured. Please check your .env.local file and restart the development server." 
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!oobCode) {
      setCodeError("Invalid reset code. Please request a new password reset.");
      return;
    }

    // Validate form
    if (!validateForm()) {
      setTouched({ password: true, confirmPassword: true });
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setCodeError(null);

    // Check if Firebase is initialized
    if (!checkFirebaseInitialized()) {
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await confirmPasswordReset(oobCode, formData.password);

      if (error) {
        console.error("Password reset error:", error);
        const errorMessage = getFirebaseErrorMessage(error, "email");
        if (errorMessage) {
          // Check if it's a code-related error
          if (error.code === "auth/invalid-action-code" || error.code === "auth/expired-action-code") {
            setCodeError(errorMessage);
          } else {
            setErrors({ general: errorMessage });
          }
        }
        setIsSubmitting(false);
        return;
      }

      // Success - show success message and redirect after a delay
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (error) {
      console.error("Password reset error:", error);
      const errorMessage = error instanceof Error 
        ? getFirebaseErrorMessage(error, "email")
        : "An unexpected error occurred. Please try again.";
      setErrors({ general: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    router.push("/");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitting && !isSuccess && !codeError) {
      handleSubmit();
    }
  };

  if (codeError && !oobCode) {
    return (
      <section className="max-w-7xl mx-auto min-h-screen px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex flex-col justify-start gap-6 py-5">
            <h1 className="text-2xl font-bold text-white">GO-SIM</h1>
            <h1 className="text-6xl font-bold text-white">Reset Password</h1>
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{codeError}</p>
            </div>
            <button
              onClick={handleBackToLogin}
              className="w-full px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-white/90 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto min-h-screen px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex flex-col justify-start gap-6 py-5">
          <h1 className="text-2xl font-bold text-white">GO-SIM</h1>
          <h1 className="text-6xl font-bold text-white">Reset Password</h1>
          <div>
            <p className="text-white/60 text-base">
              Enter your new password below.
            </p>
          </div>

          {isSuccess ? (
            <div className="space-y-6">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-green-400 text-sm">
                  Password reset successfully! Redirecting to login...
                </p>
              </div>
              <button
                onClick={handleBackToLogin}
                className="w-full px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-white/90 transition-colors"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <div className="space-y-6" onKeyPress={handleKeyPress}>
              {/* Code Error Message */}
              {codeError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">{codeError}</p>
                </div>
              )}

              {/* Password Fields */}
              <div className="grid md:grid-row-1 gap-5">
                <InputField
                  name="password"
                  type="password"
                  label="New Password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={() => handleBlur("password")}
                  error={touched.password ? errors.password : ""}
                  required
                />

                <InputField
                  name="confirmPassword"
                  type="password"
                  label="Confirm New Password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  onBlur={() => handleBlur("confirmPassword")}
                  error={touched.confirmPassword ? errors.confirmPassword : ""}
                  required
                />
              </div>

              {/* General error message */}
              {errors.general && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">{errors.general}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.password.trim() || !formData.confirmPassword.trim() || !!codeError}
                className="w-full px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Resetting Password..." : "Reset Password"}
              </button>

              {/* Back to Login Link */}
              <div className="text-center">
                <button
                  onClick={handleBackToLogin}
                  className="text-sm text-white/80 hover:text-white transition-colors"
                >
                  ← Back to Login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
