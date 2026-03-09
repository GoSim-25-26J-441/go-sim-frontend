"use client";

/**
 * Full-page loading screen for "Check Anti Patterns" flow.
 * Used by /project/[id]/patterns/check to show animated loading while
 * fetching latest version and preparing the patterns view.
 */
export default function CheckPatternsLoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center min-h-screen w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16,185,129,0.12) 0%, transparent 50%), linear-gradient(180deg, #0f172a 0%, #020617 100%)",
      }}
    >
      {/* Animated rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-64 h-64 rounded-full border border-emerald-500/20"
          style={{ animation: "spin 12s linear infinite" }}
        />
        <div
          className="absolute w-48 h-48 rounded-full border border-emerald-400/25"
          style={{ animation: "spin 8s linear infinite reverse" }}
        />
        <div
          className="absolute w-32 h-32 rounded-full border border-emerald-300/30"
          style={{ animation: "spin 6s linear infinite" }}
        />
      </div>

      {/* Content card */}
      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 backdrop-blur-xl shadow-2xl shadow-black/40 p-8 animate-fade-in-up">
          <div className="flex flex-col items-center gap-6">
            {/* Icon with pulse */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping [animation-duration:2s]" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600/90 shadow-lg shadow-emerald-500/25">
                <svg
                  className="h-7 w-7 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-lg font-semibold text-white">
                Checking Anti-Patterns Patterns
              </h1>
              <p className="text-sm text-white/60">
                Loading your architecture and running anti-pattern detection…
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full w-[40%] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 animate-check-patterns-progress" />
            </div>

            {/* Step dots */}
            <div className="flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-emerald-500/60 animate-pulse [animation-duration:1.2s]"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
