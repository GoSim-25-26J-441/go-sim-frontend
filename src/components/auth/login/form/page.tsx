"use client";

import { InputField } from "@/components/common/inputFeild/page";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GoogleIcon from "../../../../../public/icon/google.png";

export default function Form() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [rememberMe, setRememberMe] = useState(false);

  // Load remembered email on component mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("gs_remembered_email");
    if (rememberedEmail) {
      setFormData((prev) => ({ ...prev, email: rememberedEmail }));
      setRememberMe(true);
    }
  }, []);

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

    try {
      // Handle remember me
      if (rememberMe) {
        localStorage.setItem("gs_remembered_email", formData.email);
      } else {
        localStorage.removeItem("gs_remembered_email");
      }

      // TODO: Replace with your actual sign-in API call
      console.log("Signing in with:", formData);

      // Example API call (uncomment and modify):
      // const response = await fetch('/api/auth/signin', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData),
      // });
      //
      // if (!response.ok) {
      //   throw new Error('Sign in failed');
      // }
      //
      // const data = await response.json();
      // // Store auth token
      // localStorage.setItem('gs_auth_token', data.token);

      // Success - redirect to dashboard
      alert("Sign in successful!");
      router.push("/dashboard");

      // Reset form
      setFormData({ email: rememberMe ? formData.email : "", password: "" });
      setTouched({});
      setErrors({});
    } catch (error) {
      console.error("Sign in error:", error);
      setErrors({ general: "Sign in failed. Please try again." });
    }
  };

  const handleGoogleSignIn = () => {
    router.push("/dashboard");
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

  const isFormValid = formData.email.trim() && formData.password.trim();

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
              disabled={!isFormValid}
              className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/80 transition-all disabled:bg-gray-600 disabled:text-white disabled:cursor-not-allowed"
            >
              Sign In
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
          className="flex flex-row justify-center gap-3 px-4 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-white/80 transition-all"
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
