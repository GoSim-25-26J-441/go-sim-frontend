"use client";

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

const COOKIE = "gs_cookie_consent";
const DAYS = 180;

export default function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const has = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${COOKIE}=`));
    if (!has) setOpen(true);
  }, []);

  if (!open) return null;

  function accept() {
    const expires = new Date(
      Date.now() + DAYS * 24 * 60 * 60 * 1000
    ).toUTCString();
    document.cookie = `${COOKIE}=accepted; expires=${expires}; path=/; SameSite=Lax`;
    setOpen(false);
  }

  function decline() {
    setOpen(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
      {/* Full-width white bar */}
      <div className="w-full bg-white border-t border-black/10 shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 relative">
          {/* Close button */}
          <button
            onClick={decline}
            className="absolute right-4 top-3 sm:right-6 sm:top-4 text-black/50 hover:text-black transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            {/* Icon */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl border border-black/10 bg-black/[0.03] flex items-center justify-center">
                <Cookie className="w-5 h-5 text-black" />
              </div>

              <div className="md:hidden">
                <h3 className="text-base font-bold text-black">Cookie Settings</h3>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="hidden md:block text-base font-bold text-black">
                Cookie Settings
              </h3>

              <p className="text-sm text-black/70 leading-relaxed mt-1">
                We use essential cookies to make GO-SIM work properly and improve
                your experience. By clicking <span className="font-semibold text-black">Accept</span>,
                you agree to our use of cookies. Learn more in our{" "}
                <a
                  href="/privacy"
                  className="text-black underline underline-offset-4 hover:text-black/80 transition-colors"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 text-xm font-bold md:justify-end md:items-center">
              <button
                onClick={accept}
                className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-black/90 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={decline}
                className="px-5 py-2.5 bg-white text-black rounded-lg border border-black/20 hover:bg-black/[0.03] transition-colors"
              >
                Decline
              </button>
              <a
                href="/privacy"
                className="px-5 py-2.5 text-black/70 hover:text-black rounded-lg hover:bg-black/[0.03] transition-colors text-center"
              >
                Preferences
              </a>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.35s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
