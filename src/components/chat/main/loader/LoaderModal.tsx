"use client";

interface LoaderModalProps {
  isOpen: boolean;
  message?: string;
}

export default function LoaderModal({ isOpen, message = "Loading..." }: LoaderModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-white/8 bg-[#111]/98 shadow-xl p-5 animate-fade-in-up">
        <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-white">
                Starting a new conversation...
              </p>
              <p className="text-xs text-white/50">
                {message}
              </p>
            </div>
            <div className="w-full h-px bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/15 rounded-full animate-check-patterns-progress"
                style={{ width: "32%" }}
              />
            </div>
          </div>
      </div>
    </div>
  );
}
