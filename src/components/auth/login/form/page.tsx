"use client";

import { InputField } from "@/components/common/inputFeild/page";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GoogleIcon from "../../../../../public/icon/google.png";
import { signInWithEmail, signInWithGoogle } from "@/lib/firebase/auth";
import { isFirebaseInitialized } from "@/lib/firebase/config";
import { useAuth } from "@/providers/auth-context";
import { AuthError } from "firebase/auth";

export default function Form() {
  const router = useRouter();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load remembered email on component mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("gs_remembered_email");
    if (rememberedEmail) {
      setFormData((prev) => ({ ...prev, email: rememberedEmail }));
      setRememberMe(true);
    }
  }, []);

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

    // Clear error when user types
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

    if (!value.trim()) {
      error = "Please fill this field";
    } else if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      error = "Please enter a valid email";
    } else if (field === "password" && value.length < 6) {
      error = "Password must be at least 6 characters";
    }

    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));

    return error;
  };

  const handleRememberMeToggle = () => {
    setRememberMe(!rememberMe);
  };

  const getFirebaseErrorMessage = (error: AuthError | Error): string => {
    // Check if it's a Firebase AuthError with a code
    if ('code' in error && error.code) {
      switch (error.code) {
        case "auth/user-not-found":
          return "No account found with this email address.";
        case "auth/wrong-password":
          return "Incorrect password. Please try again.";
        case "auth/invalid-email":
          return "Invalid email address.";
        case "auth/user-disabled":
          return "This account has been disabled.";
        case "auth/too-many-requests":
          return "Too many failed attempts. Please try again later.";
        case "auth/network-request-failed":
          return "Network error. Please check your connection.";
        default:
          console.error("Firebase auth error:", error.code, error);
          return "Sign in failed. Please try again.";
      }
    }
    
    // Handle non-Firebase errors (like Firebase not initialized)
    console.error("Authentication error:", error);
    if (error instanceof Error && error.message.includes("Firebase Auth is not initialized")) {
      return "Firebase authentication is not configured. Please check your environment variables.";
    }
    return "Sign in failed. Please try again.";
  };

  const handleSubmit = async () => {
    // Validate all fields
    const newErrors: Record<string, string> = {};
    Object.keys(formData).forEach((field) => {
      const error = validateField(field);
      if (error) newErrors[field] = error;
    });

    setTouched({
      email: true,
      password: true,
    });

    // If there are errors, don't submit
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Check if Firebase is initialized
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
        setIsSubmitting(false);
        return;
      }

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem("gs_remembered_email", formData.email);
      } else {
        localStorage.removeItem("gs_remembered_email");
      }

      // Sign in with Firebase
      const { user, error } = await signInWithEmail(formData.email, formData.password);

      if (error) {
        console.error("Sign in error details:", error);
        setErrors({ general: getFirebaseErrorMessage(error) });
        setIsSubmitting(false);
        return;
      }

      if (user) {
        // AuthProvider will handle the redirect via useEffect
        // Reset form
        setFormData({ email: rememberMe ? formData.email : "", password: "" });
        setTouched({});
        setErrors({});
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Sign in error:", error);
      setErrors({ general: "An unexpected error occurred. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrors({});

    // Check if Firebase is initialized
    if (!isFirebaseInitialized) {
      console.error("Firebase is not initialized. Please check your environment variables.");
      setErrors({ 
        general: "Firebase authentication is not configured. Please check your .env.local file and restart the development server." 
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const { user, error } = await signInWithGoogle();

      if (error) {
        // Handle user cancellation gracefully
        if ('code' in error && (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request")) {
          // User closed the popup, don't show error
          setIsSubmitting(false);
          return;
        }
        setErrors({ general: getFirebaseErrorMessage(error) });
        setIsSubmitting(false);
        return;
      }

      if (user) {
        // AuthProvider will handle the redirect via useEffect
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Google sign in error:", error);
      setErrors({ general: "Google sign in failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    router.push("/forgot-password");
  };

  const handleCreateAccount = () => {
    router.push("/signup");
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const isFormValid = formData.email.trim() && formData.password.trim() && !isSubmitting;

  return (
    <section className="px-4 sm:px-6 lg:px-8" onKeyPress={handleKeyPress}>
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col justify-start gap-6 py-5">
          <h1 className="text-2xl font-bold text-white">GO-SIM</h1>
          <h1 className="text-6xl font-bold text-white">Sign in</h1>
          <div>
            <p className="text-xs font-normal text-white/80 mb-2">
              Access your projects and simulations.
            </p>
            <div className="bg-white w-full h-0.5" />
          </div>
        </div>

        <div className="space-y-6">
          {/* Email and Password Fields */}
          <div className="grid md:grid-row-1 gap-5">
            <InputField
              name="email"
              type="email"
              label="Email address"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              onBlur={() => handleBlur("email")}
              error={touched.email ? errors.email : ""}
              required
            />

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
          </div>

          {/* General error message */}
          {errors.general && (
            <p className="text-red-400 text-sm">{errors.general}</p>
          )}

          {/* Remember Me & Forgot Password */}
          <div className="flex flex-row justify-between items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={handleRememberMeToggle}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
              />
              <span className="text-xs font-normal text-white/80">
                Remember me
              </span>
            </label>
            <button
              onClick={handleForgotPassword}
              className="text-xs font-bold text-white hover:text-white/80 transition-colors"
            >
              Forgot password?
            </button>
          </div>

          {/* Submit Button */}
          <div className="flex flex-col justify-center pt-2">
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/80 transition-all disabled:bg-gray-600 disabled:text-white disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>

      {/* Create Account Link */}
      <div className="flex justify-center items-center my-10">
        <p className="text-sm font-normal text-white/90">
          New to GO-SIM?{" "}
          <button
            onClick={handleCreateAccount}
            className="font-bold text-white hover:text-white/80 transition-colors"
          >
            Create an account
          </button>
        </p>
      </div>

      {/* Divider */}
      <div className="flex flex-row justify-center items-center my-10 gap-4">
        <div className="bg-white w-full h-0.5" />
        <p className="text-sm font-normal text-white/90">OR</p>
        <div className="bg-white w-full h-0.5" />
      </div>

      {/* Google Sign In */}
      <div className="flex flex-col">
        <button
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="flex flex-row justify-center gap-3 px-4 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-white/80 transition-all disabled:bg-gray-600 disabled:text-white disabled:cursor-not-allowed"
        >
          <Image
            src={GoogleIcon}
            alt="Google icon"
            width={16}
            height={16}
            className="object-contain"
          />
          Continue with Google
        </button>
      </div>

      {/* Terms & Privacy */}
      <div className="flex flex-col text-white/90 justify-center items-center my-10">
        <p className="text-xs font-normal leading-relaxed text-center">
          By signing in,
        </p>
        <p className="text-xs font-normal leading-relaxed text-center">
          you agree to our{" "}
          <a
            href="/terms"
            className="font-bold text-white hover:text-white/80 transition-colors"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="font-bold text-white hover:text-white/80 transition-colors"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </section>
  );
}
