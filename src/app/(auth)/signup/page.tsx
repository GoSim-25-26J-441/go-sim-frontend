"use client";
import RightSection from "@/components/auth/signUp/rightSection/page";
import SignUpForm from "@/components/auth/signUp/signUpForm/page";

export default function Signup() {
  return (
    <section className="max-w-7xl mx-auto min-h-screen">
      <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-0 py-10 lg:py-0">
        
        {/* Left - Sign Up Form */}
        <div className="flex flex-col justify-center py-10 lg:py-20">
          <SignUpForm />
        </div>

        {/* Vertical Line - Desktop Only */}
        <div className="hidden lg:block relative w-px bg-white/30 my-20">
          <div className="absolute top-0 left-0 w-px bg-white animate-grow-center"></div>
        </div>

        {/* Horizontal Line - Mobile Only */}
        <div className="lg:hidden w-full h-px bg-white/30 my-10 relative">
          <div className="absolute left-0 top-0 h-px bg-white animate-grow-horizontal"></div>
        </div>

        {/* Right - Additional Info */}
        <div className="flex flex-col justify-center py-10 px-5 lg:px-1 lg:py-20 lg:pl-12">
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
        @keyframes grow-horizontal {
          from {
            width: 0%;
            opacity: 0;
          }
          to {
            width: 100%;
            opacity: 1;
          }
        }
        .animate-grow-center {
          transform-origin: top;
          animation: grow-center 1.5s ease-out forwards;
        }
        .animate-grow-horizontal {
          transform-origin: left;
          animation: grow-horizontal 1.5s ease-out forwards;
        }
      `}</style>
    </section>
  );
}