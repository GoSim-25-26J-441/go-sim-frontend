"use client";
import RightSection from "@/components/auth/signUp/rightSection/page";
import SignUpForm from "@/components/auth/signUp/signUpForm/page";

export default function Signup() {
  return (
    <section className="max-w-7xl mx-auto min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
      <div className="grid lg:grid-cols-2 gap-12 items-center py-10 lg:py-0">
        {/* Left */}
        <div>
          <SignUpForm />
        </div>
        {/* Right */}
        <div className="flex flex-col justify-between space-y-8 pl-10 h-full relative overflow-hidden">
          <div
            className="absolute left-0 w-0.5 bg-white animate-grow-center"
            style={{ height: "100%" }}
          ></div>
          <RightSection />
        </div>
      </div>

      <style jsx>{`
        @keyframes grow-center {
          from {
            height: 0%;
            opacity: 0;
          }
          to {
            height: 100%;
            opacity: 1;
          }
        }
        .animate-grow-center {
          animation: grow-center 1.5s ease-out forwards;
        }
      `}</style>
    </section>
  );
}
