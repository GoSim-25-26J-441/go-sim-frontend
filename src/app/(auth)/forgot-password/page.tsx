"use client";

import { InputField } from "@/components/common/inputFeild/page";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail } from "@/lib/firebase/auth";
import { isFirebaseInitialized } from "@/lib/firebase/config";
import { getFirebaseErrorMessage } from "@/utils/firebase-errors";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);

    // Clear error when user types
    if (errors.email) {
      setErrors((prev) => ({
        ...prev,
        email: "",
      }));
    }
  };

  const handleBlur = () => {
    setTouched((prev) => ({
      ...prev,
      email: true,
    }));
    validateEmail();
  };

  const validateEmail = (): boolean => {
    let error = "";
    
    if (!email.trim()) {
      error = "Please enter your email address";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error = "Please enter a valid email address";
    }

    setErrors((prev) => ({
      ...prev,
      email: error,
    }));

    return !error;
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
    // Validate email
    if (!validateEmail()) {
      setTouched({ email: true });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    // Check if Firebase is initialized
    if (!checkFirebaseInitialized()) {
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await sendPasswordResetEmail(email);

      if (error) {
        console.error("Password reset email error:", error);
        const errorMessage = getFirebaseErrorMessage(error, "email");
        if (errorMessage) {
          setErrors({ general: errorMessage });
        }
        setIsSubmitting(false);
        return;
      }

      // Success - show success message
      setIsSuccess(true);
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
    if (e.key === "Enter" && !isSubmitting && !isSuccess) {
      handleSubmit();
    }
  };

  return (
    <section className="max-w-7xl mx-auto min-h-screen px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex flex-col justify-start gap-6 py-5">
          <h1 className="text-2xl font-bold text-white">GO-SIM</h1>
          <h1 className="text-6xl font-bold text-white">Forgot Password</h1>
          <div>
            <p className="text-white/60 text-base">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {isSuccess ? (
            <div className="space-y-6">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-green-400 text-sm">
                  Password reset email sent! Please check your inbox and follow the instructions to reset your password.
                </p>
              </div>
              <button
                onClick={handleBackToLogin}
                className="w-full px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-white/90 transition-colors"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <div className="space-y-6" onKeyPress={handleKeyPress}>
              {/* Email Field */}
              <InputField
                name="email"
                type="email"
                label="Email address"
                placeholder="you@example.com"
                value={email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.email ? errors.email : ""}
                required
              />

              {/* General error message */}
              {errors.general && (
                <p className="text-red-400 text-sm">{errors.general}</p>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !email.trim()}
                className="w-full px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Sending..." : "Send Reset Link"}
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
